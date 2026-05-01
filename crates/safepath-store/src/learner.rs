use rusqlite::params;
use safepath_core::{
    learner, LearnerDraftPreviewDto, LearnerObservationDto, LearnerSuggestionDto,
    RecordLearnerSuggestionFeedbackRequest, SaveLearnerDraftPreviewRequest,
};

use crate::Store;

impl Store {
    pub fn save_learner_observation(
        &self,
        observation: &LearnerObservationDto,
    ) -> Result<(), String> {
        let connection = self.connection()?;
        let payload_json = serde_json::to_string(observation).map_err(|error| error.to_string())?;
        connection
            .execute(
                "INSERT INTO learner_observations (observation_id, payload_json) VALUES (?1, ?2)",
                params![observation.observation_id(), payload_json],
            )
            .map_err(|error| error.to_string())?;
        Ok(())
    }

    pub fn list_learner_observations(
        &self,
        limit: u32,
    ) -> Result<Vec<LearnerObservationDto>, String> {
        let safe_limit = limit.max(1);
        let connection = self.connection()?;
        let mut statement = connection
            .prepare(
                "SELECT payload_json
                 FROM learner_observations
                 ORDER BY rowid DESC
                 LIMIT ?1",
            )
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map(params![i64::from(safe_limit)], |row| {
                row.get::<_, String>(0)
            })
            .map_err(|error| error.to_string())?;
        rows.map(|row| {
            row.map_err(|error| error.to_string()).and_then(|json| {
                serde_json::from_str::<LearnerObservationDto>(&json)
                    .map_err(|error| error.to_string())
            })
        })
        .collect::<Result<Vec<_>, _>>()
    }

    pub fn save_learner_suggestion_feedback(
        &self,
        request: &RecordLearnerSuggestionFeedbackRequest,
    ) -> Result<(), String> {
        let observations = self.list_learner_observations(5_000)?;
        let suggestions = learner::build_suggestions(&observations);
        let exists = suggestions.iter().any(|suggestion| {
            suggestion.suggestion_id() == request.suggestion_id
                && suggestion.preset_id() == request.preset_id
        });
        if !exists {
            return Err(format!(
                "Learner suggestion `{}` is no longer active.",
                request.suggestion_id
            ));
        }

        let observation = learner::build_suggestion_feedback_observation(request);
        self.save_learner_observation(&observation)
    }

    pub fn list_learner_suggestions(
        &self,
        observation_limit: u32,
        suggestion_limit: u32,
    ) -> Result<Vec<LearnerSuggestionDto>, String> {
        let safe_suggestion_limit = suggestion_limit.max(1) as usize;
        let observations = self.list_learner_observations(observation_limit)?;
        let mut suggestions = learner::build_suggestions(&observations);
        suggestions.truncate(safe_suggestion_limit);
        Ok(suggestions)
    }

    pub fn list_learner_draft_previews(
        &self,
        observation_limit: u32,
        suggestion_limit: u32,
    ) -> Result<Vec<LearnerDraftPreviewDto>, String> {
        let suggestions = self.list_learner_suggestions(observation_limit, suggestion_limit)?;
        let presets = self.list_presets()?;
        Ok(learner::build_draft_previews(&suggestions, &presets))
    }

