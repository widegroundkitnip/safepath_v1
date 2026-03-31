use std::{
    collections::HashMap,
    time::{SystemTime, UNIX_EPOCH},
};

use uuid::Uuid;

use crate::types::{
    DuplicatePolicy, LearnerDraftPreviewDto, LearnerObservationDto, LearnerSuggestionDto,
    LearnerSuggestionFeedbackKind, PlanDto, PlanDuplicateGroupDto, PlannedActionKind,
    PresetDefinitionDto, RecordLearnerSuggestionFeedbackRequest, ReviewDecision, ReviewMode,
    ReviewState, SaveLearnerDraftPreviewRequest,
};

pub const LEARNER_OBSERVATION_SCHEMA_VERSION: u32 = 1;
const MIN_DUPLICATE_KEEPER_OBSERVATIONS: u32 = 3;
const MIN_DUPLICATE_KEEPER_DISAGREEMENT_RATE: f32 = 0.6;
const MAX_DUPLICATE_KEEPER_SAMPLES: usize = 3;
const MIN_RULE_REVIEW_OBSERVATIONS: u32 = 3;
const MIN_RULE_REJECTION_RATE: f32 = 0.6;
const MAX_RULE_REVIEW_SAMPLES: usize = 3;

impl LearnerObservationDto {
    pub fn observation_id(&self) -> &str {
        match self {
            LearnerObservationDto::DuplicateKeeperSelection { observation_id, .. } => {
                observation_id
            }
            LearnerObservationDto::PlannedActionReviewDecision { observation_id, .. } => {
                observation_id
            }
            LearnerObservationDto::SuggestionFeedback { observation_id, .. } => observation_id,
        }
    }
}

impl LearnerSuggestionDto {
    pub fn suggestion_id(&self) -> &str {
        match self {
            LearnerSuggestionDto::DuplicateKeeperPolicySuggestion { suggestion_id, .. } => {
                suggestion_id
            }
            LearnerSuggestionDto::RuleReviewTuningSuggestion { suggestion_id, .. } => suggestion_id,
        }
    }

    pub fn preset_id(&self) -> &str {
        match self {
            LearnerSuggestionDto::DuplicateKeeperPolicySuggestion { preset_id, .. } => preset_id,
            LearnerSuggestionDto::RuleReviewTuningSuggestion { preset_id, .. } => preset_id,
        }
    }
}

pub fn build_duplicate_keeper_observation(
    plan: &PlanDto,
    group: &PlanDuplicateGroupDto,
    related_session_id: Option<String>,
) -> Result<LearnerObservationDto, String> {
    let selected_keeper_entry_id = group.selected_keeper_entry_id.clone().ok_or_else(|| {
        format!(
            "Duplicate group `{}` must have a selected keeper before recording an observation.",
            group.group_id
        )
    })?;
    let user_agreed_with_recommendation = group
        .recommended_keeper_entry_id
        .as_ref()
        .is_some_and(|recommended| recommended == &selected_keeper_entry_id);

    Ok(LearnerObservationDto::DuplicateKeeperSelection {
        observation_id: Uuid::new_v4().to_string(),
        observed_at_epoch_ms: now_epoch_ms(),
        schema_version: LEARNER_OBSERVATION_SCHEMA_VERSION,
        plan_id: plan.plan_id.clone(),
        job_id: plan.job_id.clone(),
        preset_id: plan.preset_id.clone(),
        related_session_id,
        group_id: group.group_id.clone(),
        certainty: group.certainty,
        representative_name: group.representative_name.clone(),
        item_count: group.item_count,
        member_entry_ids: group.member_entry_ids.clone(),
        member_action_ids: group.member_action_ids.clone(),
        recommended_keeper_entry_id: group.recommended_keeper_entry_id.clone(),
        recommended_keeper_reason: group.recommended_keeper_reason.clone(),
        selected_keeper_entry_id,
        user_agreed_with_recommendation,
    })
}

pub fn build_suggestion_feedback_observation(
    request: &RecordLearnerSuggestionFeedbackRequest,
) -> LearnerObservationDto {
    LearnerObservationDto::SuggestionFeedback {
        observation_id: Uuid::new_v4().to_string(),
        observed_at_epoch_ms: now_epoch_ms(),
        schema_version: LEARNER_OBSERVATION_SCHEMA_VERSION,
        suggestion_id: request.suggestion_id.clone(),
        preset_id: request.preset_id.clone(),
        feedback: request.feedback,
    }
}

pub fn build_review_decision_observations(
    previous_plan: &PlanDto,
    updated_plan: &PlanDto,
    action_ids: &[String],
    decision: ReviewDecision,
) -> Vec<LearnerObservationDto> {
    if matches!(decision, ReviewDecision::Reset) || action_ids.is_empty() {
        return Vec::new();
    }

    updated_plan
        .actions
        .iter()
        .filter(|action| {
            action_ids
                .iter()
                .any(|action_id| action_id == &action.action_id)
        })
        .filter_map(|action| {
            let previous_action = previous_plan
                .actions
                .iter()
                .find(|candidate| candidate.action_id == action.action_id)?;
            if previous_action.review_state == action.review_state {
                return None;
            }
            if !matches!(
                action.review_state,
                ReviewState::Approved | ReviewState::Rejected
            ) {
                return None;
            }

            Some(LearnerObservationDto::PlannedActionReviewDecision {
                observation_id: Uuid::new_v4().to_string(),
                observed_at_epoch_ms: now_epoch_ms(),
                schema_version: LEARNER_OBSERVATION_SCHEMA_VERSION,
                plan_id: updated_plan.plan_id.clone(),
                job_id: updated_plan.job_id.clone(),
                preset_id: updated_plan.preset_id.clone(),
                action_id: action.action_id.clone(),
                source_entry_id: action.source_entry_id.clone(),
                source_path: action.source_path.clone(),
                action_kind: action.action_kind,
                matched_rule_id: action.explanation.matched_rule.clone(),
                decision,
                resulting_review_state: action.review_state,
                safety_flags: action.explanation.safety_flags.clone(),
                conflict_status: action.explanation.conflict_status,
            })
        })
        .collect()
}

