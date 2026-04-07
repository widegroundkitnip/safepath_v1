use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::analyzer::suggested_preset_for_source_profile;
use crate::types::{
    AiEvaluationSnapshotDto, AiEvaluationStatus, AiEvaluationTaskDto, LearnerObservationDto,
    ReviewState, SourceProfileKind,
};

const MIN_PRESET_EVAL_OBSERVATIONS: u32 = 4;
const MIN_PRESET_SUPPORT: u32 = 3;
const MIN_PRESET_RATE: f32 = 0.6;
const MIN_REVIEW_EVAL_OBSERVATIONS: u32 = 5;
const MIN_REVIEW_STRICT_RATE: f32 = 0.6;
const MIN_REVIEW_STANDARD_RATE: f32 = 0.8;

pub fn build_ai_evaluation_snapshot(
    observations: &[LearnerObservationDto],
) -> AiEvaluationSnapshotDto {
    AiEvaluationSnapshotDto {
        generated_at_epoch_ms: now_epoch_ms(),
        total_observation_count: observations.len() as u32,
        tasks: vec![
            evaluate_structure_preset_recommendation(observations),
            evaluate_review_mode_preference(observations),
            evaluate_duplicate_recommendation_readiness(observations),
        ],
        notes: vec![
            "This snapshot uses only local observations already stored on the device.".to_string(),
            "Candidate comparisons abstain when history is too thin, because false confidence would erode trust.".to_string(),
            "Duplicate recommendation still needs richer offline feature snapshots before alternate replay is trustworthy.".to_string(),
        ],
    }
}

fn evaluate_structure_preset_recommendation(
    observations: &[LearnerObservationDto],
) -> AiEvaluationTaskDto {
    let samples = observations
        .iter()
        .filter_map(|observation| match observation {
            LearnerObservationDto::PresetSelectionContext {
                source_profile_kind: Some(source_profile_kind),
                preset_id,
                ..
            } => Some((*source_profile_kind, preset_id.clone())),
            _ => None,
        })
        .collect::<Vec<_>>();

    if samples.is_empty() {
        return AiEvaluationTaskDto {
            task_id: "structure-preset-recommendation".to_string(),
            title: "Structure preset recommendation".to_string(),
            summary: "No local preset-selection context has been recorded yet.".to_string(),
            baseline_name: "Structure heuristic preset mapping".to_string(),
            candidate_name: Some("Leave-one-out local preset affinity".to_string()),
            observation_count: 0,
            candidate_coverage_count: 0,
            baseline_match_rate: None,
            candidate_match_rate: None,
            recommendation: "Keep the shipped structure heuristic until more scans build local preset-choice history.".to_string(),
            confidence_guidance: "Only compare personalized preset hints after several similar scans exist.".to_string(),
            trust_notes: vec![
                "No profile-labelled preset choices are available for evaluation yet.".to_string(),
            ],
            status: AiEvaluationStatus::InsufficientData,
        };
    }

    let mut counts_by_profile = HashMap::<SourceProfileKind, HashMap<String, u32>>::new();
    let mut totals_by_profile = HashMap::<SourceProfileKind, u32>::new();
    for (profile_kind, preset_id) in &samples {
        *totals_by_profile.entry(*profile_kind).or_insert(0) += 1;
        *counts_by_profile
            .entry(*profile_kind)
            .or_default()
            .entry(preset_id.clone())
            .or_insert(0) += 1;
    }

    let observation_count = samples.len() as u32;
    let baseline_match_count = samples
        .iter()
        .filter(|(profile_kind, preset_id)| {
            suggested_preset_for_source_profile(*profile_kind)
                .is_some_and(|(suggested_preset_id, _, _)| suggested_preset_id == preset_id)
        })
        .count() as u32;

    let mut candidate_match_count = 0_u32;
    let mut candidate_coverage_count = 0_u32;
    for (profile_kind, preset_id) in &samples {
        let Some(predicted_preset_id) = leave_one_out_preset_affinity_prediction(
            *profile_kind,
            preset_id,
            &counts_by_profile,
            &totals_by_profile,
        ) else {
            continue;
        };
        candidate_coverage_count += 1;
        if predicted_preset_id == *preset_id {
            candidate_match_count += 1;
        }
    }

    let baseline_match_rate = Some(rate(baseline_match_count, observation_count));
    let candidate_match_rate = if candidate_coverage_count > 0 {
        Some(rate(candidate_match_count, candidate_coverage_count))
    } else {
        None
    };
    let candidate_abstain_count = observation_count.saturating_sub(candidate_coverage_count);

    let status = if observation_count < MIN_PRESET_EVAL_OBSERVATIONS
        || candidate_coverage_count < MIN_PRESET_SUPPORT
    {
        AiEvaluationStatus::InsufficientData
    } else if candidate_match_rate.unwrap_or_default()
        > baseline_match_rate.unwrap_or_default() + 0.05
    {
        AiEvaluationStatus::CandidatePromising
    } else {
        AiEvaluationStatus::KeepHeuristic
    };

    let recommendation = match status {
        AiEvaluationStatus::InsufficientData => {
            "Local preset-affinity evidence is still thin, so structure heuristics should remain the shipped default.".to_string()
        }
        AiEvaluationStatus::CandidatePromising => {
            "The local preset-affinity candidate looks promising for future opt-in evaluation, but the shipped heuristic should stay primary until coverage grows.".to_string()
        }
        AiEvaluationStatus::KeepHeuristic => {
            "Current structure heuristics remain the safer preset default for now.".to_string()
        }
    };

    AiEvaluationTaskDto {
        task_id: "structure-preset-recommendation".to_string(),
        title: "Structure preset recommendation".to_string(),
        summary: "Compares the current structure-based preset heuristic with a leave-one-out local preset-affinity candidate.".to_string(),
        baseline_name: "Structure heuristic preset mapping".to_string(),
        candidate_name: Some("Leave-one-out local preset affinity".to_string()),
        observation_count,
        candidate_coverage_count,
        baseline_match_rate,
        candidate_match_rate,
        recommendation,
        confidence_guidance: "Preset confidence bands should stay conservative when profile counts are low or the personalized candidate abstains often.".to_string(),
        trust_notes: vec![
            format!(
                "Baseline matched {} of {} recorded preset choices.",
                baseline_match_count, observation_count
            ),
            format!(
                "Candidate abstained on {} scans because similar local history was too thin.",
                candidate_abstain_count
            ),
        ],
        status,
    }
}

