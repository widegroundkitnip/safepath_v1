use std::collections::HashMap;
use std::path::Path;

use uuid::Uuid;

use crate::analyzer::classify_entry;
use crate::rules::{describe_conditions, rule_matches};
use crate::templates::render_destination_template;
use crate::types::{
    ActionExplanationDto, AnalysisSummaryDto, ConflictKind, DuplicateCertainty, DuplicateGroupDto,
    FallbackBehavior, FileCategory, ManifestEntryDto, ManifestEntryKind, PlanDto,
    PlanDuplicateGroupDto, PlanSummaryDto, PlannedActionDto, PlannedActionKind,
    PresetDefinitionDto, ProjectSafetyMode, ProtectionDetectionDto, ProtectionState, ReviewState,
    SafetyFlag,
};

#[derive(Debug, Clone, Copy)]
struct DuplicateMembership<'a> {
    certainty: DuplicateCertainty,
    group_id: &'a str,
}

pub fn build_plan(
    job_id: &str,
    entries: &[ManifestEntryDto],
    analysis_summary: &AnalysisSummaryDto,
    preset: &PresetDefinitionDto,
    destination_roots: &[String],
) -> Result<PlanDto, String> {
    let destination_root = destination_roots.first().cloned().ok_or_else(|| {
        "Select at least one destination folder before building a plan.".to_string()
    })?;
    let duplicate_lookup = duplicate_lookup(&analysis_summary.likely_duplicate_groups);
    let entry_lookup = entries
        .iter()
        .map(|entry| (entry.entry_id.clone(), entry))
        .collect::<HashMap<_, _>>();

    let mut actions = Vec::new();

    for entry in entries
        .iter()
        .filter(|entry| entry.entry_kind == ManifestEntryKind::File)
    {
        let category = classify_entry(entry);
        let mut safety_flags = Vec::new();
        let duplicate_membership = duplicate_lookup.get(&entry.entry_id).copied();
        let duplicate_tier = duplicate_membership.map(|membership| membership.certainty);
        let protection = strongest_protection(entry, &analysis_summary.detected_protections);

        if duplicate_tier.is_some() {
            safety_flags.push(SafetyFlag::Duplicate);
        }
        if category == FileCategory::Unknown {
            safety_flags.push(SafetyFlag::UnknownFile);
        }
        if entry.extension.is_none() {
            safety_flags.push(SafetyFlag::NoExtension);
        }
        if protection.is_some() {
            safety_flags.push(SafetyFlag::Protected);
        }

        let action = if let Some(blocked) = blocked_by_protection(
            entry,
            preset,
            protection,
            &safety_flags,
            duplicate_tier,
            duplicate_membership.map(|membership| membership.group_id.to_string()),
        ) {
            blocked
        } else if duplicate_tier.is_some()
            && preset.preset_id != "duplicate_review"
            && !matches!(
                preset.plan_options.duplicate_policy,
                crate::types::DuplicatePolicy::Informational
            )
        {
            needs_choice_action(
                entry,
                preset,
                safety_flags.clone(),
                duplicate_tier,
                protection.map(|item| item.state),
                duplicate_membership.map(|membership| membership.group_id.to_string()),
            )
        } else {
            apply_rules(
                entry,
                category,
                duplicate_tier.is_some(),
                preset,
                &destination_root,
                safety_flags.clone(),
                duplicate_tier,
                protection.map(|item| item.state),
                duplicate_membership.map(|membership| membership.group_id.to_string()),
            )?
        };

        actions.push(action);
    }

    resolve_destination_conflicts(&mut actions);
    let duplicate_groups = build_duplicate_groups(
        &analysis_summary.likely_duplicate_groups,
        &actions,
        &entry_lookup,
    );
    let (move_actions, review_actions, blocked_actions, skipped_actions) =
        summarize_actions(&actions);
    let total_actions = actions.len() as u32;
    Ok(PlanDto {
        plan_id: Uuid::new_v4().to_string(),
        job_id: job_id.to_string(),
        preset_id: preset.preset_id.clone(),
        preset_name: preset.name.clone(),
        destination_root,
        plan_options: preset.plan_options.clone(),
        summary: PlanSummaryDto {
            total_actions,
            move_actions,
            review_actions,
            blocked_actions,
            skipped_actions,
        },
        duplicate_groups,
        actions,
    })
}