pub fn build_suggestions(observations: &[LearnerObservationDto]) -> Vec<LearnerSuggestionDto> {
    let mut duplicate_keeper_by_preset = HashMap::<String, DuplicateKeeperAggregation>::new();
    let mut rule_review_by_rule = HashMap::<(String, String), RuleReviewAggregation>::new();
    let mut feedback_by_suggestion = HashMap::<String, SuggestionFeedbackSnapshot>::new();

    for observation in observations {
        match observation {
            LearnerObservationDto::DuplicateKeeperSelection {
                observed_at_epoch_ms,
                preset_id,
                group_id,
                representative_name,
                user_agreed_with_recommendation,
                ..
            } => {
                let aggregation = duplicate_keeper_by_preset
                    .entry(preset_id.clone())
                    .or_insert_with(DuplicateKeeperAggregation::default);
                aggregation.observation_count += 1;
                aggregation.generated_at_epoch_ms =
                    aggregation.generated_at_epoch_ms.max(*observed_at_epoch_ms);

                if *user_agreed_with_recommendation {
                    aggregation.agreement_count += 1;
                } else {
                    aggregation.disagreement_count += 1;
                    push_unique_limited(
                        &mut aggregation.representative_names,
                        representative_name.clone(),
                        MAX_DUPLICATE_KEEPER_SAMPLES,
                    );
                    push_unique_limited(
                        &mut aggregation.sample_group_ids,
                        group_id.clone(),
                        MAX_DUPLICATE_KEEPER_SAMPLES,
                    );
                }
            }
            LearnerObservationDto::PlannedActionReviewDecision {
                observed_at_epoch_ms,
                preset_id,
                matched_rule_id,
                source_path,
                resulting_review_state,
                ..
            } => {
                let Some(rule_id) = matched_rule_id.clone() else {
                    continue;
                };
                let aggregation = rule_review_by_rule
                    .entry((preset_id.clone(), rule_id))
                    .or_insert_with(RuleReviewAggregation::default);
                aggregation.observation_count += 1;
                aggregation.generated_at_epoch_ms =
                    aggregation.generated_at_epoch_ms.max(*observed_at_epoch_ms);
                if *resulting_review_state == ReviewState::Rejected {
                    aggregation.rejection_count += 1;
                    push_unique_limited(
                        &mut aggregation.sample_source_paths,
                        source_path.clone(),
                        MAX_RULE_REVIEW_SAMPLES,
                    );
                } else if *resulting_review_state == ReviewState::Approved {
                    aggregation.approval_count += 1;
                }
            }
            LearnerObservationDto::SuggestionFeedback {
                suggestion_id,
                observed_at_epoch_ms,
                feedback,
                ..
            } => {
                let replace_existing = feedback_by_suggestion
                    .get(suggestion_id)
                    .is_none_or(|existing| *observed_at_epoch_ms >= existing.observed_at_epoch_ms);
                if replace_existing {
                    feedback_by_suggestion.insert(
                        suggestion_id.clone(),
                        SuggestionFeedbackSnapshot {
                            feedback: *feedback,
                            observed_at_epoch_ms: *observed_at_epoch_ms,
                        },
                    );
                }
            }
        }
    }

    let mut suggestions = duplicate_keeper_by_preset
        .into_iter()
        .filter_map(|(preset_id, aggregation)| {
            if aggregation.observation_count < MIN_DUPLICATE_KEEPER_OBSERVATIONS
                || aggregation.disagreement_count == 0
            {
                return None;
            }

            let disagreement_rate =
                aggregation.disagreement_count as f32 / aggregation.observation_count as f32;
            if disagreement_rate < MIN_DUPLICATE_KEEPER_DISAGREEMENT_RATE {
                return None;
            }

            let suggestion_id = format!("duplicate-keeper-policy:{preset_id}");
            let feedback_snapshot = feedback_by_suggestion.get(&suggestion_id).copied();
            if feedback_snapshot.is_some_and(|snapshot| {
                snapshot.feedback == LearnerSuggestionFeedbackKind::Suppressed
            }) {
                return None;
            }

            Some(LearnerSuggestionDto::DuplicateKeeperPolicySuggestion {
                suggestion_id,
                generated_at_epoch_ms: aggregation.generated_at_epoch_ms,
                preset_id: preset_id.clone(),
                based_on_observation_count: aggregation.observation_count,
                agreement_count: aggregation.agreement_count,
                disagreement_count: aggregation.disagreement_count,
                disagreement_rate,
                title: format!(
                    "Duplicate keeper recommendations for `{preset_id}` are often corrected"
                ),
                rationale: format!(
                    "Users overrode the current duplicate keeper recommendation in {} of {} observed duplicate groups for this preset.",
                    aggregation.disagreement_count, aggregation.observation_count
                ),
                suggested_adjustment: "Keep this preset review-heavy for duplicate groups and consider a future preset-level keeper policy instead of relying on the current default recommendation.".to_string(),
                representative_names: aggregation.representative_names,
                sample_group_ids: aggregation.sample_group_ids,
                feedback: feedback_snapshot.map(|snapshot| snapshot.feedback),
                feedback_recorded_at_epoch_ms: feedback_snapshot
                    .map(|snapshot| snapshot.observed_at_epoch_ms),
            })
        })
        .collect::<Vec<_>>();

    suggestions.extend(rule_review_by_rule.into_iter().filter_map(
        |((preset_id, rule_id), aggregation)| {
            if aggregation.observation_count < MIN_RULE_REVIEW_OBSERVATIONS
                || aggregation.rejection_count == 0
            {
                return None;
            }

            let rejection_rate =
                aggregation.rejection_count as f32 / aggregation.observation_count as f32;
            if rejection_rate < MIN_RULE_REJECTION_RATE {
                return None;
            }

            let suggestion_id = format!("rule-review-tuning:{preset_id}:{rule_id}");
            let feedback_snapshot = feedback_by_suggestion.get(&suggestion_id).copied();
            if feedback_snapshot.is_some_and(|snapshot| {
                snapshot.feedback == LearnerSuggestionFeedbackKind::Suppressed
            }) {
                return None;
            }

            Some(LearnerSuggestionDto::RuleReviewTuningSuggestion {
                suggestion_id,
                generated_at_epoch_ms: aggregation.generated_at_epoch_ms,
                preset_id: preset_id.clone(),
                rule_id: rule_id.clone(),
                based_on_observation_count: aggregation.observation_count,
                approval_count: aggregation.approval_count,
                rejection_count: aggregation.rejection_count,
                rejection_rate,
                title: format!("Rule `{rule_id}` in `{preset_id}` is often rejected during review"),
                rationale: format!(
                    "Users rejected actions from rule `{}` in {} of {} recorded review decisions for this preset.",
                    rule_id, aggregation.rejection_count, aggregation.observation_count
                ),
                suggested_adjustment: "Consider softening this rule, narrowing its match conditions, or routing its output into review-first handling instead of assuming approval.".to_string(),
                sample_source_paths: aggregation.sample_source_paths,
                feedback: feedback_snapshot.map(|snapshot| snapshot.feedback),
                feedback_recorded_at_epoch_ms: feedback_snapshot
                    .map(|snapshot| snapshot.observed_at_epoch_ms),
            })
        },
    ));

    suggestions.sort_by(|left, right| match (left, right) {
        (
            LearnerSuggestionDto::DuplicateKeeperPolicySuggestion {
                disagreement_rate: left_rate,
                based_on_observation_count: left_count,
                preset_id: left_preset,
                ..
            },
            LearnerSuggestionDto::DuplicateKeeperPolicySuggestion {
                disagreement_rate: right_rate,
                based_on_observation_count: right_count,
                preset_id: right_preset,
                ..
            },
        ) => right_rate
            .partial_cmp(left_rate)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(right_count.cmp(left_count))
            .then_with(|| left_preset.cmp(right_preset)),
        (
            LearnerSuggestionDto::RuleReviewTuningSuggestion {
                rejection_rate: left_rate,
                based_on_observation_count: left_count,
                preset_id: left_preset,
                rule_id: left_rule,
                ..
            },
            LearnerSuggestionDto::RuleReviewTuningSuggestion {
                rejection_rate: right_rate,
                based_on_observation_count: right_count,
                preset_id: right_preset,
                rule_id: right_rule,
                ..
            },
        ) => right_rate
            .partial_cmp(left_rate)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(right_count.cmp(left_count))
            .then_with(|| left_preset.cmp(right_preset))
            .then_with(|| left_rule.cmp(right_rule)),
        (LearnerSuggestionDto::RuleReviewTuningSuggestion { .. }, _) => std::cmp::Ordering::Less,
        (_, LearnerSuggestionDto::RuleReviewTuningSuggestion { .. }) => std::cmp::Ordering::Greater,
    });

    suggestions
}