fn evaluate_review_mode_preference(observations: &[LearnerObservationDto]) -> AiEvaluationTaskDto {
    let signals = observations
        .iter()
        .filter_map(|observation| match observation {
            LearnerObservationDto::PlannedActionReviewDecision {
                preset_id,
                resulting_review_state,
                ..
            } => match resulting_review_state {
                ReviewState::Rejected => Some((preset_id.clone(), true)),
                ReviewState::Approved => Some((preset_id.clone(), false)),
                _ => None,
            },
            LearnerObservationDto::DuplicateKeeperSelection {
                preset_id,
                user_agreed_with_recommendation,
                ..
            } => Some((preset_id.clone(), !user_agreed_with_recommendation)),
            _ => None,
        })
        .collect::<Vec<_>>();

    if signals.is_empty() {
        return AiEvaluationTaskDto {
            task_id: "review-mode-preference".to_string(),
            title: "Review mode preference".to_string(),
            summary: "No local review or duplicate-correction outcomes have been recorded yet.".to_string(),
            baseline_name: "No personalization (stay with standard review)".to_string(),
            candidate_name: Some("Leave-one-out preset tendency model".to_string()),
            observation_count: 0,
            candidate_coverage_count: 0,
            baseline_match_rate: None,
            candidate_match_rate: None,
            recommendation: "Keep the current non-personalized review defaults until more local review history exists.".to_string(),
            confidence_guidance: "Any future review-mode defaults should abstain quickly on mixed histories.".to_string(),
            trust_notes: vec![
                "No local review tendency signals are available for evaluation yet.".to_string(),
            ],
            status: AiEvaluationStatus::InsufficientData,
        };
    }

    let mut totals_by_preset = HashMap::<String, u32>::new();
    let mut conservative_by_preset = HashMap::<String, u32>::new();
    for (preset_id, is_conservative) in &signals {
        *totals_by_preset.entry(preset_id.clone()).or_insert(0) += 1;
        if *is_conservative {
            *conservative_by_preset.entry(preset_id.clone()).or_insert(0) += 1;
        }
    }

    let observation_count = signals.len() as u32;
    let baseline_match_count = signals
        .iter()
        .filter(|(_, is_conservative)| !*is_conservative)
        .count() as u32;

    let mut candidate_match_count = 0_u32;
    let mut candidate_coverage_count = 0_u32;
    let mut strict_false_positive_count = 0_u32;
    for (preset_id, is_conservative) in &signals {
        let Some(predicted_conservative) = leave_one_out_review_mode_prediction(
            preset_id,
            *is_conservative,
            &totals_by_preset,
            &conservative_by_preset,
        ) else {
            continue;
        };
        candidate_coverage_count += 1;
        if predicted_conservative == *is_conservative {
            candidate_match_count += 1;
        } else if predicted_conservative && !*is_conservative {
            strict_false_positive_count += 1;
        }
    }

    let baseline_match_rate = Some(rate(baseline_match_count, observation_count));
    let candidate_match_rate = if candidate_coverage_count > 0 {
        Some(rate(candidate_match_count, candidate_coverage_count))
    } else {
        None
    };

    let status = if observation_count < MIN_REVIEW_EVAL_OBSERVATIONS
        || candidate_coverage_count < MIN_REVIEW_EVAL_OBSERVATIONS
    {
        AiEvaluationStatus::InsufficientData
    } else if candidate_match_rate.unwrap_or_default()
        > baseline_match_rate.unwrap_or_default() + 0.05
        && strict_false_positive_count * 4 <= candidate_coverage_count
    {
        AiEvaluationStatus::CandidatePromising
    } else {
        AiEvaluationStatus::KeepHeuristic
    };

    let recommendation = match status {
        AiEvaluationStatus::InsufficientData => {
            "Review-mode personalization should stay off by default until more preset-level history exists.".to_string()
        }
        AiEvaluationStatus::CandidatePromising => {
            "The local review-tendency candidate is worth further evaluation, but it should remain advisory and conservative.".to_string()
        }
        AiEvaluationStatus::KeepHeuristic => {
            "Current non-personalized review defaults remain safer than switching modes from thin local history.".to_string()
        }
    };

    AiEvaluationTaskDto {
        task_id: "review-mode-preference".to_string(),
        title: "Review mode preference".to_string(),
        summary: "Compares a no-personalization baseline with a leave-one-out preset tendency model built from local review outcomes.".to_string(),
        baseline_name: "No personalization (stay with standard review)".to_string(),
        candidate_name: Some("Leave-one-out preset tendency model".to_string()),
        observation_count,
        candidate_coverage_count,
        baseline_match_rate,
        candidate_match_rate,
        recommendation,
        confidence_guidance: "False positives on strict review should be treated as trust failures, so mixed histories should cause the candidate to abstain.".to_string(),
        trust_notes: vec![
            format!(
                "Baseline matched {} of {} local review outcomes.",
                baseline_match_count, observation_count
            ),
            format!(
                "Candidate strict-mode false positives: {}.",
                strict_false_positive_count
            ),
            format!(
                "Candidate abstained on {} outcomes because preset history was too thin or mixed.",
                observation_count.saturating_sub(candidate_coverage_count)
            ),
        ],
        status,
    }
}