fn apply_rules(
    entry: &ManifestEntryDto,
    category: FileCategory,
    in_duplicate_group: bool,
    preset: &PresetDefinitionDto,
    destination_root: &str,
    safety_flags: Vec<SafetyFlag>,
    duplicate_tier: Option<DuplicateCertainty>,
    protection_state: Option<ProtectionState>,
    duplicate_group_id: Option<String>,
) -> Result<PlannedActionDto, String> {
    let mut rules = preset.rule_set.rules.clone();
    rules.sort_by(|left, right| right.priority.cmp(&left.priority));

    for rule in rules {
        if !rule_matches(&rule.conditions, entry, category, in_duplicate_group) {
            continue;
        }

        let matched_conditions = describe_conditions(&rule.conditions);
        let (
            destination_path,
            previewed_template_output,
            conflict_status,
            blocked_reason,
            template_error,
        ) = match rule.action_kind {
            PlannedActionKind::Move => {
                let template = rule.destination_template.clone().ok_or_else(|| {
                    format!("Rule `{}` is missing a destination template.", rule.rule_id)
                })?;
                match render_destination_template(&template, entry) {
                    Ok(rendered) => (
                        Some(join_destination(
                            destination_root,
                            &rendered.relative_path,
                            &entry.name,
                        )),
                        Some(rendered.relative_path),
                        None,
                        None,
                        None,
                    ),
                    Err(error) => (
                        None,
                        None,
                        Some(ConflictKind::TemplateConflict),
                        Some(error.clone()),
                        Some(error),
                    ),
                }
            }
            PlannedActionKind::Review | PlannedActionKind::Skip => (None, None, None, None, None),
        };

        let review_state = match (rule.action_kind, conflict_status) {
            (_, Some(_)) => ReviewState::Blocked,
            (PlannedActionKind::Move, None) => ReviewState::Pending,
            (PlannedActionKind::Review, None) => ReviewState::NeedsChoice,
            (PlannedActionKind::Skip, None) => ReviewState::Pending,
        };

        return Ok(PlannedActionDto {
            action_id: Uuid::new_v4().to_string(),
            source_entry_id: entry.entry_id.clone(),
            source_path: entry.path.clone(),
            destination_path: destination_path.clone(),
            duplicate_group_id,
            action_kind: if conflict_status.is_some() {
                PlannedActionKind::Skip
            } else {
                rule.action_kind
            },
            review_state,
            explanation: ActionExplanationDto {
                matched_preset: preset.preset_id.clone(),
                matched_rule: Some(rule.rule_id),
                matched_conditions,
                rule_priority: Some(rule.priority),
                confidence: if conflict_status.is_some() {
                    0.25
                } else if safety_flags.is_empty() {
                    0.96
                } else {
                    0.84
                },
                safety_flags,
                duplicate_tier,
                protection_state,
                blocked_reason,
                destination_root: Some(destination_root.to_string()),
                template_used: rule.destination_template,
                template_error,
                previewed_template_output,
                destination_conflict_path: None,
                conflict_status,
                notes: vec![
                    rule.explanation,
                    format!("Matched {} condition(s).", rule.conditions.len()),
                ],
            },
        });
    }

    Ok(fallback_action(
        entry,
        preset,
        safety_flags,
        duplicate_tier,
        protection_state,
        duplicate_group_id,
    ))
}

fn fallback_action(
    entry: &ManifestEntryDto,
    preset: &PresetDefinitionDto,
    safety_flags: Vec<SafetyFlag>,
    duplicate_tier: Option<DuplicateCertainty>,
    protection_state: Option<ProtectionState>,
    duplicate_group_id: Option<String>,
) -> PlannedActionDto {
    let note = match preset.plan_options.fallback_behavior {
        FallbackBehavior::Skip => "No safe rule matched, so the entry remains skipped.",
    };
    PlannedActionDto {
        action_id: Uuid::new_v4().to_string(),
        source_entry_id: entry.entry_id.clone(),
        source_path: entry.path.clone(),
        destination_path: None,
        duplicate_group_id,
        action_kind: PlannedActionKind::Skip,
        review_state: ReviewState::Pending,
        explanation: ActionExplanationDto {
            matched_preset: preset.preset_id.clone(),
            matched_rule: None,
            matched_conditions: Vec::new(),
            rule_priority: None,
            confidence: 0.5,
            safety_flags,
            duplicate_tier,
            protection_state,
            blocked_reason: None,
            destination_root: None,
            template_used: None,
            template_error: None,
            previewed_template_output: None,
            destination_conflict_path: None,
            conflict_status: None,
            notes: vec![note.to_string()],
        },
    }
}