pub fn build_draft_previews(
    suggestions: &[LearnerSuggestionDto],
    presets: &[PresetDefinitionDto],
) -> Vec<LearnerDraftPreviewDto> {
    let mut previews = Vec::new();

    for suggestion in suggestions {
        match suggestion {
            LearnerSuggestionDto::DuplicateKeeperPolicySuggestion {
                suggestion_id,
                preset_id,
                title,
                ..
            } => {
                let Some(preset) = presets.iter().find(|preset| preset.preset_id == *preset_id)
                else {
                    continue;
                };
                let after_duplicate_policy = DuplicatePolicy::FullReview;
                let after_review_mode = ReviewMode::DuplicateFirst;
                if preset.plan_options.duplicate_policy == after_duplicate_policy
                    && preset.plan_options.review_mode == after_review_mode
                {
                    continue;
                }

                previews.push(LearnerDraftPreviewDto::DuplicateKeeperPolicyDraft {
                    draft_id: format!("draft:{suggestion_id}"),
                    suggestion_id: suggestion_id.clone(),
                    preset_id: preset.preset_id.clone(),
                    preset_name: preset.name.clone(),
                    title: format!("Draft preset update for `{}`", preset.name),
                    summary: format!(
                        "{} Preview a stricter duplicate-review posture for this preset without saving it.",
                        title
                    ),
                    before_duplicate_policy: preset.plan_options.duplicate_policy,
                    after_duplicate_policy,
                    before_review_mode: preset.plan_options.review_mode,
                    after_review_mode,
                });
            }
            LearnerSuggestionDto::RuleReviewTuningSuggestion {
                suggestion_id,
                preset_id,
                rule_id,
                title,
                ..
            } => {
                let Some(preset) = presets.iter().find(|preset| preset.preset_id == *preset_id)
                else {
                    continue;
                };
                let Some(rule) = preset
                    .rule_set
                    .rules
                    .iter()
                    .find(|rule| rule.rule_id == *rule_id)
                else {
                    continue;
                };
                let after_action_kind = PlannedActionKind::Review;
                if rule.action_kind == after_action_kind {
                    continue;
                }

                previews.push(LearnerDraftPreviewDto::RuleReviewTuningDraft {
                    draft_id: format!("draft:{suggestion_id}"),
                    suggestion_id: suggestion_id.clone(),
                    preset_id: preset.preset_id.clone(),
                    preset_name: preset.name.clone(),
                    rule_id: rule.rule_id.clone(),
                    rule_name: rule.name.clone(),
                    title: format!("Draft rule update for `{}`", rule.name),
                    summary: format!(
                        "{} Preview changing this rule from automatic handling to review-first handling.",
                        title
                    ),
                    before_action_kind: rule.action_kind,
                    after_action_kind,
                    destination_template: rule.destination_template.clone(),
                    condition_count: rule.conditions.len() as u32,
                });
            }
        }
    }

    previews
}

