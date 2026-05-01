use rusqlite::{params, OptionalExtension};
use safepath_core::{
    ActionRecordDto, ActionRecordStatus, ExecutionOperationKind, PlanDto, ReviewDecision,
    ReviewState,
};

use crate::Store;

impl Store {
    pub fn save_plan(&self, plan: &PlanDto) -> Result<(), String> {
        self.persist_plan(plan, false)
    }

    pub fn replace_plan(&self, plan: &PlanDto) -> Result<(), String> {
        self.persist_plan(plan, true)
    }

    pub fn get_plan(&self, plan_id: &str) -> Result<Option<PlanDto>, String> {
        let connection = self.connection()?;
        let payload = connection
            .query_row(
                "SELECT payload_json FROM plans WHERE plan_id = ?1",
                params![plan_id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|error| error.to_string())?;

        payload
            .map(|json| serde_json::from_str::<PlanDto>(&json).map_err(|error| error.to_string()))
            .transpose()
    }

    pub fn update_review_state(
        &self,
        plan_id: &str,
        action_ids: &[String],
        decision: ReviewDecision,
    ) -> Result<PlanDto, String> {
        let mut plan = self
            .get_plan(plan_id)?
            .ok_or_else(|| format!("Plan `{plan_id}` was not found."))?;

        if action_ids.is_empty() {
            return Ok(plan);
        }

        let duplicate_groups = plan.duplicate_groups.clone();
        for action in &mut plan.actions {
            if !action_ids
                .iter()
                .any(|action_id| action_id == &action.action_id)
            {
                continue;
            }

            if action.review_state == ReviewState::Blocked {
                continue;
            }

            if matches!(decision, ReviewDecision::Approve)
                && action.duplicate_group_id.as_ref().is_some_and(|group_id| {
                    duplicate_groups
                        .iter()
                        .find(|group| &group.group_id == group_id)
                        .and_then(|group| group.selected_keeper_entry_id.as_ref())
                        .is_none()
                })
            {
                return Err(
                    "Select a keeper for the duplicate group before approving those actions."
                        .to_string(),
                );
            }

            action.review_state = match decision {
                ReviewDecision::Approve => ReviewState::Approved,
                ReviewDecision::Reject => ReviewState::Rejected,
                ReviewDecision::Reset => baseline_review_state(action, &duplicate_groups),
            };
        }

        self.persist_plan(&plan, true)?;
        Ok(plan)
    }

    pub fn set_duplicate_keeper(
        &self,
        plan_id: &str,
        group_id: &str,
        keeper_entry_id: &str,
    ) -> Result<PlanDto, String> {
        let mut plan = self
            .get_plan(plan_id)?
            .ok_or_else(|| format!("Plan `{plan_id}` was not found."))?;

        let group_index = plan
            .duplicate_groups
            .iter()
            .position(|group| group.group_id == group_id)
            .ok_or_else(|| format!("Duplicate group `{group_id}` was not found."))?;

        if !plan.duplicate_groups[group_index]
            .member_entry_ids
            .iter()
            .any(|entry_id| entry_id == keeper_entry_id)
        {
            return Err("Selected keeper must belong to the duplicate group.".to_string());
        }

        plan.duplicate_groups[group_index].selected_keeper_entry_id =
            Some(keeper_entry_id.to_string());

        for action in &mut plan.actions {
            if action
                .duplicate_group_id
                .as_ref()
                .is_some_and(|candidate| candidate == group_id)
                && action.review_state == ReviewState::NeedsChoice
            {
                action.review_state = ReviewState::Pending;
                action.explanation.conflict_status = None;
                action.explanation.blocked_reason = None;
                action
                    .explanation
                    .notes
                    .push("Duplicate keeper selected. Action can now be reviewed.".to_string());
            }
        }

        self.persist_plan(&plan, true)?;
        Ok(plan)
    }

    pub fn reconcile_plan_after_undo(
        &self,
        plan_id: &str,
        undo_records: &[ActionRecordDto],
    ) -> Result<Option<PlanDto>, String> {
        let Some(mut plan) = self.get_plan(plan_id)? else {
            return Ok(None);
        };

        let reset_action_ids = undo_records
            .iter()
            .filter(|record| {
                record.operation_kind == ExecutionOperationKind::Undo
                    && record.status == ActionRecordStatus::Completed
            })
            .map(|record| record.action_id.clone())
            .collect::<Vec<_>>();

        if reset_action_ids.is_empty() {
            return Ok(Some(plan));
        }

        let duplicate_groups = plan.duplicate_groups.clone();
        for action in &mut plan.actions {
            if !reset_action_ids
                .iter()
                .any(|action_id| action_id == &action.action_id)
            {
                continue;
            }

            action.review_state = baseline_review_state(action, &duplicate_groups);
            if !action
                .explanation
                .notes
                .iter()
                .any(|note| note == "Action was undone and returned to the review queue.")
            {
                action
                    .explanation
                    .notes
                    .push("Action was undone and returned to the review queue.".to_string());
            }
        }

        self.persist_plan(&plan, true)?;
        Ok(Some(plan))
    }

    fn persist_plan(&self, plan: &PlanDto, replace_existing: bool) -> Result<(), String> {
        let connection = self.connection()?;
        let payload_json = serde_json::to_string(plan).map_err(|error| error.to_string())?;

        if replace_existing {
            connection
                .execute(
                    "UPDATE plans SET payload_json = ?2 WHERE plan_id = ?1",
                    params![plan.plan_id, payload_json],
                )
                .map_err(|error| error.to_string())?;
            connection
                .execute(
                    "DELETE FROM planned_actions WHERE plan_id = ?1",
                    params![plan.plan_id],
                )
                .map_err(|error| error.to_string())?;
        } else {
            connection
                .execute(
                    "INSERT INTO plans (plan_id, job_id, payload_json) VALUES (?1, ?2, ?3)",
                    params![plan.plan_id, plan.job_id, payload_json],
                )
                .map_err(|error| error.to_string())?;
        }

        for action in &plan.actions {
            let action_payload =
                serde_json::to_string(action).map_err(|error| error.to_string())?;
            connection
                .execute(
                    "INSERT INTO planned_actions (action_id, plan_id, payload_json) VALUES (?1, ?2, ?3)",
                    params![action.action_id, plan.plan_id, action_payload],
                )
                .map_err(|error| error.to_string())?;
        }

        Ok(())
    }
}

fn baseline_review_state(
    action: &safepath_core::PlannedActionDto,
    duplicate_groups: &[safepath_core::PlanDuplicateGroupDto],
) -> ReviewState {
    if matches!(
        action.explanation.conflict_status,
        Some(
            safepath_core::ConflictKind::ProtectionConflict
                | safepath_core::ConflictKind::TemplateConflict
                | safepath_core::ConflictKind::DestinationConflict
        )
    ) {
        return ReviewState::Blocked;
    }

    if let Some(group_id) = &action.duplicate_group_id {
        let keeper_selected = duplicate_groups
            .iter()
            .find(|group| &group.group_id == group_id)
            .and_then(|group| group.selected_keeper_entry_id.as_ref())
            .is_some();
        if !keeper_selected {
            return ReviewState::NeedsChoice;
        }
        return ReviewState::Pending;
    }

    match action.action_kind {
        safepath_core::PlannedActionKind::Review => ReviewState::NeedsChoice,
        _ => ReviewState::Pending,
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use safepath_core::{
        ActionExplanationDto, ActionRecordDto, ActionRecordStatus, ConflictKind,
        ExecutionOperationKind, ExecutionStrategy, PlanDto, PlanDuplicateGroupDto, PlanSummaryDto,
        PlannedActionDto, PlannedActionKind, ReviewState,
    };
    use uuid::Uuid;

    use crate::Store;

    #[test]
    fn reconcile_plan_after_undo_resets_executed_action_to_baseline() {
        let db_path = temp_db_path();
        let store = Store::new(&db_path).expect("store");
        let plan = sample_plan();
        store.save_plan(&plan).expect("save plan");

        let undo_record = ActionRecordDto {
            record_id: "undo-record".to_string(),
            session_id: "undo-session".to_string(),
            operation_kind: ExecutionOperationKind::Undo,
            related_record_id: Some("record-1".to_string()),
            action_id: "action-1".to_string(),
            source_path: "/tmp/source.txt".to_string(),
            destination_path: Some("/tmp/destination.txt".to_string()),
            strategy: ExecutionStrategy::CopyOnly,
            status: ActionRecordStatus::Completed,
            message: Some("undone".to_string()),
            rollback_safe: false,
            started_at_epoch_ms: 1,
            finished_at_epoch_ms: 2,
        };

        let updated = store
            .reconcile_plan_after_undo("plan-1", &[undo_record])
            .expect("reconcile")
            .expect("plan exists");

        assert_eq!(updated.actions[0].review_state, ReviewState::Pending);
        assert!(updated.actions[0]
            .explanation
            .notes
            .iter()
            .any(|note| note.contains("undone")));

        let _ = std::fs::remove_file(db_path);
    }

    fn temp_db_path() -> PathBuf {
        PathBuf::from(format!(
            "{}/safepath-plans-{}.sqlite3",
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
                total_actions: 1,
                move_actions: 1,
                review_actions: 0,
                blocked_actions: 0,
                skipped_actions: 0,
            },
            duplicate_groups: Vec::<PlanDuplicateGroupDto>::new(),
            actions: vec![PlannedActionDto {
                action_id: "action-1".to_string(),
                source_entry_id: "entry-1".to_string(),
                source_path: "/tmp/source.txt".to_string(),
                destination_path: Some("/tmp/destination.txt".to_string()),
                duplicate_group_id: None,
                action_kind: PlannedActionKind::Move,
                review_state: ReviewState::Executed,
                explanation: ActionExplanationDto {
                    matched_preset: "preset-1".to_string(),
                    matched_rule: Some("rule-1".to_string()),
                    matched_conditions: Vec::new(),
                    rule_priority: Some(1),
                    confidence: 1.0,
                    safety_flags: Vec::new(),
                    duplicate_tier: None,
                    protection_state: None,
                    blocked_reason: None,
                    destination_root: Some("/tmp".to_string()),
                    template_used: None,
                    template_error: None,
                    previewed_template_output: Some("/tmp/destination.txt".to_string()),
                    destination_conflict_path: None,
                    conflict_status: Some(ConflictKind::NeedsUserChoice),
                    notes: Vec::new(),
                },
            }],
            config_fingerprint: None,
            duplicate_config_snapshot: None,
        }
    }
}