fn blocked_by_protection(
    entry: &ManifestEntryDto,
    preset: &PresetDefinitionDto,
    protection: Option<&ProtectionDetectionDto>,
    safety_flags: &[SafetyFlag],
    duplicate_tier: Option<DuplicateCertainty>,
    duplicate_group_id: Option<String>,
) -> Option<PlannedActionDto> {
    let protection = protection?;
    let should_block = match protection.state {
        ProtectionState::UserProtected | ProtectionState::AutoDetectedHigh => true,
        ProtectionState::AutoDetectedMedium => {
            matches!(
                preset.plan_options.project_safety_mode,
                ProjectSafetyMode::Strict
            )
        }
        ProtectionState::AutoDetectedLow | ProtectionState::Unprotected => false,
    };

    if !should_block {
        return None;
    }

    Some(PlannedActionDto {
        action_id: Uuid::new_v4().to_string(),
        source_entry_id: entry.entry_id.clone(),
        source_path: entry.path.clone(),
        destination_path: None,
        duplicate_group_id,
        action_kind: PlannedActionKind::Skip,
        review_state: ReviewState::Blocked,
        explanation: ActionExplanationDto {
            matched_preset: preset.preset_id.clone(),
            matched_rule: None,
            matched_conditions: Vec::new(),
            rule_priority: None,
            confidence: 0.1,
            safety_flags: safety_flags.to_vec(),
            duplicate_tier,
            protection_state: Some(protection.state),
            blocked_reason: Some(
                protection
                    .reasons
                    .first()
                    .cloned()
                    .unwrap_or_else(|| "Protection policy blocked the action.".to_string()),
            ),
            destination_root: None,
            template_used: None,
            template_error: None,
            previewed_template_output: None,
            destination_conflict_path: None,
            conflict_status: Some(ConflictKind::ProtectionConflict),
            notes: vec!["Protection checks run before any planning rules.".to_string()],
        },
    })
}

fn needs_choice_action(
    entry: &ManifestEntryDto,
    preset: &PresetDefinitionDto,
    safety_flags: Vec<SafetyFlag>,
    duplicate_tier: Option<DuplicateCertainty>,
    protection_state: Option<ProtectionState>,
    duplicate_group_id: Option<String>,
) -> PlannedActionDto {
    PlannedActionDto {
        action_id: Uuid::new_v4().to_string(),
        source_entry_id: entry.entry_id.clone(),
        source_path: entry.path.clone(),
        destination_path: None,
        duplicate_group_id,
        action_kind: PlannedActionKind::Review,
        review_state: ReviewState::NeedsChoice,
        explanation: ActionExplanationDto {
            matched_preset: preset.preset_id.clone(),
            matched_rule: None,
            matched_conditions: Vec::new(),
            rule_priority: None,
            confidence: 0.2,
            safety_flags,
            duplicate_tier,
            protection_state,
            blocked_reason: Some(
                "Duplicate candidates need explicit review before Safepath proposes a move."
                    .to_string(),
            ),
            destination_root: None,
            template_used: None,
            template_error: None,
            previewed_template_output: None,
            destination_conflict_path: None,
            conflict_status: Some(ConflictKind::NeedsUserChoice),
            notes: vec!["Duplicate state takes precedence over routing rules.".to_string()],
        },
    }
}

fn resolve_destination_conflicts(actions: &mut [PlannedActionDto]) {
    let mut destination_groups: HashMap<String, Vec<usize>> = HashMap::new();
    for (index, action) in actions.iter().enumerate() {
        if action.action_kind == PlannedActionKind::Move {
            if let Some(destination_path) = &action.destination_path {
                destination_groups
                    .entry(destination_path.clone())
                    .or_default()
                    .push(index);
            }
        }
    }

    for (destination_path, indexes) in destination_groups {
        let conflict_reason = if indexes
            .iter()
            .any(|index| actions[*index].source_path == destination_path)
        {
            Some("The planned destination matches the current source path.".to_string())
        } else if indexes.len() > 1 {
            Some("Multiple planned actions target the same destination path.".to_string())
        } else if Path::new(&destination_path).exists() {
            Some("A file already exists at the planned destination path.".to_string())
        } else {
            None
        };

        if let Some(reason) = conflict_reason {
            for index in indexes {
                mark_destination_conflict(&mut actions[index], &destination_path, &reason);
            }
        }
    }
}