pub fn materialize_preset_draft(
    request: &SaveLearnerDraftPreviewRequest,
    drafts: &[LearnerDraftPreviewDto],
    presets: &[PresetDefinitionDto],
) -> Result<PresetDefinitionDto, String> {
    let draft = drafts
        .iter()
        .find(|draft| match draft {
            LearnerDraftPreviewDto::DuplicateKeeperPolicyDraft { draft_id, .. } => {
                draft_id == &request.draft_id
            }
            LearnerDraftPreviewDto::RuleReviewTuningDraft { draft_id, .. } => {
                draft_id == &request.draft_id
            }
        })
        .ok_or_else(|| format!("Learner draft `{}` is no longer active.", request.draft_id))?;

    let source_preset_id = match draft {
        LearnerDraftPreviewDto::DuplicateKeeperPolicyDraft { preset_id, .. } => preset_id,
        LearnerDraftPreviewDto::RuleReviewTuningDraft { preset_id, .. } => preset_id,
    };
    let source_preset = presets
        .iter()
        .find(|preset| &preset.preset_id == source_preset_id)
        .ok_or_else(|| format!("Preset `{source_preset_id}` was not found."))?;
    let (draft_preset_id, draft_name, draft_rule_set_id) =
        next_draft_identity(source_preset, presets);

    let mut preset = source_preset.clone();
    preset.preset_id = draft_preset_id;
    preset.name = draft_name;
    preset.rule_set.rule_set_id = draft_rule_set_id;

    match draft {
        LearnerDraftPreviewDto::DuplicateKeeperPolicyDraft {
            summary,
            after_duplicate_policy,
            after_review_mode,
            ..
        } => {
            preset.description =
                format!("Learner draft from `{}`. {}", source_preset.name, summary);
            preset.plan_options.duplicate_policy = *after_duplicate_policy;
            preset.plan_options.review_mode = *after_review_mode;
        }
        LearnerDraftPreviewDto::RuleReviewTuningDraft {
            summary,
            rule_id,
            after_action_kind,
            ..
        } => {
            let rule = preset
                .rule_set
                .rules
                .iter_mut()
                .find(|rule| &rule.rule_id == rule_id)
                .ok_or_else(|| format!("Rule `{rule_id}` was not found in preset draft."))?;
            preset.description =
                format!("Learner draft from `{}`. {}", source_preset.name, summary);
            rule.action_kind = *after_action_kind;
            rule.explanation = format!(
                "{} Learner draft changed this rule to review-first handling.",
                rule.explanation
            );
        }
    }

    Ok(preset)
}

fn now_epoch_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

#[derive(Default)]
struct DuplicateKeeperAggregation {
    generated_at_epoch_ms: i64,
    observation_count: u32,
    agreement_count: u32,
    disagreement_count: u32,
    representative_names: Vec<String>,
    sample_group_ids: Vec<String>,
}

#[derive(Default)]
struct RuleReviewAggregation {
    generated_at_epoch_ms: i64,
    observation_count: u32,
    approval_count: u32,
    rejection_count: u32,
    sample_source_paths: Vec<String>,
}

fn next_draft_identity(
    source_preset: &PresetDefinitionDto,
    presets: &[PresetDefinitionDto],
) -> (String, String, String) {
    let base_id = format!("{}__learner_draft", source_preset.preset_id);
    let base_name = format!("{} (Learner Draft)", source_preset.name);
    let mut candidate_id = base_id.clone();
    let mut candidate_name = base_name.clone();
    let mut suffix = 2;

    while presets
        .iter()
        .any(|preset| preset.preset_id == candidate_id || preset.name == candidate_name)
    {
        candidate_id = format!("{base_id}_{suffix}");
        candidate_name = format!("{} {}", base_name, suffix);
        suffix += 1;
    }

    (
        candidate_id.clone(),
        candidate_name,
        format!("{candidate_id}_rules"),
    )
}

#[derive(Clone, Copy)]
struct SuggestionFeedbackSnapshot {
    feedback: LearnerSuggestionFeedbackKind,
    observed_at_epoch_ms: i64,
}

fn push_unique_limited(values: &mut Vec<String>, candidate: String, limit: usize) {
    if values.len() >= limit || values.iter().any(|existing| existing == &candidate) {
        return;
    }
    values.push(candidate);
}

