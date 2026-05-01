use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::Path;

use uuid::Uuid;

use crate::analyzer::classify_entry;
use crate::duplicate_config::{KeeperPreference, KeeperStrategySettings};
use crate::pathing::{disambiguated_filename, join_path, normalize_display_path, path_is_within};
use crate::rules::{describe_conditions, rule_matches};
use crate::templates::render_destination_template;
use crate::types::{
    ActionExplanationDto, AnalysisSummaryDto, ConflictKind, DuplicateCertainty, DuplicateGroupDto,
    FallbackBehavior, FileCategory, LearnerObservationDto, ManifestEntryDto, ManifestEntryKind,
    PlanDto, PlanDuplicateGroupDto, PlanSummaryDto, PlannedActionDto, PlannedActionKind,
    PresetDefinitionDto, ProjectSafetyMode, ProtectionDetectionDto, ProtectionState, ReviewState,
    SafetyFlag,
};

#[derive(Debug, Clone, Copy)]
struct DuplicateMembership<'a> {
    certainty: DuplicateCertainty,
    group_id: &'a str,
}

#[derive(Debug, Clone, Copy, Default)]
struct DuplicateKeeperHistorySummary {
    observation_count: u32,
    disagreement_rate: f32,
}

#[derive(Debug, Clone)]
struct DuplicateKeeperRecommendation {
    entry_id: String,
    confidence: f32,
    reason: String,
    reason_tags: Vec<String>,
}

pub fn build_plan(
    job_id: &str,
    entries: &[ManifestEntryDto],
    analysis_summary: &AnalysisSummaryDto,
    preset: &PresetDefinitionDto,
    destination_roots: &[String],
) -> Result<PlanDto, String> {
    build_plan_with_observations(
        job_id,
        entries,
        analysis_summary,
        preset,
        destination_roots,
        &[],
    )
}

pub fn build_plan_with_observations(
    job_id: &str,
    entries: &[ManifestEntryDto],
    analysis_summary: &AnalysisSummaryDto,
    preset: &PresetDefinitionDto,
    destination_roots: &[String],
    learner_observations: &[LearnerObservationDto],
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
        analysis_summary,
        &actions,
        &entry_lookup,
        &preset.preset_id,
        learner_observations,
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
        config_fingerprint: analysis_summary.config_fingerprint.clone(),
        duplicate_config_snapshot: analysis_summary.duplicate_config.clone(),
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
                            rendered.controls_filename,
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
    let mut destination_groups: BTreeMap<String, Vec<usize>> = BTreeMap::new();
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

    let mut reserved_paths = HashSet::new();
    for (destination_path, indexes) in destination_groups {
        let source_matches_destination = indexes
            .iter()
            .any(|index| actions[*index].source_path == destination_path);
        if source_matches_destination {
            for index in indexes {
                mark_destination_conflict(
                    &mut actions[index],
                    &destination_path,
                    "The planned destination matches the current source path.",
                );
            }
            continue;
        }

        let existing_destination =
            Path::new(&destination_path).exists() || reserved_paths.contains(&destination_path);
        let has_multi_action_conflict = indexes.len() > 1;
        let collision_sensitive = existing_destination || has_multi_action_conflict;

        if collision_sensitive
            && !indexes
                .iter()
                .all(|index| supports_collision_safe_name(&actions[*index]))
        {
            let reason = if has_multi_action_conflict {
                "Multiple planned actions target the same destination path."
            } else {
                "A file already exists at the planned destination path."
            };
            for index in indexes {
                mark_destination_conflict(&mut actions[index], &destination_path, reason);
            }
            continue;
        }

        let mut sorted_indexes = indexes;
        sorted_indexes.sort_by(|left, right| {
            actions[*left]
                .source_path
                .cmp(&actions[*right].source_path)
                .then_with(|| actions[*left].action_id.cmp(&actions[*right].action_id))
        });

        for (position, index) in sorted_indexes.into_iter().enumerate() {
            let keep_original_destination = position == 0
                && !existing_destination
                && !reserved_paths.contains(&destination_path);
            let final_destination = if keep_original_destination {
                destination_path.clone()
            } else {
                next_collision_safe_destination(&actions[index], &destination_path, &reserved_paths)
            };

            if final_destination != destination_path {
                retarget_collision_safe_destination(&mut actions[index], &final_destination);
            }
            reserved_paths.insert(final_destination);
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
    analysis_summary: &AnalysisSummaryDto,
    actions: &[PlannedActionDto],
    entry_lookup: &HashMap<String, &ManifestEntryDto>,
    preset_id: &str,
    learner_observations: &[LearnerObservationDto],
) -> Vec<PlanDuplicateGroupDto> {
    let analysis_groups = &analysis_summary.likely_duplicate_groups;
    let action_by_entry = actions
        .iter()
        .map(|action| (action.source_entry_id.clone(), action))
        .collect::<HashMap<_, _>>();
    let history = duplicate_keeper_history_summary(preset_id, learner_observations);
    let keeper_settings = analysis_summary
        .duplicate_config
        .as_ref()
        .map(|config| config.keeper.clone())
        .unwrap_or_default();

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

            let member_entries = member_actions
                .iter()
                .filter_map(|action| entry_lookup.get(&action.source_entry_id).copied())
                .collect::<Vec<_>>();
            let recommendation = recommend_duplicate_keeper(
                group,
                &member_entries,
                history,
                &keeper_settings,
                &analysis_summary.detected_protections,
            );

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
                recommended_keeper_entry_id: recommendation
                    .as_ref()
                    .map(|item| item.entry_id.clone()),
                recommended_keeper_reason: recommendation.as_ref().map(|item| item.reason.clone()),
                recommended_keeper_confidence: recommendation.as_ref().map(|item| item.confidence),
                recommended_keeper_reason_tags: recommendation
                    .as_ref()
                    .map(|item| item.reason_tags.clone())
                    .unwrap_or_default(),
                match_basis: group.match_basis.clone(),
                confidence: group.confidence,
                evidence: group.evidence.clone(),
                match_explanation: group.match_explanation.clone(),
                stable_group_key: group.stable_group_key.clone(),
            })
        })
        .collect()
}