fn evaluate_duplicate_recommendation_readiness(
    observations: &[LearnerObservationDto],
) -> AiEvaluationTaskDto {
    let samples = observations
        .iter()
        .filter_map(|observation| match observation {
            LearnerObservationDto::DuplicateKeeperSelection {
                recommended_keeper_entry_id: Some(_),
                user_agreed_with_recommendation,
                ..
            } => Some(*user_agreed_with_recommendation),
            _ => None,
        })
        .collect::<Vec<_>>();

    let observation_count = samples.len() as u32;
    let agreement_count = samples.iter().filter(|agreed| **agreed).count() as u32;
    let disagreement_count = observation_count.saturating_sub(agreement_count);
    let status = if observation_count >= MIN_PRESET_SUPPORT {
        AiEvaluationStatus::KeepHeuristic
    } else {
        AiEvaluationStatus::InsufficientData
    };

    AiEvaluationTaskDto {
        task_id: "duplicate-keeper-recommendation".to_string(),
        title: "Duplicate keeper recommendation".to_string(),
        summary: "Tracks the shipped duplicate recommendation agreement rate and whether stored evidence is rich enough to replay alternate baselines.".to_string(),
        baseline_name: "Current shipped duplicate recommendation".to_string(),
        candidate_name: Some("Offline replay candidate (not yet available)".to_string()),
        observation_count,
        candidate_coverage_count: 0,
        baseline_match_rate: if observation_count > 0 {
            Some(rate(agreement_count, observation_count))
        } else {
            None
        },
        candidate_match_rate: None,
        recommendation: if observation_count >= MIN_PRESET_SUPPORT {
            "Keep the shipped duplicate heuristic and capture richer offline feature snapshots before comparing alternate models.".to_string()
        } else {
            "Not enough duplicate corrections have been recorded yet to judge alternate approaches safely.".to_string()
        },
        confidence_guidance: "Duplicate evaluation should only compare alternates after local snapshots preserve enough evidence to replay more than one scorer.".to_string(),
        trust_notes: vec![
            format!(
                "{} of {} duplicate recommendations were corrected by the user.",
                disagreement_count, observation_count
            ),
            "Historical duplicate observations do not yet preserve enough feature detail to replay alternate baselines offline.".to_string(),
        ],
        status,
    }
}