#[cfg(test)]
mod tests {
    use super::{
        build_draft_previews, build_duplicate_keeper_observation,
        build_review_decision_observations, build_suggestion_feedback_observation,
        build_suggestions, materialize_preset_draft, LEARNER_OBSERVATION_SCHEMA_VERSION,
    };
    use crate::types::{
        DuplicateCertainty, DuplicatePolicy, LearnerDraftPreviewDto, LearnerObservationDto,
        LearnerSuggestionDto, LearnerSuggestionFeedbackKind, PlanDto, PlanDuplicateGroupDto,
        PlanSummaryDto, PlannedActionDto, PlannedActionKind, PresetDefinitionDto,
        RecordLearnerSuggestionFeedbackRequest, ReviewDecision, ReviewMode, ReviewState,
        SaveLearnerDraftPreviewRequest,
    };

    #[test]
    fn builds_duplicate_keeper_observation() {
        let plan = sample_plan();
        let group = &plan.duplicate_groups[0];

        let observation =
            build_duplicate_keeper_observation(&plan, group, Some("session-1".to_string()))
                .expect("observation");

        match observation {
            LearnerObservationDto::DuplicateKeeperSelection {
                plan_id,
                group_id,
                selected_keeper_entry_id,
                user_agreed_with_recommendation,
                related_session_id,
                ..
            } => {
                assert_eq!(plan_id, "plan-1");
                assert_eq!(group_id, "group-1");
                assert_eq!(selected_keeper_entry_id, "entry-2");
                assert!(user_agreed_with_recommendation);
                assert_eq!(related_session_id.as_deref(), Some("session-1"));
            }
            _ => panic!("expected duplicate keeper observation"),
        }
    }

    #[test]
    fn builds_suggestion_feedback_observation() {
        let observation =
            build_suggestion_feedback_observation(&RecordLearnerSuggestionFeedbackRequest {
                suggestion_id: "duplicate-keeper-policy:preset-1".to_string(),
                preset_id: "preset-1".to_string(),
                feedback: LearnerSuggestionFeedbackKind::AcceptedForLater,
            });

        match observation {
            LearnerObservationDto::SuggestionFeedback {
                suggestion_id,
                preset_id,
                feedback,
                ..
            } => {
                assert_eq!(suggestion_id, "duplicate-keeper-policy:preset-1");
                assert_eq!(preset_id, "preset-1");
                assert_eq!(feedback, LearnerSuggestionFeedbackKind::AcceptedForLater);
            }
            _ => panic!("expected suggestion feedback observation"),
        }
    }

    #[test]
    fn builds_review_decision_observations_for_changed_actions() {
        let previous_plan = sample_review_plan(ReviewState::Pending);
        let updated_plan = sample_review_plan(ReviewState::Rejected);

        let observations = build_review_decision_observations(
            &previous_plan,
            &updated_plan,
            &["action-1".to_string()],
            ReviewDecision::Reject,
        );

        assert_eq!(observations.len(), 1);
        match &observations[0] {
            LearnerObservationDto::PlannedActionReviewDecision {
                preset_id,
                matched_rule_id,
                decision,
                resulting_review_state,
                ..
            } => {
                assert_eq!(preset_id, "preset-1");
                assert_eq!(matched_rule_id.as_deref(), Some("rule-photos"));
                assert_eq!(*decision, ReviewDecision::Reject);
                assert_eq!(*resulting_review_state, ReviewState::Rejected);
            }
            _ => panic!("expected review decision observation"),
        }
    }

    #[test]
    fn builds_duplicate_keeper_policy_suggestion_for_often_corrected_preset() {
        let plan = sample_plan();
        let group = &plan.duplicate_groups[0];
        let agreeing =
            build_duplicate_keeper_observation(&plan, group, None).expect("agreeing observation");
        let corrected_once = build_duplicate_keeper_observation(
            &plan,
            &PlanDuplicateGroupDto {
                group_id: "group-2".to_string(),
                representative_name: "archive-photo.jpg".to_string(),
                selected_keeper_entry_id: Some("entry-1".to_string()),
                ..group.clone()
            },
            None,
        )
        .expect("corrected observation");
        let corrected_twice = build_duplicate_keeper_observation(
            &PlanDto {
                preset_id: "preset-1".to_string(),
                ..plan.clone()
            },
            &PlanDuplicateGroupDto {
                group_id: "group-3".to_string(),
                representative_name: "scan.png".to_string(),
                selected_keeper_entry_id: Some("entry-1".to_string()),
                ..group.clone()
            },
            None,
        )
        .expect("second corrected observation");

        let suggestions = build_suggestions(&[agreeing, corrected_once, corrected_twice]);

        assert_eq!(suggestions.len(), 1);
        match &suggestions[0] {
            LearnerSuggestionDto::DuplicateKeeperPolicySuggestion {
                preset_id,
                based_on_observation_count,
                disagreement_count,
                representative_names,
                sample_group_ids,
                ..
            } => {
                assert_eq!(preset_id, "preset-1");
                assert_eq!(*based_on_observation_count, 3);
                assert_eq!(*disagreement_count, 2);
                assert_eq!(
                    representative_names,
                    &vec!["archive-photo.jpg".to_string(), "scan.png".to_string()]
                );
                assert_eq!(
                    sample_group_ids,
                    &vec!["group-2".to_string(), "group-3".to_string()]
                );
            }
            _ => panic!("expected duplicate keeper suggestion"),
        }
    }