fn entry_is_protected(entry: &ManifestEntryDto, protections: &[ProtectionDetectionDto]) -> bool {
    protections.iter().any(|detection| {
        detection.state != ProtectionState::Unprotected
            && (entry.path == detection.path
                || entry.path.starts_with(&format!("{}/", detection.path)))
    })
}

fn recommend_duplicate_keeper(
    group: &DuplicateGroupDto,
    member_entries: &[&ManifestEntryDto],
    history: DuplicateKeeperHistorySummary,
    keeper_settings: &KeeperStrategySettings,
    protections: &[ProtectionDetectionDto],
) -> Option<DuplicateKeeperRecommendation> {
    let mut scored = member_entries
        .iter()
        .map(|entry| score_duplicate_keeper_candidate(entry))
        .collect::<Vec<_>>();
    if scored.is_empty() {
        return None;
    }

    let newest_timestamp = scored
        .iter()
        .filter_map(|candidate| candidate.best_timestamp)
        .max()
        .unwrap_or_default();
    let newest_count = scored
        .iter()
        .filter(|candidate| candidate.best_timestamp == Some(newest_timestamp))
        .count();
    let clean_name_best = scored
        .iter()
        .map(|candidate| candidate.clean_name_score)
        .max();
    let path_best = scored.iter().map(|candidate| candidate.path_score).max();

    for candidate in &mut scored {
        if candidate.best_timestamp.is_some()
            && candidate.best_timestamp == Some(newest_timestamp)
            && newest_count == 1
        {
            candidate.score += 24;
            candidate
                .reason_tags
                .push(match candidate.timestamp_source {
                    Some(TimestampSource::Media) => "newest media date".to_string(),
                    _ => "newest available timestamp".to_string(),
                });
        }

        if clean_name_best.is_some_and(|best| best > 0 && candidate.clean_name_score == best) {
            candidate.score += 8;
            candidate.reason_tags.push("cleaner filename".to_string());
        }

        if path_best.is_some_and(|best| best > 0 && candidate.path_score == best) {
            candidate.score += 6;
            candidate
                .reason_tags
                .push("less temporary path".to_string());
        }
    }

    match keeper_settings.preference {
        KeeperPreference::Newest => {
            scored.sort_by(|left, right| {
                right
                    .score
                    .cmp(&left.score)
                    .then_with(|| right.best_timestamp.cmp(&left.best_timestamp))
                    .then_with(|| left.entry.path.len().cmp(&right.entry.path.len()))
                    .then_with(|| left.entry.path.cmp(&right.entry.path))
            });
        }
        KeeperPreference::Oldest => {
            scored.sort_by(|left, right| {
                right
                    .score
                    .cmp(&left.score)
                    .then_with(|| left.best_timestamp.cmp(&right.best_timestamp))
                    .then_with(|| left.entry.path.len().cmp(&right.entry.path.len()))
                    .then_with(|| left.entry.path.cmp(&right.entry.path))
            });
        }
        KeeperPreference::LargestFile => {
            scored.sort_by(|left, right| {
                right
                    .score
                    .cmp(&left.score)
                    .then_with(|| right.entry.size_bytes.cmp(&left.entry.size_bytes))
                    .then_with(|| left.entry.path.cmp(&right.entry.path))
            });
        }
        KeeperPreference::ShortestPath => {
            scored.sort_by(|left, right| {
                right
                    .score
                    .cmp(&left.score)
                    .then_with(|| left.entry.path.len().cmp(&right.entry.path.len()))
                    .then_with(|| left.entry.path.cmp(&right.entry.path))
            });
        }
        KeeperPreference::PreferOriginalFolder => {
            scored.sort_by(|left, right| {
                let left_depth = left.entry.relative_path.matches('/').count();
                let right_depth = right.entry.relative_path.matches('/').count();
                right
                    .score
                    .cmp(&left.score)
                    .then_with(|| left_depth.cmp(&right_depth))
                    .then_with(|| left.entry.path.cmp(&right.entry.path))
            });
        }
        KeeperPreference::PreferProtected => {
            scored.sort_by(|left, right| {
                let left_p = entry_is_protected(left.entry, protections);
                let right_p = entry_is_protected(right.entry, protections);
                right
                    .score
                    .cmp(&left.score)
                    .then_with(|| right_p.cmp(&left_p))
                    .then_with(|| left.entry.path.cmp(&right.entry.path))
            });
        }
    }

    let winner = scored.first()?;
    let runner_up_score = scored
        .get(1)
        .map(|candidate| candidate.score)
        .unwrap_or(i32::MIN);
    let score_gap = if runner_up_score == i32::MIN {
        20
    } else {
        winner.score - runner_up_score
    };

    let mut confidence = 0.44_f32;
    let mut reason_tags = dedupe_reason_tags(winner.reason_tags.clone());
    if newest_count == 1 && winner.best_timestamp.is_some() {
        confidence += 0.18;
    }
    if score_gap >= 12 {
        confidence += 0.12;
    } else if score_gap >= 6 {
        confidence += 0.06;
    } else if score_gap <= 2 {
        confidence -= 0.08;
        reason_tags.push("signals are close".to_string());
    }
    if group.item_count == 2 {
        confidence += 0.05;
    }
    if group.certainty == DuplicateCertainty::Definite {
        confidence += 0.04;
    }
    if history.observation_count >= 3 {
        if history.disagreement_rate >= 0.6 {
            confidence -= 0.10;
            reason_tags.push("similar suggestions are often corrected".to_string());
        } else if history.disagreement_rate <= 0.25 {
            confidence += 0.05;
            reason_tags.push("similar suggestions usually match your choices".to_string());
        }
    }

    reason_tags = dedupe_reason_tags(reason_tags);
    confidence = confidence.clamp(0.28, 0.92);
    let reason = if reason_tags.is_empty() {
        "Signals are close, so this remains a weak default suggestion.".to_string()
    } else {
        format!("Suggested because of {}.", join_reason_tags(&reason_tags))
    };

    Some(DuplicateKeeperRecommendation {
        entry_id: winner.entry.entry_id.clone(),
        confidence,
        reason,
        reason_tags,
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TimestampSource {
    Media,
    Modified,
    Created,
}

#[derive(Debug, Clone)]
struct ScoredDuplicateKeeperCandidate<'a> {
    entry: &'a ManifestEntryDto,
    score: i32,
    best_timestamp: Option<i64>,
    timestamp_source: Option<TimestampSource>,
    clean_name_score: i32,
    path_score: i32,
    reason_tags: Vec<String>,
}

fn score_duplicate_keeper_candidate<'a>(
    entry: &'a ManifestEntryDto,
) -> ScoredDuplicateKeeperCandidate<'a> {
    let (best_timestamp, timestamp_source) = preferred_keeper_timestamp(entry);
    let clean_name_score = duplicate_name_quality_score(&entry.name);
    let path_score = duplicate_path_quality_score(&entry.path);

    ScoredDuplicateKeeperCandidate {
        entry,
        score: 0,
        best_timestamp,
        timestamp_source,
        clean_name_score,
        path_score,
        reason_tags: Vec::new(),
    }
}