fn leave_one_out_preset_affinity_prediction(
    profile_kind: SourceProfileKind,
    current_preset_id: &str,
    counts_by_profile: &HashMap<SourceProfileKind, HashMap<String, u32>>,
    totals_by_profile: &HashMap<SourceProfileKind, u32>,
) -> Option<String> {
    let total = totals_by_profile.get(&profile_kind).copied()?.saturating_sub(1);
    if total < MIN_PRESET_SUPPORT {
        return None;
    }

    let counts = counts_by_profile.get(&profile_kind)?;
    let mut best: Option<(String, u32)> = None;
    for (preset_id, count) in counts {
        let adjusted_count = count.saturating_sub(if preset_id == current_preset_id { 1 } else { 0 });
        if adjusted_count == 0 {
            continue;
        }
        let replace = best
            .as_ref()
            .is_none_or(|(best_preset_id, best_count)| adjusted_count > *best_count
                || (adjusted_count == *best_count && preset_id < best_preset_id));
        if replace {
            best = Some((preset_id.clone(), adjusted_count));
        }
    }

    let (preset_id, count) = best?;
    if rate(count, total) < MIN_PRESET_RATE {
        return None;
    }
    Some(preset_id)
}

fn leave_one_out_review_mode_prediction(
    preset_id: &str,
    current_is_conservative: bool,
    totals_by_preset: &HashMap<String, u32>,
    conservative_by_preset: &HashMap<String, u32>,
) -> Option<bool> {
    let total = totals_by_preset.get(preset_id).copied()?.saturating_sub(1);
    if total < MIN_REVIEW_EVAL_OBSERVATIONS {
        return None;
    }

    let conservative = conservative_by_preset
        .get(preset_id)
        .copied()
        .unwrap_or_default()
        .saturating_sub(u32::from(current_is_conservative));
    let permissive = total.saturating_sub(conservative);
    let conservative_rate = rate(conservative, total);
    let permissive_rate = rate(permissive, total);

    if conservative_rate >= MIN_REVIEW_STRICT_RATE {
        Some(true)
    } else if permissive_rate >= MIN_REVIEW_STANDARD_RATE && conservative <= 1 {
        Some(false)
    } else {
        None
    }
}

fn rate(numerator: u32, denominator: u32) -> f32 {
    if denominator == 0 {
        return 0.0;
    }
    numerator as f32 / denominator as f32
}

fn now_epoch_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

#[cfg(test)]
mod tests {
    use super::build_ai_evaluation_snapshot;
    use crate::types::{
        AiEvaluationStatus, LearnerObservationDto, ReviewDecision, ReviewState, SourceProfileKind,
    };

    #[test]
    fn structure_snapshot_compares_baseline_and_candidate() {
        let snapshot = build_ai_evaluation_snapshot(&[
            preset_selection("1", "project_safe", SourceProfileKind::ArchiveBundle),
            preset_selection("2", "project_safe", SourceProfileKind::ArchiveBundle),
            preset_selection("3", "project_safe", SourceProfileKind::ArchiveBundle),
            preset_selection("4", "general_organize", SourceProfileKind::ArchiveBundle),
        ]);

        let task = snapshot
            .tasks
            .iter()
            .find(|task| task.task_id == "structure-preset-recommendation")
            .expect("structure task");

        assert_eq!(task.observation_count, 4);
        assert_eq!(task.candidate_coverage_count, 4);
        assert_eq!(task.status, AiEvaluationStatus::CandidatePromising);
        assert!(task.candidate_match_rate.unwrap_or_default() > task.baseline_match_rate.unwrap_or_default());
    }