    #[test]
    fn skips_duplicate_keeper_policy_suggestion_below_threshold() {
        let plan = sample_plan();
        let group = &plan.duplicate_groups[0];
        let agreeing = build_duplicate_keeper_observation(&plan, group, None)
            .expect("first agreeing observation");
        let corrected = build_duplicate_keeper_observation(
            &plan,
            &PlanDuplicateGroupDto {
                group_id: "group-2".to_string(),
                selected_keeper_entry_id: Some("entry-1".to_string()),
                ..group.clone()
            },
            None,
        )
        .expect("corrected observation");
        let also_agreeing = build_duplicate_keeper_observation(
            &PlanDto {
                plan_id: "plan-2".to_string(),
                ..plan.clone()
            },
            &PlanDuplicateGroupDto {
                group_id: "group-3".to_string(),
                ..group.clone()
            },
            None,
        )
        .expect("second agreeing observation");

        let suggestions = build_suggestions(&[agreeing, corrected, also_agreeing]);

        assert!(suggestions.is_empty());
    }

    #[test]
    fn accepted_feedback_is_reflected_on_suggestion() {
        let observations = suggestion_source_observations();
        let accepted_feedback =
            build_suggestion_feedback_observation(&RecordLearnerSuggestionFeedbackRequest {
                suggestion_id: "duplicate-keeper-policy:preset-1".to_string(),
                preset_id: "preset-1".to_string(),
                feedback: LearnerSuggestionFeedbackKind::AcceptedForLater,
            });

        let suggestions = build_suggestions(&[
            observations[0].clone(),
            observations[1].clone(),
            observations[2].clone(),
            accepted_feedback,
        ]);

        match &suggestions[0] {
            LearnerSuggestionDto::DuplicateKeeperPolicySuggestion {
                feedback,
                feedback_recorded_at_epoch_ms,
                ..
            } => {
                assert_eq!(
                    *feedback,
                    Some(LearnerSuggestionFeedbackKind::AcceptedForLater)
                );
                assert!(feedback_recorded_at_epoch_ms.is_some());
            }
            _ => panic!("expected duplicate keeper suggestion"),
        }
    }

    #[test]
    fn suppressed_feedback_hides_suggestion() {
        let observations = suggestion_source_observations();
        let suppressed_feedback =
            build_suggestion_feedback_observation(&RecordLearnerSuggestionFeedbackRequest {
                suggestion_id: "duplicate-keeper-policy:preset-1".to_string(),
                preset_id: "preset-1".to_string(),
                feedback: LearnerSuggestionFeedbackKind::Suppressed,
            });

        let suggestions = build_suggestions(&[
            observations[0].clone(),
            observations[1].clone(),
            observations[2].clone(),
            suppressed_feedback,
        ]);

        assert!(suggestions.is_empty());
    }

    #[test]
    fn builds_rule_review_tuning_suggestion_for_often_rejected_rule() {
        let observations = review_decision_source_observations();

        let suggestions = build_suggestions(&observations);

        assert_eq!(suggestions.len(), 1);
        match &suggestions[0] {
            LearnerSuggestionDto::RuleReviewTuningSuggestion {
                preset_id,
                rule_id,
                rejection_count,
                sample_source_paths,
                ..
            } => {
                assert_eq!(preset_id, "preset-1");
                assert_eq!(rule_id, "rule-photos");
                assert_eq!(*rejection_count, 2);
                assert_eq!(
                    sample_source_paths,
                    &vec![
                        "/tmp/archive/photo-2.jpg".to_string(),
                        "/tmp/archive/photo-3.jpg".to_string()
                    ]
                );
            }
            _ => panic!("expected rule review suggestion"),
        }
    }

    #[test]
    fn accepted_feedback_is_reflected_on_rule_review_suggestion() {
        let mut observations = review_decision_source_observations();
        observations.push(build_suggestion_feedback_observation(
            &RecordLearnerSuggestionFeedbackRequest {
                suggestion_id: "rule-review-tuning:preset-1:rule-photos".to_string(),
                preset_id: "preset-1".to_string(),
                feedback: LearnerSuggestionFeedbackKind::AcceptedForLater,
            },
        ));

        let suggestions = build_suggestions(&observations);

        match &suggestions[0] {
            LearnerSuggestionDto::RuleReviewTuningSuggestion { feedback, .. } => {
                assert_eq!(
                    *feedback,
                    Some(LearnerSuggestionFeedbackKind::AcceptedForLater)
                );
            }
            _ => panic!("expected rule review suggestion"),
        }
    }

    #[test]
    fn suppressing_rule_review_suggestion_hides_it() {
        let mut observations = review_decision_source_observations();
        observations.push(build_suggestion_feedback_observation(
            &RecordLearnerSuggestionFeedbackRequest {
                suggestion_id: "rule-review-tuning:preset-1:rule-photos".to_string(),
                preset_id: "preset-1".to_string(),
                feedback: LearnerSuggestionFeedbackKind::Suppressed,
            },
        ));

        let suggestions = build_suggestions(&observations);

        assert!(suggestions.is_empty());
    }

    #[test]
    fn builds_duplicate_keeper_draft_preview_from_suggestion() {
        let suggestions = build_suggestions(&suggestion_source_observations());
        let presets = vec![sample_rule_preview_preset()];

        let previews = build_draft_previews(&suggestions, &presets);

        assert_eq!(previews.len(), 1);
        match &previews[0] {
            LearnerDraftPreviewDto::DuplicateKeeperPolicyDraft {
                preset_id,
                before_duplicate_policy,
                after_duplicate_policy,
                before_review_mode,
                after_review_mode,
                ..
            } => {
                assert_eq!(preset_id, "preset-1");
                assert_eq!(*before_duplicate_policy, DuplicatePolicy::FlagOnly);
                assert_eq!(*after_duplicate_policy, DuplicatePolicy::FullReview);
                assert_eq!(*before_review_mode, ReviewMode::Standard);
                assert_eq!(*after_review_mode, ReviewMode::DuplicateFirst);
            }
            _ => panic!("expected duplicate keeper draft preview"),
        }
    }