fn preferred_keeper_timestamp(entry: &ManifestEntryDto) -> (Option<i64>, Option<TimestampSource>) {
    if let Some(timestamp) = entry.media_date_epoch_ms.filter(|value| *value > 0) {
        return (Some(timestamp), Some(TimestampSource::Media));
    }
    if let Some(timestamp) = entry.modified_at_epoch_ms.filter(|value| *value > 0) {
        return (Some(timestamp), Some(TimestampSource::Modified));
    }
    if let Some(timestamp) = entry.created_at_epoch_ms.filter(|value| *value > 0) {
        return (Some(timestamp), Some(TimestampSource::Created));
    }
    (None, None)
}

fn duplicate_name_quality_score(name: &str) -> i32 {
    let lower = name.to_ascii_lowercase();
    let mut score = 1;
    for marker in ["copy", "duplicate", "edited", "export", "final", "backup"] {
        if lower.contains(marker) {
            score -= 2;
        }
    }
    score
}

fn duplicate_path_quality_score(path: &str) -> i32 {
    let lower = path.to_ascii_lowercase();
    let mut score = 0;
    for marker in ["/dcim/", "/photos/", "/pictures/", "/camera/", "/original"] {
        if lower.contains(marker) {
            score += 2;
        }
    }
    for marker in [
        "/downloads/",
        "/desktop/",
        "/trash/",
        "/holding/",
        "/backup/",
        "/archive/",
        "/tmp/",
    ] {
        if lower.contains(marker) {
            score -= 3;
        }
    }
    score
}