fn mark_destination_conflict(action: &mut PlannedActionDto, destination_path: &str, reason: &str) {
    action.action_kind = PlannedActionKind::Skip;
    action.review_state = ReviewState::Blocked;
    action.explanation.conflict_status = Some(ConflictKind::DestinationConflict);
    action.explanation.blocked_reason = Some(reason.to_string());
    action.explanation.destination_conflict_path = Some(destination_path.to_string());
    action
        .explanation
        .notes
        .push("Destination conflict resolution blocked this action.".to_string());
}

fn summarize_actions(actions: &[PlannedActionDto]) -> (u32, u32, u32, u32) {
    let mut move_actions = 0_u32;
    let mut review_actions = 0_u32;
    let mut blocked_actions = 0_u32;
    let mut skipped_actions = 0_u32;

    for action in actions {
        match action.action_kind {
            PlannedActionKind::Move => move_actions += 1,
            PlannedActionKind::Review => review_actions += 1,
            PlannedActionKind::Skip => match action.review_state {
                ReviewState::Blocked => blocked_actions += 1,
                _ => skipped_actions += 1,
            },
        }
    }

    (
        move_actions,
        review_actions,
        blocked_actions,
        skipped_actions,
    )
}

fn duplicate_lookup<'a>(
    groups: &'a [DuplicateGroupDto],
) -> HashMap<String, DuplicateMembership<'a>> {
    let mut lookup = HashMap::new();
    for group in groups {
        for member in &group.members {
            lookup.insert(
                member.entry_id.clone(),
                DuplicateMembership {
                    certainty: group.certainty,
                    group_id: &group.group_id,
                },
            );
        }
    }
    lookup
}

fn build_duplicate_groups(
    analysis_groups: &[DuplicateGroupDto],
    actions: &[PlannedActionDto],
    entry_lookup: &HashMap<String, &ManifestEntryDto>,
) -> Vec<PlanDuplicateGroupDto> {
    let action_by_entry = actions
        .iter()
        .map(|action| (action.source_entry_id.clone(), action))
        .collect::<HashMap<_, _>>();

    analysis_groups
        .iter()
        .filter_map(|group| {
            let member_actions = group
                .members
                .iter()
                .filter_map(|member| action_by_entry.get(&member.entry_id))
                .collect::<Vec<_>>();

            if member_actions.is_empty() {
                return None;
            }

            let recommended_keeper_entry_id = member_actions
                .iter()
                .filter_map(|action| entry_lookup.get(&action.source_entry_id).copied())
                .max_by_key(|entry| {
                    entry
                        .modified_at_epoch_ms
                        .or(entry.created_at_epoch_ms)
                        .unwrap_or_default()
                })
                .map(|entry| entry.entry_id.clone());

            Some(PlanDuplicateGroupDto {
                group_id: group.group_id.clone(),
                certainty: group.certainty,
                representative_name: group.representative_name.clone(),
                item_count: member_actions.len() as u32,
                member_action_ids: member_actions
                    .iter()
                    .map(|action| action.action_id.clone())
                    .collect(),
                member_entry_ids: member_actions
                    .iter()
                    .map(|action| action.source_entry_id.clone())
                    .collect(),
                selected_keeper_entry_id: None,
                recommended_keeper_entry_id,
                recommended_keeper_reason: Some(
                    "Newest available file is the default keeper suggestion.".to_string(),
                ),
            })
        })
        .collect()
}

fn strongest_protection<'a>(
    entry: &ManifestEntryDto,
    protections: &'a [ProtectionDetectionDto],
) -> Option<&'a ProtectionDetectionDto> {
    protections
        .iter()
        .filter(|detection| path_is_within(&entry.path, &detection.path))
        .max_by(|left, right| {
            left.path
                .len()
                .cmp(&right.path.len())
                .then_with(|| protection_rank(left.state).cmp(&protection_rank(right.state)))
        })
}

fn protection_rank(state: ProtectionState) -> u8 {
    match state {
        ProtectionState::UserProtected => 5,
        ProtectionState::AutoDetectedHigh => 4,
        ProtectionState::AutoDetectedMedium => 3,
        ProtectionState::AutoDetectedLow => 2,
        ProtectionState::Unprotected => 1,
    }
}

fn path_is_within(path: &str, ancestor: &str) -> bool {
    path == ancestor
        || path
            .strip_prefix(ancestor)
            .map(|suffix| suffix.starts_with('/'))
            .unwrap_or(false)
}