    #[test]
    fn builds_rule_review_draft_preview_from_suggestion() {
        let suggestions = build_suggestions(&review_decision_source_observations());
        let presets = vec![sample_rule_preview_preset()];

        let previews = build_draft_previews(&suggestions, &presets);

        assert_eq!(previews.len(), 1);
        match &previews[0] {
            LearnerDraftPreviewDto::RuleReviewTuningDraft {
                rule_id,
                before_action_kind,
                after_action_kind,
                condition_count,
                ..
            } => {
                assert_eq!(rule_id, "rule-photos");
                assert_eq!(*before_action_kind, PlannedActionKind::Move);
                assert_eq!(*after_action_kind, PlannedActionKind::Review);
                assert_eq!(*condition_count, 1);
            }
            _ => panic!("expected rule review draft preview"),
        }
    }

    #[test]
    fn materializes_duplicate_keeper_draft_into_new_preset() {
        let presets = vec![sample_rule_preview_preset()];
        let previews = build_draft_previews(
            &build_suggestions(&suggestion_source_observations()),
            &presets,
        );

        let materialized = materialize_preset_draft(
            &SaveLearnerDraftPreviewRequest {
                draft_id: "draft:duplicate-keeper-policy:preset-1".to_string(),
            },
            &previews,
            &presets,
        )
        .expect("materialize duplicate draft");

        assert_eq!(materialized.preset_id, "preset-1__learner_draft");
        assert_eq!(
            materialized.plan_options.duplicate_policy,
            DuplicatePolicy::FullReview
        );
        assert_eq!(
            materialized.plan_options.review_mode,
            ReviewMode::DuplicateFirst
        );
    }

    #[test]
    fn materializes_rule_review_draft_into_new_preset() {
        let presets = vec![sample_rule_preview_preset()];
        let previews = build_draft_previews(
            &build_suggestions(&review_decision_source_observations()),
            &presets,
        );

        let materialized = materialize_preset_draft(
            &SaveLearnerDraftPreviewRequest {
                draft_id: "draft:rule-review-tuning:preset-1:rule-photos".to_string(),
            },
            &previews,
            &presets,
        )
        .expect("materialize rule draft");

        assert_eq!(materialized.preset_id, "preset-1__learner_draft");
        assert_eq!(
            materialized.rule_set.rules[0].action_kind,
            PlannedActionKind::Review
        );
    }

    fn suggestion_source_observations() -> [LearnerObservationDto; 3] {
        let plan = sample_plan();
        let group = &plan.duplicate_groups[0];
        let agreeing =
            build_duplicate_keeper_observation(&plan, group, None).expect("agreeing observation");
        let corrected_once = build_duplicate_keeper_observation(
            &plan,
            &PlanDuplicateGroupDto {
                group_id: "group-2".to_string(),
                representative_name: "archive-photo.jpg".to_string(),
                selected_keeper_entry_id: Some("entry-1".to_string()),
                ..group.clone()
            },
            None,
        )
        .expect("corrected observation");
        let corrected_twice = build_duplicate_keeper_observation(
            &PlanDto {
                preset_id: "preset-1".to_string(),
                ..plan.clone()
            },
            &PlanDuplicateGroupDto {
                group_id: "group-3".to_string(),
                representative_name: "scan.png".to_string(),
                selected_keeper_entry_id: Some("entry-1".to_string()),
                ..group.clone()
            },
            None,
        )
        .expect("second corrected observation");

        [agreeing, corrected_once, corrected_twice]
    }

    fn review_decision_source_observations() -> Vec<LearnerObservationDto> {
        vec![
            LearnerObservationDto::PlannedActionReviewDecision {
                observation_id: "obs-1".to_string(),
                observed_at_epoch_ms: 10,
                schema_version: LEARNER_OBSERVATION_SCHEMA_VERSION,
                plan_id: "plan-1".to_string(),
                job_id: "job-1".to_string(),
                preset_id: "preset-1".to_string(),
                action_id: "action-1".to_string(),
                source_entry_id: "entry-1".to_string(),
                source_path: "/tmp/archive/photo-1.jpg".to_string(),
                action_kind: PlannedActionKind::Move,
                matched_rule_id: Some("rule-photos".to_string()),
                decision: ReviewDecision::Approve,
                resulting_review_state: ReviewState::Approved,
                safety_flags: Vec::new(),
                conflict_status: None,
            },
            LearnerObservationDto::PlannedActionReviewDecision {
                observation_id: "obs-2".to_string(),
                observed_at_epoch_ms: 20,
                schema_version: LEARNER_OBSERVATION_SCHEMA_VERSION,
                plan_id: "plan-2".to_string(),
                job_id: "job-1".to_string(),
                preset_id: "preset-1".to_string(),
                action_id: "action-2".to_string(),
                source_entry_id: "entry-2".to_string(),
                source_path: "/tmp/archive/photo-2.jpg".to_string(),
                action_kind: PlannedActionKind::Move,
                matched_rule_id: Some("rule-photos".to_string()),
                decision: ReviewDecision::Reject,
                resulting_review_state: ReviewState::Rejected,
                safety_flags: Vec::new(),
                conflict_status: None,
            },
            LearnerObservationDto::PlannedActionReviewDecision {
                observation_id: "obs-3".to_string(),
                observed_at_epoch_ms: 30,
                schema_version: LEARNER_OBSERVATION_SCHEMA_VERSION,
                plan_id: "plan-3".to_string(),
                job_id: "job-1".to_string(),
                preset_id: "preset-1".to_string(),
                action_id: "action-3".to_string(),
                source_entry_id: "entry-3".to_string(),
                source_path: "/tmp/archive/photo-3.jpg".to_string(),
                action_kind: PlannedActionKind::Move,
                matched_rule_id: Some("rule-photos".to_string()),
                decision: ReviewDecision::Reject,
                resulting_review_state: ReviewState::Rejected,
                safety_flags: Vec::new(),
                conflict_status: None,
            },
        ]
    }