fn duplicate_keeper_history_summary(
    preset_id: &str,
    learner_observations: &[LearnerObservationDto],
) -> DuplicateKeeperHistorySummary {
    let mut observation_count = 0_u32;
    let mut disagreement_count = 0_u32;

    for observation in learner_observations {
        let LearnerObservationDto::DuplicateKeeperSelection {
            preset_id: observation_preset_id,
            user_agreed_with_recommendation,
            ..
        } = observation
        else {
            continue;
        };

        if observation_preset_id != preset_id {
            continue;
        }

        observation_count += 1;
        if !user_agreed_with_recommendation {
            disagreement_count += 1;
        }
    }

    if observation_count == 0 {
        return DuplicateKeeperHistorySummary::default();
    }

    DuplicateKeeperHistorySummary {
        observation_count,
        disagreement_rate: disagreement_count as f32 / observation_count as f32,
    }
}

fn dedupe_reason_tags(tags: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut deduped = Vec::new();
    for tag in tags {
        if seen.insert(tag.clone()) {
            deduped.push(tag);
        }
    }
    deduped
}

fn join_reason_tags(tags: &[String]) -> String {
    match tags {
        [] => "available signals".to_string(),
        [only] => only.clone(),
        [first, second] => format!("{first} and {second}"),
        [rest @ .., last] => format!("{}, and {}", rest.join(", "), last),
    }
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

fn join_destination(
    root: &str,
    rendered_template: &str,
    filename: &str,
    controls_filename: bool,
) -> String {
    if controls_filename {
        join_path(root, rendered_template, "")
    } else {
        join_path(root, rendered_template, filename)
    }
}

fn supports_collision_safe_name(action: &PlannedActionDto) -> bool {
    action
        .explanation
        .template_used
        .as_deref()
        .is_some_and(|template| template.contains("{collision_name}"))
}

fn next_collision_safe_destination(
    action: &PlannedActionDto,
    destination_path: &str,
    reserved_paths: &HashSet<String>,
) -> String {
    let destination = Path::new(destination_path);
    let parent = destination.parent().unwrap_or_else(|| Path::new(""));
    let parent_display = normalize_display_path(parent);
    let mut counter = 2_u32;

    loop {
        let candidate = join_path(
            &parent_display,
            "",
            &disambiguated_filename(&action.source_path, &format!("{counter:02}")),
        );
        if candidate != action.source_path
            && !reserved_paths.contains(&candidate)
            && !Path::new(&candidate).exists()
        {
            return candidate;
        }
        counter += 1;
    }
}

fn retarget_collision_safe_destination(action: &mut PlannedActionDto, destination_path: &str) {
    action.destination_path = Some(destination_path.to_string());
    if let Some(destination_root) = &action.explanation.destination_root {
        action.explanation.previewed_template_output = Some(relative_destination_path(
            destination_root,
            destination_path,
        ));
    }
    action.explanation.notes.push(
        "Collision-safe naming added a numeric suffix to avoid a destination basename clash."
            .to_string(),
    );
}

fn relative_destination_path(destination_root: &str, destination_path: &str) -> String {
    Path::new(destination_path)
        .strip_prefix(destination_root)
        .map(normalize_display_path)
        .unwrap_or_else(|_| normalize_display_path(destination_path))
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::build_plan;
    use crate::presets::get_preset;
    use crate::types::{
        AnalysisSummaryDto, ChecksumMode, DuplicateCertainty, DuplicateGroupDto,
        DuplicateMemberDto, DuplicatePolicy, FallbackBehavior, FileCategory, LearnerObservationDto,
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
            match_basis: None,
            confidence: None,
            evidence: None,
            match_explanation: None,
            stable_group_key: None,
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
    fn duplicate_keeper_recommendation_uses_reason_tags_and_confidence() {
        let preset = get_preset("duplicate_review").expect("preset");
        let mut canonical = manifest_entry(
            "entry-canonical",
            "/source/DCIM/IMG_0001.JPG",
            "IMG_0001.JPG",
            Some("JPG"),
            1_704_067_200_000,
        );
        canonical.media_date_epoch_ms = Some(1_709_337_600_000);

        let mut downloads_copy = manifest_entry(
            "entry-copy",
            "/source/Downloads/IMG_0001 copy.JPG",
            "IMG_0001 copy.JPG",
            Some("JPG"),
            1_704_153_600_000,
        );
        downloads_copy.media_date_epoch_ms = Some(1_707_091_200_000);

        let analysis = AnalysisSummaryDto {
            likely_duplicate_groups: vec![DuplicateGroupDto {
                group_id: "group-dup".to_string(),
                certainty: DuplicateCertainty::Definite,
                representative_name: "img_0001".to_string(),
                size_bytes: 42,
                item_count: 2,
                members: vec![
                    DuplicateMemberDto {
                        entry_id: "entry-canonical".to_string(),
                        path: canonical.path.clone(),
                    },
                    DuplicateMemberDto {
                        entry_id: "entry-copy".to_string(),
                        path: downloads_copy.path.clone(),
                    },
                ],
                match_basis: None,
                confidence: None,
                evidence: None,
                match_explanation: None,
                stable_group_key: None,
            }],
            ..empty_analysis("job-dup")
        };

        let plan = build_plan(
            "job-dup",
            &[canonical, downloads_copy],
            &analysis,
            &preset,
            &["/dest".to_string()],
        )
        .expect("build plan");

        assert_eq!(
            plan.duplicate_groups[0]
                .recommended_keeper_entry_id
                .as_deref(),
            Some("entry-canonical")
        );
        assert!(plan.duplicate_groups[0]
            .recommended_keeper_reason_tags
            .contains(&"newest media date".to_string()));
        assert!(plan.duplicate_groups[0]
            .recommended_keeper_reason_tags
            .contains(&"less temporary path".to_string()));
        assert!(plan.duplicate_groups[0]
            .recommended_keeper_confidence
            .is_some_and(|confidence| confidence >= 0.6));
    }

    #[test]
    fn duplicate_keeper_confidence_is_reduced_when_history_often_disagrees() {
        let preset = get_preset("duplicate_review").expect("preset");
        let mut canonical = manifest_entry(
            "entry-canonical",
            "/source/DCIM/IMG_0001.JPG",
            "IMG_0001.JPG",
            Some("JPG"),
            1_704_067_200_000,
        );
        canonical.media_date_epoch_ms = Some(1_709_337_600_000);

        let mut downloads_copy = manifest_entry(
            "entry-copy",
            "/source/Downloads/IMG_0001 copy.JPG",
            "IMG_0001 copy.JPG",
            Some("JPG"),
            1_704_153_600_000,
        );
        downloads_copy.media_date_epoch_ms = Some(1_707_091_200_000);

        let analysis = AnalysisSummaryDto {
            likely_duplicate_groups: vec![DuplicateGroupDto {
                group_id: "group-dup".to_string(),
                certainty: DuplicateCertainty::Definite,
                representative_name: "img_0001".to_string(),
                size_bytes: 42,
                item_count: 2,
                members: vec![
                    DuplicateMemberDto {
                        entry_id: "entry-canonical".to_string(),
                        path: canonical.path.clone(),
                    },
                    DuplicateMemberDto {
                        entry_id: "entry-copy".to_string(),
                        path: downloads_copy.path.clone(),
                    },
                ],
                match_basis: None,
                confidence: None,
                evidence: None,
                match_explanation: None,
                stable_group_key: None,
            }],
            ..empty_analysis("job-dup-history")
        };

        let without_history = build_plan(
            "job-dup-history",
            &[canonical.clone(), downloads_copy.clone()],
            &analysis,
            &preset,
            &["/dest".to_string()],
        )
        .expect("build plan without history");

        let learner_observations = vec![
            duplicate_keeper_observation("obs-1", "duplicate_review", true),
            duplicate_keeper_observation("obs-2", "duplicate_review", false),
            duplicate_keeper_observation("obs-3", "duplicate_review", false),
        ];
        let with_history = super::build_plan_with_observations(
            "job-dup-history",
            &[canonical, downloads_copy],
            &analysis,
            &preset,
            &["/dest".to_string()],
            &learner_observations,
        )
        .expect("build plan with history");

        assert!(
            with_history.duplicate_groups[0]
                .recommended_keeper_confidence
                .unwrap_or_default()
                < without_history.duplicate_groups[0]
                    .recommended_keeper_confidence
                    .unwrap_or_default()
        );
        assert!(with_history.duplicate_groups[0]
            .recommended_keeper_reason_tags
            .contains(&"similar suggestions are often corrected".to_string()));
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
    fn downloads_cleanup_reviews_code_leftovers() {
        let preset = get_preset("downloads_cleanup").expect("preset");
        let entry = manifest_entry(
            "code-1",
            "/source/script.py",
            "script.py",
            Some("py"),
            1_704_067_200_000,
        );

        let plan = build_plan(
            "job-downloads",
            &[entry],
            &empty_analysis("job-downloads"),
            &preset,
            &["/dest".to_string()],
        )
        .expect("build plan");

        assert_eq!(plan.summary.review_actions, 1);
        assert_eq!(plan.actions[0].action_kind, PlannedActionKind::Review);
        assert_eq!(plan.actions[0].destination_path, None);
    }

    #[test]
    fn screenshots_cleanup_moves_matching_images() {
        let preset = get_preset("screenshots_cleanup").expect("preset");
        let entry = manifest_entry(
            "shot-1",
            "/source/Screen Shot 2024-01-12 at 10.15.00.png",
            "Screen Shot 2024-01-12 at 10.15.00.png",
            Some("png"),
            1_704_067_200_000,
        );

        let plan = build_plan(
            "job-screenshots",
            &[entry],
            &empty_analysis("job-screenshots"),
            &preset,
            &["/dest".to_string()],
        )
        .expect("build plan");

        assert_eq!(plan.summary.move_actions, 1);
        assert_eq!(
            plan.actions[0].destination_path.as_deref(),
            Some("/dest/Screenshots/2024/01/Screen Shot 2024-01-12 at 10.15.00.png")
        );
    }

    #[test]
    fn camera_import_routes_raw_photos_into_raw_folder() {
        let preset = get_preset("camera_import").expect("preset");
        let entry = manifest_entry(
            "raw-1",
            "/source/DSC_0001.NEF",
            "DSC_0001.NEF",
            Some("NEF"),
            1_704_067_200_000,
        );

        let plan = build_plan(
            "job-camera",
            &[entry],
            &empty_analysis("job-camera"),
            &preset,
            &["/dest".to_string()],
        )
        .expect("build plan");

        assert_eq!(plan.summary.move_actions, 1);
        assert_eq!(
            plan.actions[0].destination_path.as_deref(),
            Some("/dest/Photos/2024/01/RAW/DSC_0001.NEF")
        );
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

    #[test]
    fn camera_import_prefers_media_date_tokens_when_available() {
        let preset = get_preset("camera_import").expect("preset");
        let mut entry = manifest_entry(
            "image-media-date",
            "/source/photo.jpg",
            "photo.jpg",
            Some("jpg"),
            1_704_067_200_000,
        );
        entry.media_date_epoch_ms = Some(1_709_337_600_000);

        let plan = build_plan(
            "job-7",
            &[entry],
            &empty_analysis("job-7"),
            &preset,
            &["/dest".to_string()],
        )
        .expect("build plan");

        assert_eq!(
            plan.actions[0].destination_path.as_deref(),
            Some("/dest/Photos/2024/03/photo.jpg")
        );
    }

    #[test]
    fn camera_import_disambiguates_same_named_files_with_collision_safe_template() {
        let preset = get_preset("camera_import").expect("preset");
        let entries = vec![
            manifest_entry(
                "image-collision-1",
                "/source/a/photo.jpg",
                "photo.jpg",
                Some("jpg"),
                1_704_067_200_000,
            ),
            manifest_entry(
                "image-collision-2",
                "/source/b/photo.jpg",
                "photo.jpg",
                Some("jpg"),
                1_704_067_200_000,
            ),
        ];

        let plan = build_plan(
            "job-8",
            &entries,
            &empty_analysis("job-8"),
            &preset,
            &["/dest".to_string()],
        )
        .expect("build plan");

        assert_eq!(plan.summary.blocked_actions, 0);
        let destinations = plan
            .actions
            .iter()
            .map(|action| action.destination_path.clone().expect("destination"))
            .collect::<Vec<_>>();
        assert!(destinations.contains(&"/dest/Photos/2024/01/photo.jpg".to_string()));
        assert!(destinations.contains(&"/dest/Photos/2024/01/photo--02.jpg".to_string()));
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
            ai_assisted_suggestions: Vec::new(),
            duplicate_config: None,
            config_fingerprint: None,
            analysis_partial_notes: Vec::new(),
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
            media_date_epoch_ms: None,
            media_date_source: None,
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

    fn duplicate_keeper_observation(
        observation_id: &str,
        preset_id: &str,
        user_agreed_with_recommendation: bool,
    ) -> LearnerObservationDto {
        LearnerObservationDto::DuplicateKeeperSelection {
            observation_id: observation_id.to_string(),
            observed_at_epoch_ms: 1,
            schema_version: 1,
            plan_id: "plan-1".to_string(),
            job_id: "job-1".to_string(),
            preset_id: preset_id.to_string(),
            related_session_id: None,
            group_id: "group-1".to_string(),
            certainty: DuplicateCertainty::Definite,
            representative_name: "photo.jpg".to_string(),
            item_count: 2,
            member_entry_ids: vec!["entry-canonical".to_string(), "entry-copy".to_string()],
            member_action_ids: vec!["action-1".to_string(), "action-2".to_string()],
            recommended_keeper_entry_id: Some("entry-canonical".to_string()),
            recommended_keeper_reason: Some("Suggested because of newest media date.".to_string()),
            selected_keeper_entry_id: if user_agreed_with_recommendation {
                "entry-canonical".to_string()
            } else {
                "entry-copy".to_string()
            },
            user_agreed_with_recommendation,
        }
    }
}