    #[test]
    fn review_mode_snapshot_reports_candidate_and_false_positive_guardrail() {
        let snapshot = build_ai_evaluation_snapshot(&[
            review_signal("1", true),
            review_signal("2", true),
            review_signal("3", true),
            review_signal("4", false),
            review_signal("5", false),
            duplicate_signal("6", false),
        ]);

        let task = snapshot
            .tasks
            .iter()
            .find(|task| task.task_id == "review-mode-preference")
            .expect("review task");

        assert_eq!(task.observation_count, 6);
        assert!(task.candidate_coverage_count >= 5);
        assert!(task.candidate_match_rate.is_some());
        assert!(!task.trust_notes.is_empty());
    }

    #[test]
    fn duplicate_snapshot_stays_conservative_without_replay_data() {
        let snapshot = build_ai_evaluation_snapshot(&[
            duplicate_signal("1", true),
            duplicate_signal("2", false),
            duplicate_signal("3", true),
        ]);

        let task = snapshot
            .tasks
            .iter()
            .find(|task| task.task_id == "duplicate-keeper-recommendation")
            .expect("duplicate task");

        assert_eq!(task.candidate_match_rate, None);
        assert_eq!(task.status, AiEvaluationStatus::KeepHeuristic);
    }

    fn preset_selection(
        suffix: &str,
        preset_id: &str,
        source_profile_kind: SourceProfileKind,
    ) -> LearnerObservationDto {
        LearnerObservationDto::PresetSelectionContext {
            observation_id: format!("preset-{suffix}"),
            observed_at_epoch_ms: suffix.parse().unwrap_or(1),
            schema_version: 1,
            plan_id: format!("plan-{suffix}"),
            job_id: format!("job-{suffix}"),
            preset_id: preset_id.to_string(),
            source_profile_kind: Some(source_profile_kind),
            source_profile_confidence: Some(0.8),
        }
    }

    fn review_signal(suffix: &str, conservative: bool) -> LearnerObservationDto {
        LearnerObservationDto::PlannedActionReviewDecision {
            observation_id: format!("review-{suffix}"),
            observed_at_epoch_ms: suffix.parse().unwrap_or(1),
            schema_version: 1,
            plan_id: "plan-1".to_string(),
            job_id: "job-1".to_string(),
            preset_id: "preset-1".to_string(),
            action_id: format!("action-{suffix}"),
            source_entry_id: format!("entry-{suffix}"),
            source_path: format!("/tmp/file-{suffix}.jpg"),
            action_kind: crate::types::PlannedActionKind::Move,
            matched_rule_id: Some("rule-1".to_string()),
            decision: if conservative {
                ReviewDecision::Reject
            } else {
                ReviewDecision::Approve
            },
            resulting_review_state: if conservative {
                ReviewState::Rejected
            } else {
                ReviewState::Approved
            },
            safety_flags: Vec::new(),
            conflict_status: None,
        }
    }

    fn duplicate_signal(suffix: &str, agreed: bool) -> LearnerObservationDto {
        LearnerObservationDto::DuplicateKeeperSelection {
            observation_id: format!("dup-{suffix}"),
            observed_at_epoch_ms: suffix.parse().unwrap_or(1),
            schema_version: 1,
            plan_id: "plan-1".to_string(),
            job_id: "job-1".to_string(),
            preset_id: "preset-1".to_string(),
            related_session_id: None,
            group_id: format!("group-{suffix}"),
            certainty: crate::types::DuplicateCertainty::Definite,
            representative_name: format!("photo-{suffix}.jpg"),
            item_count: 2,
            member_entry_ids: vec!["entry-1".to_string(), "entry-2".to_string()],
            member_action_ids: vec!["action-1".to_string(), "action-2".to_string()],
            recommended_keeper_entry_id: Some("entry-2".to_string()),
            recommended_keeper_reason: Some("Newest file".to_string()),
            selected_keeper_entry_id: if agreed {
                "entry-2".to_string()
            } else {
                "entry-1".to_string()
            },
            user_agreed_with_recommendation: agreed,
        }
    }
}