    pub fn save_learner_draft_as_preset(
        &self,
        request: &SaveLearnerDraftPreviewRequest,
    ) -> Result<safepath_core::PresetDefinitionDto, String> {
        let observations = self.list_learner_observations(5_000)?;
        let suggestions = learner::build_suggestions(&observations);
        let presets = self.list_presets()?;
        let drafts = learner::build_draft_previews(&suggestions, &presets);
        let preset = learner::materialize_preset_draft(request, &drafts, &presets)?;
        let source_preset_id = match drafts.iter().find(|draft| match draft {
            LearnerDraftPreviewDto::DuplicateKeeperPolicyDraft { draft_id, .. } => {
                draft_id == &request.draft_id
            }
            LearnerDraftPreviewDto::RuleReviewTuningDraft { draft_id, .. } => {
                draft_id == &request.draft_id
            }
        }) {
            Some(LearnerDraftPreviewDto::DuplicateKeeperPolicyDraft {
                suggestion_id,
                preset_id,
                ..
            })
            | Some(LearnerDraftPreviewDto::RuleReviewTuningDraft {
                suggestion_id,
                preset_id,
                ..
            }) => Some((suggestion_id.clone(), preset_id.clone())),
            None => None,
        };

        self.upsert_presets(std::slice::from_ref(&preset))?;

        if let Some((suggestion_id, preset_id)) = source_preset_id {
            self.save_learner_suggestion_feedback(&RecordLearnerSuggestionFeedbackRequest {
                suggestion_id,
                preset_id,
                feedback: safepath_core::LearnerSuggestionFeedbackKind::AcceptedForLater,
            })?;
        }

        Ok(preset)
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use safepath_core::{
        learner, DuplicateCertainty, LearnerObservationDto, LearnerSuggestionFeedbackKind, PlanDto,
        PlanDuplicateGroupDto, PlanSummaryDto, PlannedActionKind, PresetDefinitionDto,
        RecordLearnerSuggestionFeedbackRequest, ReviewDecision, ReviewState,
        SaveLearnerDraftPreviewRequest,
    };
    use uuid::Uuid;

    use crate::Store;

    #[test]
    fn saves_and_lists_recent_observations() {
        let db_path = temp_db_path();
        let store = Store::new(&db_path).expect("store");
        let plan = sample_plan();
        let group = &plan.duplicate_groups[0];

        let first = learner::build_duplicate_keeper_observation(&plan, group, None)
            .expect("first observation");
        let second = learner::build_duplicate_keeper_observation(
            &plan,
            &PlanDuplicateGroupDto {
                selected_keeper_entry_id: Some("entry-1".to_string()),
                ..group.clone()
            },
            None,
        )
        .expect("second observation");

        store
            .save_learner_observation(&first)
            .expect("save first observation");
        store
            .save_learner_observation(&second)
            .expect("save second observation");

        let observations = store
            .list_learner_observations(10)
            .expect("list observations");

        assert_eq!(observations.len(), 2);
        assert_eq!(observations[0].observation_id(), second.observation_id());
        assert_eq!(observations[1].observation_id(), first.observation_id());

        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn lists_duplicate_keeper_suggestions_from_saved_observations() {
        let db_path = temp_db_path();
        let store = Store::new(&db_path).expect("store");
        let plan = sample_plan();
        let group = &plan.duplicate_groups[0];
        let agreeing =
            learner::build_duplicate_keeper_observation(&plan, group, None).expect("agreeing");
        let corrected_once = learner::build_duplicate_keeper_observation(
            &plan,
            &PlanDuplicateGroupDto {
                group_id: "group-2".to_string(),
                representative_name: "archive-photo.jpg".to_string(),
                selected_keeper_entry_id: Some("entry-1".to_string()),
                ..group.clone()
            },
            None,
        )
        .expect("corrected");
        let corrected_twice = learner::build_duplicate_keeper_observation(
            &plan,
            &PlanDuplicateGroupDto {
                group_id: "group-3".to_string(),
                representative_name: "scan.png".to_string(),
                selected_keeper_entry_id: Some("entry-1".to_string()),
                ..group.clone()
            },
            None,
        )
        .expect("second corrected");

        store
            .save_learner_observation(&agreeing)
            .expect("save first observation");
        store
            .save_learner_observation(&corrected_once)
            .expect("save second observation");
        store
            .save_learner_observation(&corrected_twice)
            .expect("save third observation");

        let suggestions = store
            .list_learner_suggestions(20, 10)
            .expect("list learner suggestions");

        assert_eq!(suggestions.len(), 1);
        assert_eq!(
            suggestions[0].suggestion_id(),
            "duplicate-keeper-policy:preset-1"
        );

        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn suppressed_feedback_hides_saved_suggestion() {
        let db_path = temp_db_path();
        let store = Store::new(&db_path).expect("store");
        seed_suggestion_source_observations(&store);

        store
            .save_learner_suggestion_feedback(&RecordLearnerSuggestionFeedbackRequest {
                suggestion_id: "duplicate-keeper-policy:preset-1".to_string(),
                preset_id: "preset-1".to_string(),
                feedback: LearnerSuggestionFeedbackKind::Suppressed,
            })
            .expect("save suggestion feedback");

        let suggestions = store
            .list_learner_suggestions(20, 10)
            .expect("list learner suggestions");

        assert!(suggestions.is_empty());

        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn rejects_feedback_for_nonexistent_suggestion() {
        let db_path = temp_db_path();
        let store = Store::new(&db_path).expect("store");

        let error = store
            .save_learner_suggestion_feedback(&RecordLearnerSuggestionFeedbackRequest {
                suggestion_id: "missing".to_string(),
                preset_id: "preset-1".to_string(),
                feedback: LearnerSuggestionFeedbackKind::Suppressed,
            })
            .expect_err("should reject missing suggestion");

        assert!(error.contains("no longer active"));

        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn lists_rule_review_suggestions_from_saved_observations() {
        let db_path = temp_db_path();
        let store = Store::new(&db_path).expect("store");
        seed_rule_review_observations(&store);

        let suggestions = store
            .list_learner_suggestions(20, 10)
            .expect("list learner suggestions");

        assert_eq!(suggestions.len(), 1);
        assert_eq!(
            suggestions[0].suggestion_id(),
            "rule-review-tuning:preset-1:rule-photos"
        );

        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn lists_draft_previews_from_saved_signals() {
        let db_path = temp_db_path();
        let store = Store::new(&db_path).expect("store");
        store
            .upsert_presets(&[sample_preview_preset()])
            .expect("seed presets");
        seed_suggestion_source_observations(&store);

        let drafts = store
            .list_learner_draft_previews(20, 10)
            .expect("list learner draft previews");

        assert_eq!(drafts.len(), 1);

        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn saves_duplicate_policy_draft_as_new_preset() {
        let db_path = temp_db_path();
        let store = Store::new(&db_path).expect("store");
        store
            .upsert_presets(&[sample_preview_preset()])
            .expect("seed presets");
        seed_suggestion_source_observations(&store);

        let saved = store
            .save_learner_draft_as_preset(&SaveLearnerDraftPreviewRequest {
                draft_id: "draft:duplicate-keeper-policy:preset-1".to_string(),
            })
            .expect("save learner draft");

        assert_eq!(saved.preset_id, "preset-1__learner_draft");
        assert_eq!(
            saved.plan_options.duplicate_policy,
            safepath_core::DuplicatePolicy::FullReview
        );
        assert_eq!(
            saved.plan_options.review_mode,
            safepath_core::ReviewMode::DuplicateFirst
        );
        assert_eq!(store.list_presets().expect("presets").len(), 2);

        let _ = std::fs::remove_file(db_path);
    }

    fn temp_db_path() -> PathBuf {
        PathBuf::from(format!(
            "{}/safepath-learner-{}.sqlite3",
            std::env::temp_dir().display(),
            Uuid::new_v4()
        ))
    }

    fn sample_plan() -> PlanDto {
        PlanDto {
            plan_id: "plan-1".to_string(),
            job_id: "job-1".to_string(),
            preset_id: "preset-1".to_string(),
            preset_name: "Preset".to_string(),
            destination_root: "/tmp".to_string(),
            plan_options: safepath_core::PlanOptionsDto {
                checksum_mode: safepath_core::ChecksumMode::Off,
                duplicate_policy: safepath_core::DuplicatePolicy::FlagOnly,
                review_mode: safepath_core::ReviewMode::Standard,
                project_safety_mode: safepath_core::ProjectSafetyMode::On,
                fallback_behavior: safepath_core::FallbackBehavior::Skip,
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
                recommended_keeper_confidence: Some(0.8),
                recommended_keeper_reason_tags: vec!["newest available timestamp".to_string()],
                match_basis: None,
                confidence: None,
                evidence: None,
                match_explanation: None,
                stable_group_key: None,
            }],
            actions: Vec::new(),
            config_fingerprint: None,
            duplicate_config_snapshot: None,
        }
    }

    fn sample_preview_preset() -> PresetDefinitionDto {
        PresetDefinitionDto {
            preset_id: "preset-1".to_string(),
            name: "Preset".to_string(),
            description: "Preview preset".to_string(),
            rule_set: safepath_core::RuleSetDto {
                rule_set_id: "preset-1-rules".to_string(),
                name: "Preset rules".to_string(),
                rules: vec![safepath_core::RuleDto {
                    rule_id: "rule-photos".to_string(),
                    name: "Photos".to_string(),
                    priority: 100,
                    conditions: vec![safepath_core::RuleConditionDto::FileCategory {
                        category: safepath_core::FileCategory::Image,
                    }],
                    action_kind: PlannedActionKind::Move,
                    destination_template: Some("Images/{file_year}/{file_month}".to_string()),
                    explanation: "Move photos.".to_string(),
                }],
            },
            plan_options: safepath_core::PlanOptionsDto {
                checksum_mode: safepath_core::ChecksumMode::Off,
                duplicate_policy: safepath_core::DuplicatePolicy::FlagOnly,
                review_mode: safepath_core::ReviewMode::Standard,
                project_safety_mode: safepath_core::ProjectSafetyMode::On,
                fallback_behavior: safepath_core::FallbackBehavior::Skip,
            },
        }
    }

    fn seed_suggestion_source_observations(store: &Store) {
        let plan = sample_plan();
        let group = &plan.duplicate_groups[0];
        let agreeing =
            learner::build_duplicate_keeper_observation(&plan, group, None).expect("agreeing");
        let corrected_once = learner::build_duplicate_keeper_observation(
            &plan,
            &PlanDuplicateGroupDto {
                group_id: "group-2".to_string(),
                representative_name: "archive-photo.jpg".to_string(),
                selected_keeper_entry_id: Some("entry-1".to_string()),
                ..group.clone()
            },
            None,
        )
        .expect("corrected");
        let corrected_twice = learner::build_duplicate_keeper_observation(
            &plan,
            &PlanDuplicateGroupDto {
                group_id: "group-3".to_string(),
                representative_name: "scan.png".to_string(),
                selected_keeper_entry_id: Some("entry-1".to_string()),
                ..group.clone()
            },
            None,
        )
        .expect("second corrected");

        store
            .save_learner_observation(&agreeing)
            .expect("save first observation");
        store
            .save_learner_observation(&corrected_once)
            .expect("save second observation");
        store
            .save_learner_observation(&corrected_twice)
            .expect("save third observation");
    }

    fn seed_rule_review_observations(store: &Store) {
        for observation in [
            LearnerObservationDto::PlannedActionReviewDecision {
                observation_id: "obs-1".to_string(),
                observed_at_epoch_ms: 10,
                schema_version: learner::LEARNER_OBSERVATION_SCHEMA_VERSION,
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
                schema_version: learner::LEARNER_OBSERVATION_SCHEMA_VERSION,
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
                schema_version: learner::LEARNER_OBSERVATION_SCHEMA_VERSION,
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
        ] {
            store
                .save_learner_observation(&observation)
                .expect("save rule review observation");
        }
    }
}