fn join_destination(root: &str, rendered_template: &str, filename: &str) -> String {
    let root = root.trim_end_matches('/');
    if rendered_template.is_empty() {
        format!("{root}/{filename}")
    } else {
        format!("{root}/{rendered_template}/{filename}")
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::build_plan;
    use crate::presets::get_preset;
    use crate::types::{
        AnalysisSummaryDto, ChecksumMode, DuplicatePolicy, FallbackBehavior, FileCategory,
        ManifestEntryDto, ManifestEntryKind, PlanOptionsDto, PlannedActionKind,
        PresetDefinitionDto, ProjectSafetyMode, ProtectionDetectionDto, ProtectionOverrideDto,
        ProtectionState, ReviewMode, ReviewState, RuleConditionDto, RuleDto, RuleSetDto,
        StructureSignalDto,
    };
    use uuid::Uuid;

    #[test]
    fn general_organize_moves_images_into_dated_folders() {
        let preset = get_preset("general_organize").expect("preset");
        let entry = manifest_entry(
            "image-1",
            "/source/photo.jpg",
            "photo.jpg",
            Some("jpg"),
            1_704_067_200_000,
        );
        let analysis = empty_analysis("job-1");

        let plan = build_plan(
            "job-1",
            &[entry],
            &analysis,
            &preset,
            &["/dest".to_string()],
        )
        .expect("build plan");

        assert_eq!(plan.summary.move_actions, 1);
        assert_eq!(
            plan.actions[0].destination_path.as_deref(),
            Some("/dest/Images/2024/01/photo.jpg")
        );
    }

    #[test]
    fn duplicate_review_creates_review_actions() {
        let preset = get_preset("duplicate_review").expect("preset");
        let entry = manifest_entry(
            "dup-1",
            "/source/dup.txt",
            "dup.txt",
            Some("txt"),
            1_704_067_200_000,
        );
        let mut analysis = empty_analysis("job-2");
        analysis.likely_duplicate_groups = vec![crate::types::DuplicateGroupDto {
            group_id: "group-1".to_string(),
            certainty: crate::types::DuplicateCertainty::Definite,
            representative_name: "dup.txt".to_string(),
            size_bytes: 42,
            item_count: 2,
            members: vec![crate::types::DuplicateMemberDto {
                entry_id: "dup-1".to_string(),
                path: "/source/dup.txt".to_string(),
            }],
        }];

        let plan = build_plan(
            "job-2",
            &[entry],
            &analysis,
            &preset,
            &["/dest".to_string()],
        )
        .expect("build plan");

        assert_eq!(plan.summary.review_actions, 1);
        assert_eq!(plan.actions[0].action_kind, PlannedActionKind::Review);
        assert_eq!(plan.actions[0].review_state, ReviewState::NeedsChoice);
    }

    #[test]
    fn protected_entries_block_project_safe_moves() {
        let preset = get_preset("project_safe").expect("preset");
        let entry = manifest_entry(
            "doc-1",
            "/source/project/report.pdf",
            "report.pdf",
            Some("pdf"),
            1_704_067_200_000,
        );
        let mut analysis = empty_analysis("job-3");
        analysis.detected_protections = vec![ProtectionDetectionDto {
            path: "/source/project".to_string(),
            state: ProtectionState::AutoDetectedHigh,
            boundary_kind: crate::types::BoundaryKind::ProjectRoot,
            confidence: Some(0.9),
            markers: vec!["package.json".to_string()],
            reasons: vec!["Project manifest files indicate a likely code or app root.".to_string()],
        }];

        let plan = build_plan(
            "job-3",
            &[entry],
            &analysis,
            &preset,
            &["/dest".to_string()],
        )
        .expect("build plan");

        assert_eq!(plan.summary.blocked_actions, 1);
        assert_eq!(plan.actions[0].review_state, ReviewState::Blocked);
    }

    #[test]
    fn detects_destination_collisions_between_actions() {
        let preset = get_preset("general_organize").expect("preset");
        let entries = vec![
            manifest_entry(
                "image-1",
                "/source/a/photo.jpg",
                "photo.jpg",
                Some("jpg"),
                1_704_067_200_000,
            ),
            manifest_entry(
                "image-2",
                "/source/b/photo.jpg",
                "photo.jpg",
                Some("jpg"),
                1_704_067_200_000,
            ),
        ];

        let plan = build_plan(
            "job-4",
            &entries,
            &empty_analysis("job-4"),
            &preset,
            &["/dest".to_string()],
        )
        .expect("build plan");

        assert_eq!(plan.summary.blocked_actions, 2);
        assert!(plan.actions.iter().all(|action| {
            action.explanation.conflict_status
                == Some(crate::types::ConflictKind::DestinationConflict)
        }));
    }

    #[test]
    fn blocks_invalid_template_output() {
        let preset = invalid_template_preset();
        let entry = manifest_entry(
            "doc-2",
            "/source/report.pdf",
            "report.pdf",
            Some("pdf"),
            1_704_067_200_000,
        );

        let plan = build_plan(
            "job-5",
            &[entry],
            &empty_analysis("job-5"),
            &preset,
            &["/dest".to_string()],
        )
        .expect("build plan");

        assert_eq!(plan.summary.blocked_actions, 1);
        assert_eq!(
            plan.actions[0].explanation.conflict_status,
            Some(crate::types::ConflictKind::TemplateConflict)
        );
        assert!(plan.actions[0]
            .explanation
            .template_error
            .as_deref()
            .is_some_and(|error| error.contains("parent-directory")));
    }

    #[test]
    fn blocks_when_destination_file_already_exists() {
        let preset = get_preset("general_organize").expect("preset");
        let temp_dir = std::env::temp_dir().join(format!("safepath-plan-{}", Uuid::new_v4()));
        let existing_folder = temp_dir.join("Images/2024/01");
        fs::create_dir_all(&existing_folder).expect("create destination folder");
        fs::write(existing_folder.join("photo.jpg"), b"existing").expect("write destination file");

        let entry = manifest_entry(
            "image-3",
            "/source/photo.jpg",
            "photo.jpg",
            Some("jpg"),
            1_704_067_200_000,
        );
        let plan = build_plan(
            "job-6",
            &[entry],
            &empty_analysis("job-6"),
            &preset,
            &[temp_dir.to_string_lossy().to_string()],
        )
        .expect("build plan");

        assert_eq!(plan.summary.blocked_actions, 1);
        assert_eq!(
            plan.actions[0].explanation.conflict_status,
            Some(crate::types::ConflictKind::DestinationConflict)
        );

        let _ = fs::remove_dir_all(temp_dir);
    }

    fn empty_analysis(job_id: &str) -> AnalysisSummaryDto {
        AnalysisSummaryDto {
            job_id: job_id.to_string(),
            category_counts: vec![crate::types::CategoryCountDto {
                category: FileCategory::Document,
                count: 1,
            }],
            structure_signals: Vec::<StructureSignalDto>::new(),
            unknown_count: 0,
            no_extension_count: 0,
            likely_duplicate_groups: Vec::new(),
            skipped_large_synthetic_files: 0,
            detected_protections: Vec::new(),
            protection_overrides: Vec::<ProtectionOverrideDto>::new(),
        }
    }

    fn manifest_entry(
        entry_id: &str,
        path: &str,
        name: &str,
        extension: Option<&str>,
        modified_at_epoch_ms: i64,
    ) -> ManifestEntryDto {
        ManifestEntryDto {
            entry_id: entry_id.to_string(),
            job_id: "job".to_string(),
            source_root: "/source".to_string(),
            path: path.to_string(),
            relative_path: name.to_string(),
            name: name.to_string(),
            entry_kind: ManifestEntryKind::File,
            size_bytes: 42,
            extension: extension.map(|value| value.to_string()),
            is_hidden: false,
            created_at_epoch_ms: Some(modified_at_epoch_ms),
            modified_at_epoch_ms: Some(modified_at_epoch_ms),
        }
    }

    fn invalid_template_preset() -> PresetDefinitionDto {
        PresetDefinitionDto {
            preset_id: "invalid_template".to_string(),
            name: "Invalid Template".to_string(),
            description: "Test preset".to_string(),
            rule_set: RuleSetDto {
                rule_set_id: "invalid_template_rules".to_string(),
                name: "Invalid template".to_string(),
                rules: vec![RuleDto {
                    rule_id: "bad_rule".to_string(),
                    name: "Bad rule".to_string(),
                    priority: 100,
                    conditions: vec![RuleConditionDto::Always],
                    action_kind: PlannedActionKind::Move,
                    destination_template: Some("../Outside".to_string()),
                    explanation: "This template should fail validation.".to_string(),
                }],
            },
            plan_options: PlanOptionsDto {
                checksum_mode: ChecksumMode::Off,
                duplicate_policy: DuplicatePolicy::FlagOnly,
                review_mode: ReviewMode::Standard,
                project_safety_mode: ProjectSafetyMode::On,
                fallback_behavior: FallbackBehavior::Skip,
            },
        }
    }
}