    fn sample_plan() -> PlanDto {
        PlanDto {
            plan_id: "plan-1".to_string(),
            job_id: "job-1".to_string(),
            preset_id: "preset-1".to_string(),
            preset_name: "Preset".to_string(),
            destination_root: "/tmp".to_string(),
            plan_options: crate::types::PlanOptionsDto {
                checksum_mode: crate::types::ChecksumMode::Off,
                duplicate_policy: crate::types::DuplicatePolicy::FlagOnly,
                review_mode: crate::types::ReviewMode::Standard,
                project_safety_mode: crate::types::ProjectSafetyMode::On,
                fallback_behavior: crate::types::FallbackBehavior::Skip,
            },
            summary: PlanSummaryDto {
                total_actions: 0,
                move_actions: 0,
                review_actions: 0,
                blocked_actions: 0,
                skipped_actions: 0,
            },
            duplicate_groups: vec![PlanDuplicateGroupDto {
                group_id: "group-1".to_string(),
                certainty: DuplicateCertainty::Definite,
                representative_name: "photo.jpg".to_string(),
                item_count: 2,
                member_action_ids: vec!["action-1".to_string(), "action-2".to_string()],
                member_entry_ids: vec!["entry-1".to_string(), "entry-2".to_string()],
                selected_keeper_entry_id: Some("entry-2".to_string()),
                recommended_keeper_entry_id: Some("entry-2".to_string()),
                recommended_keeper_reason: Some("Newest file".to_string()),
            }],
            actions: Vec::new(),
        }
    }

    fn sample_review_plan(review_state: ReviewState) -> PlanDto {
        PlanDto {
            plan_id: "plan-1".to_string(),
            job_id: "job-1".to_string(),
            preset_id: "preset-1".to_string(),
            preset_name: "Preset".to_string(),
            destination_root: "/tmp".to_string(),
            plan_options: crate::types::PlanOptionsDto {
                checksum_mode: crate::types::ChecksumMode::Off,
                duplicate_policy: crate::types::DuplicatePolicy::FlagOnly,
                review_mode: crate::types::ReviewMode::Standard,
                project_safety_mode: crate::types::ProjectSafetyMode::On,
                fallback_behavior: crate::types::FallbackBehavior::Skip,
            },
            summary: PlanSummaryDto {
                total_actions: 1,
                move_actions: 1,
                review_actions: 0,
                blocked_actions: 0,
                skipped_actions: 0,
            },
            duplicate_groups: Vec::new(),
            actions: vec![PlannedActionDto {
                action_id: "action-1".to_string(),
                source_entry_id: "entry-1".to_string(),
                source_path: "/tmp/archive/photo-1.jpg".to_string(),
                destination_path: Some("/tmp/photos/photo-1.jpg".to_string()),
                duplicate_group_id: None,
                action_kind: PlannedActionKind::Move,
                review_state,
                explanation: crate::types::ActionExplanationDto {
                    matched_preset: "preset-1".to_string(),
                    matched_rule: Some("rule-photos".to_string()),
                    matched_conditions: vec!["category=image".to_string()],
                    rule_priority: Some(10),
                    confidence: 0.9,
                    safety_flags: Vec::new(),
                    duplicate_tier: None,
                    protection_state: None,
                    blocked_reason: None,
                    destination_root: Some("/tmp/photos".to_string()),
                    template_used: Some("Photos/{{filename}}".to_string()),
                    template_error: None,
                    previewed_template_output: Some("Photos/photo-1.jpg".to_string()),
                    destination_conflict_path: None,
                    conflict_status: None,
                    notes: vec!["Routed by photo rule".to_string()],
                },
            }],
        }
    }

    fn sample_rule_preview_preset() -> PresetDefinitionDto {
        PresetDefinitionDto {
            preset_id: "preset-1".to_string(),
            name: "Preset".to_string(),
            description: "Preview preset".to_string(),
            rule_set: crate::types::RuleSetDto {
                rule_set_id: "preset-1-rules".to_string(),
                name: "Preset rules".to_string(),
                rules: vec![crate::types::RuleDto {
                    rule_id: "rule-photos".to_string(),
                    name: "Photos".to_string(),
                    priority: 100,
                    conditions: vec![crate::types::RuleConditionDto::FileCategory {
                        category: crate::types::FileCategory::Image,
                    }],
                    action_kind: PlannedActionKind::Move,
                    destination_template: Some("Images/{file_year}/{file_month}".to_string()),
                    explanation: "Move photos.".to_string(),
                }],
            },
            plan_options: crate::types::PlanOptionsDto {
                checksum_mode: crate::types::ChecksumMode::Off,
                duplicate_policy: DuplicatePolicy::FlagOnly,
                review_mode: ReviewMode::Standard,
                project_safety_mode: crate::types::ProjectSafetyMode::On,
                fallback_behavior: crate::types::FallbackBehavior::Skip,
            },
        }
    }
}
