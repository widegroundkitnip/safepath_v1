use std::collections::HashSet;
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use uuid::Uuid;

use crate::executor::{
    copy_path, create_parent_dirs, remove_path, same_volume, verify_same_content,
};
use crate::types::{
    ActionRecordDto, ActionRecordStatus, ExecutionOperationKind, ExecutionSessionDto,
    ExecutionSessionStatus, ExecutionStrategy, HistoryEntryDto, HistorySessionSummaryDto,
};

pub fn summarize_session(session: &ExecutionSessionDto) -> HistorySessionSummaryDto {
    HistorySessionSummaryDto {
        session_id: session.session_id.clone(),
        plan_id: session.plan_id.clone(),
        operation_kind: session.operation_kind,
        related_session_id: session.related_session_id.clone(),
        status: session.status,
        started_at_epoch_ms: session.started_at_epoch_ms,
        finished_at_epoch_ms: session.finished_at_epoch_ms,
        approved_action_count: session.approved_action_count,
        completed_action_count: session.completed_action_count,
        failed_action_count: session.failed_action_count,
        skipped_action_count: session.skipped_action_count,
    }
}

pub fn summarize_record(
    session: &ExecutionSessionDto,
    record: &ActionRecordDto,
    already_undone: bool,
) -> HistoryEntryDto {
    let undo_blocked_reason = undo_blocked_reason(record, already_undone);
    HistoryEntryDto {
        record_id: record.record_id.clone(),
        session_id: record.session_id.clone(),
        operation_kind: record.operation_kind,
        action_id: record.action_id.clone(),
        source_path: record.source_path.clone(),
        destination_path: record.destination_path.clone(),
        strategy: record.strategy,
        status: record.status,
        message: record.message.clone(),
        rollback_safe: record.rollback_safe,
        started_at_epoch_ms: record.started_at_epoch_ms,
        finished_at_epoch_ms: record.finished_at_epoch_ms,
        undo_eligible: undo_blocked_reason.is_none(),
        undo_blocked_reason,
        session: summarize_session(session),
    }
}

pub fn undo_blocked_reason(record: &ActionRecordDto, already_undone: bool) -> Option<String> {
    if record.operation_kind == ExecutionOperationKind::Undo {
        return Some("Undo records cannot be undone again.".to_string());
    }

    if already_undone {
        return Some("This action has already been undone by a later history entry.".to_string());
    }

    if record.status != ActionRecordStatus::Completed {
        return Some(match record.status {
            ActionRecordStatus::Failed => {
                "Only completed actions can be considered for undo.".to_string()
            }
            ActionRecordStatus::Skipped => {
                "Skipped actions did not change anything on disk, so there is nothing to undo."
                    .to_string()
            }
            ActionRecordStatus::Completed => unreachable!(),
        });
    }

    if !record.rollback_safe {
        return Some("This action was not recorded as rollback-safe by the executor.".to_string());
    }

    if record.destination_path.is_none() {
        return Some("Undo requires a persisted destination or holding path.".to_string());
    }

    if !supports_phase6_undo(record.strategy) {
        return Some(format!(
            "{} is not part of the initial Phase 6 undo-safe strategy set.",
            strategy_label(record.strategy)
        ));
    }

    None
}

pub fn initialize_undo_session(
    plan_id: &str,
    related_session_id: Option<String>,
    approved_action_count: u32,
) -> ExecutionSessionDto {
    ExecutionSessionDto {
        session_id: Uuid::new_v4().to_string(),
        plan_id: plan_id.to_string(),
        operation_kind: ExecutionOperationKind::Undo,
        related_session_id,
        status: ExecutionSessionStatus::Running,
        started_at_epoch_ms: now_epoch_ms(),
        finished_at_epoch_ms: None,
        approved_action_count,
        completed_action_count: 0,
        failed_action_count: 0,
        skipped_action_count: 0,
        preflight_issues: Vec::new(),
        records: Vec::new(),
        config_fingerprint: None,
    }
}

pub fn finalize_undo_session(session: &mut ExecutionSessionDto) {
    session.finished_at_epoch_ms = Some(now_epoch_ms());
    session.status = if session.failed_action_count == 0 && session.skipped_action_count == 0 {
        ExecutionSessionStatus::Completed
    } else if session.completed_action_count > 0 || session.skipped_action_count > 0 {
        ExecutionSessionStatus::PartiallyFailed
    } else {
        ExecutionSessionStatus::Failed
    };
}

pub fn completed_undo_record_ids(records: &[ActionRecordDto]) -> HashSet<String> {
    records
        .iter()
        .filter(|record| {
            record.operation_kind == ExecutionOperationKind::Undo
                && record.status == ActionRecordStatus::Completed
        })
        .filter_map(|record| record.related_record_id.clone())
        .collect()
}

pub fn apply_undo_record(
    record: &ActionRecordDto,
    undo_session_id: &str,
    already_undone: bool,
) -> ActionRecordDto {
    if let Some(message) = undo_blocked_reason(record, already_undone) {
        return skipped_undo_record(record, undo_session_id, message);
    }

    match record.strategy {
        ExecutionStrategy::CopyOnly => undo_copy_only(record, undo_session_id),
        ExecutionStrategy::SameVolumeMove
        | ExecutionStrategy::CrossVolumeSafeMove
        | ExecutionStrategy::DuplicateConsolidate
        | ExecutionStrategy::DeleteToTrash => undo_relocated_file(record, undo_session_id),
    }
}

pub fn record_undo_outcome(session: &mut ExecutionSessionDto, record: ActionRecordDto) {
    match record.status {
        ActionRecordStatus::Completed => session.completed_action_count += 1,
        ActionRecordStatus::Failed => session.failed_action_count += 1,
        ActionRecordStatus::Skipped => session.skipped_action_count += 1,
    }
    session.records.push(record);
}

pub fn supports_phase6_undo(strategy: ExecutionStrategy) -> bool {
    matches!(
        strategy,
        ExecutionStrategy::SameVolumeMove
            | ExecutionStrategy::CrossVolumeSafeMove
            | ExecutionStrategy::CopyOnly
            | ExecutionStrategy::DuplicateConsolidate
            | ExecutionStrategy::DeleteToTrash
    )
}

fn strategy_label(strategy: ExecutionStrategy) -> &'static str {
    match strategy {
        ExecutionStrategy::SameVolumeMove => "Same-volume move",
        ExecutionStrategy::CrossVolumeSafeMove => "Cross-volume safe move",
        ExecutionStrategy::CopyOnly => "Copy-only",
        ExecutionStrategy::DuplicateConsolidate => "Duplicate consolidate",
        ExecutionStrategy::DeleteToTrash => "Safepath trash hold",
    }
}

fn undo_copy_only(record: &ActionRecordDto, undo_session_id: &str) -> ActionRecordDto {
    let Some(copied_destination) = &record.destination_path else {
        return failed_undo_record(
            record,
            undo_session_id,
            record.source_path.clone(),
            None,
            "Undo requires the copied destination path to still be recorded.".to_string(),
        );
    };

    if !Path::new(copied_destination).exists() {
        return failed_undo_record(
            record,
            undo_session_id,
            copied_destination.clone(),
            Some(record.source_path.clone()),
            "The copied destination no longer exists, so the copy-only action cannot be undone."
                .to_string(),
        );
    }

    if let Err(error) = remove_path(copied_destination) {
        return failed_undo_record(
            record,
            undo_session_id,
            copied_destination.clone(),
            Some(record.source_path.clone()),
            format!("Failed to remove copied destination during undo: {error}"),
        );
    }

    completed_undo_record(
        record,
        undo_session_id,
        copied_destination.clone(),
        Some(record.source_path.clone()),
        "Removed the copied destination to undo the copy-only action.".to_string(),
    )
}

fn undo_relocated_file(record: &ActionRecordDto, undo_session_id: &str) -> ActionRecordDto {
    let Some(current_path) = &record.destination_path else {
        return failed_undo_record(
            record,
            undo_session_id,
            record.source_path.clone(),
            None,
            "Undo requires the holding path to still be recorded.".to_string(),
        );
    };

    if !Path::new(current_path).exists() {
        return failed_undo_record(
            record,
            undo_session_id,
            current_path.clone(),
            Some(record.source_path.clone()),
            "The holding file no longer exists, so the action cannot be undone.".to_string(),
        );
    }

    if Path::new(&record.source_path).exists() {
        return failed_undo_record(
            record,
            undo_session_id,
            current_path.clone(),
            Some(record.source_path.clone()),
            "The original source path already exists, so undo would overwrite an existing item."
                .to_string(),
        );
    }

    if let Err(error) = relocate_path(current_path, &record.source_path) {
        return failed_undo_record(
            record,
            undo_session_id,
            current_path.clone(),
            Some(record.source_path.clone()),
            error,
        );
    }

    completed_undo_record(
        record,
        undo_session_id,
        current_path.clone(),
        Some(record.source_path.clone()),
        "Moved the held file back to its original source path.".to_string(),
    )
}

fn relocate_path(source_path: &str, destination_path: &str) -> Result<(), String> {
    create_parent_dirs(destination_path)?;

    match same_volume(source_path, destination_path) {
        Ok(true) => fs::rename(source_path, destination_path)
            .map_err(|error| format!("Failed to restore file in place: {error}"))?,
        Ok(false) => {
            let temp_destination =
                format!("{destination_path}.safepath-undo-tmp-{}", Uuid::new_v4());
            copy_path(source_path, &temp_destination)?;
            match verify_same_content(source_path, &temp_destination) {
                Ok(true) => {}
                Ok(false) => {
                    let _ = remove_path(&temp_destination);
                    return Err("Checksum verification failed during undo copy.".to_string());
                }
                Err(error) => {
                    let _ = remove_path(&temp_destination);
                    return Err(error);
                }
            }
            fs::rename(&temp_destination, destination_path)
                .map_err(|error| format!("Failed to finalize restored destination: {error}"))?;
            remove_path(source_path)?;
        }
        Err(error) => return Err(error),
    }

    Ok(())
}

fn skipped_undo_record(
    original: &ActionRecordDto,
    undo_session_id: &str,
    message: String,
) -> ActionRecordDto {
    build_undo_record(
        original,
        undo_session_id,
        ActionRecordStatus::Skipped,
        original
            .destination_path
            .clone()
            .unwrap_or_else(|| original.source_path.clone()),
        Some(original.source_path.clone()),
        message,
    )
}

fn failed_undo_record(
    original: &ActionRecordDto,
    undo_session_id: &str,
    source_path: String,
    destination_path: Option<String>,
    message: String,
) -> ActionRecordDto {
    build_undo_record(
        original,
        undo_session_id,
        ActionRecordStatus::Failed,
        source_path,
        destination_path,
        message,
    )
}

fn completed_undo_record(
    original: &ActionRecordDto,
    undo_session_id: &str,
    source_path: String,
    destination_path: Option<String>,
    message: String,
) -> ActionRecordDto {
    build_undo_record(
        original,
        undo_session_id,
        ActionRecordStatus::Completed,
        source_path,
        destination_path,
        message,
    )
}

fn build_undo_record(
    original: &ActionRecordDto,
    undo_session_id: &str,
    status: ActionRecordStatus,
    source_path: String,
    destination_path: Option<String>,
    message: String,
) -> ActionRecordDto {
    let now = now_epoch_ms();
    ActionRecordDto {
        record_id: Uuid::new_v4().to_string(),
        session_id: undo_session_id.to_string(),
        operation_kind: ExecutionOperationKind::Undo,
        related_record_id: Some(original.record_id.clone()),
        action_id: original.action_id.clone(),
        source_path,
        destination_path,
        strategy: original.strategy,
        status,
        message: Some(message),
        rollback_safe: false,
        started_at_epoch_ms: now,
        finished_at_epoch_ms: now,
    }
}

fn now_epoch_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::{
        apply_undo_record, completed_undo_record_ids, initialize_undo_session, summarize_record,
        undo_blocked_reason,
    };
    use crate::types::{
        ActionRecordDto, ActionRecordStatus, ExecutionOperationKind, ExecutionSessionDto,
        ExecutionSessionStatus, ExecutionStrategy, PreflightIssueDto,
    };
    use uuid::Uuid;

    #[test]
    fn copy_only_record_is_undo_eligible() {
        let session = sample_session();
        let record = sample_record(
            ExecutionStrategy::CopyOnly,
            ActionRecordStatus::Completed,
            true,
        );

        let history = summarize_record(&session, &record, false);

        assert!(history.undo_eligible);
        assert!(history.undo_blocked_reason.is_none());
    }

    #[test]
    fn non_rollback_safe_strategy_is_not_undo_eligible() {
        let record = sample_record(
            ExecutionStrategy::SameVolumeMove,
            ActionRecordStatus::Completed,
            false,
        );

        let reason = undo_blocked_reason(&record, false);

        assert!(reason.is_some());
        assert!(reason.unwrap().contains("rollback-safe"));
    }

    #[test]
    fn failed_record_is_not_undo_eligible() {
        let record = sample_record(
            ExecutionStrategy::DeleteToTrash,
            ActionRecordStatus::Failed,
            true,
        );

        let reason = undo_blocked_reason(&record, false);

        assert!(reason.is_some());
        assert!(reason.unwrap().contains("completed actions"));
    }

    #[test]
    fn already_undone_record_is_not_eligible() {
        let record = sample_record(
            ExecutionStrategy::CopyOnly,
            ActionRecordStatus::Completed,
            true,
        );

        let reason = undo_blocked_reason(&record, true);

        assert!(reason.is_some());
        assert!(reason.unwrap().contains("already been undone"));
    }

    #[test]
    fn copy_only_undo_removes_copied_file() {
        let temp_dir = std::env::temp_dir().join(format!("safepath-undo-copy-{}", Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        let source = temp_dir.join("source.txt");
        let copy = temp_dir.join("copy.txt");
        fs::write(&source, b"hello").expect("write source");
        fs::write(&copy, b"hello").expect("write copy");

        let mut record = sample_record(
            ExecutionStrategy::CopyOnly,
            ActionRecordStatus::Completed,
            true,
        );
        record.source_path = source.to_string_lossy().to_string();
        record.destination_path = Some(copy.to_string_lossy().to_string());

        let undo = apply_undo_record(&record, "undo-session", false);

        assert_eq!(undo.operation_kind, ExecutionOperationKind::Undo);
        assert_eq!(undo.status, ActionRecordStatus::Completed);
        assert!(!copy.exists());
        assert!(source.exists());

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn move_record_is_undo_eligible_when_rollback_safe() {
        let session = sample_session();
        let record = sample_record(
            ExecutionStrategy::SameVolumeMove,
            ActionRecordStatus::Completed,
            true,
        );

        let history = summarize_record(&session, &record, false);

        assert!(history.undo_eligible);
        assert!(history.undo_blocked_reason.is_none());
    }

    #[test]
    fn move_undo_restores_original_source_path() {
        let temp_dir = std::env::temp_dir().join(format!("safepath-undo-move-{}", Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        let source = temp_dir.join("source.txt");
        let destination = temp_dir.join("moved/source.txt");
        fs::create_dir_all(destination.parent().expect("destination parent"))
            .expect("destination dir");
        fs::write(&destination, b"hello").expect("write moved file");

        let mut record = sample_record(
            ExecutionStrategy::SameVolumeMove,
            ActionRecordStatus::Completed,
            true,
        );
        record.source_path = source.to_string_lossy().to_string();
        record.destination_path = Some(destination.to_string_lossy().to_string());

        let undo = apply_undo_record(&record, "undo-session", false);

        assert_eq!(undo.status, ActionRecordStatus::Completed);
        assert!(source.exists());
        assert!(!destination.exists());

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn completed_undo_lookup_collects_related_record_ids() {
        let temp_dir =
            std::env::temp_dir().join(format!("safepath-undo-lookup-{}", Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        let source = temp_dir.join("source.txt");
        let copy = temp_dir.join("copy.txt");
        fs::write(&source, b"hello").expect("write source");
        fs::write(&copy, b"hello").expect("write copy");

        let mut original = sample_record(
            ExecutionStrategy::CopyOnly,
            ActionRecordStatus::Completed,
            true,
        );
        original.source_path = source.to_string_lossy().to_string();
        original.destination_path = Some(copy.to_string_lossy().to_string());

        let undo_session = initialize_undo_session("plan-1", Some("session-1".to_string()), 1);
        let undo = apply_undo_record(&original, &undo_session.session_id, false);

        let undone = completed_undo_record_ids(&[undo]);

        assert!(undone.contains("record-1"));

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn held_file_undo_restores_original_path() {
        let temp_dir = std::env::temp_dir().join(format!("safepath-undo-hold-{}", Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        let original_path = temp_dir.join("original.txt");
        let holding_path = temp_dir.join("holding/moved.txt");
        fs::create_dir_all(holding_path.parent().expect("holding parent")).expect("holding dir");
        fs::write(&holding_path, b"same").expect("write holding");

        let mut record = sample_record(
            ExecutionStrategy::DuplicateConsolidate,
            ActionRecordStatus::Completed,
            true,
        );
        record.source_path = original_path.to_string_lossy().to_string();
        record.destination_path = Some(holding_path.to_string_lossy().to_string());

        let undo = apply_undo_record(&record, "undo-session", false);

        assert_eq!(undo.status, ActionRecordStatus::Completed);
        assert!(original_path.exists());
        assert!(!holding_path.exists());

        let _ = fs::remove_dir_all(temp_dir);
    }

    fn sample_session() -> ExecutionSessionDto {
        ExecutionSessionDto {
            session_id: "session-1".to_string(),
            plan_id: "plan-1".to_string(),
            operation_kind: ExecutionOperationKind::Execute,
            related_session_id: None,
            status: ExecutionSessionStatus::Completed,
            started_at_epoch_ms: 1,
            finished_at_epoch_ms: Some(2),
            approved_action_count: 1,
            completed_action_count: 1,
            failed_action_count: 0,
            skipped_action_count: 0,
            preflight_issues: Vec::<PreflightIssueDto>::new(),
            records: Vec::new(),
            config_fingerprint: None,
        }
    }

    fn sample_record(
        strategy: ExecutionStrategy,
        status: ActionRecordStatus,
        rollback_safe: bool,
    ) -> ActionRecordDto {
        ActionRecordDto {
            record_id: "record-1".to_string(),
            session_id: "session-1".to_string(),
            operation_kind: ExecutionOperationKind::Execute,
            related_record_id: None,
            action_id: "action-1".to_string(),
            source_path: "/tmp/source.txt".to_string(),
            destination_path: Some("/tmp/destination.txt".to_string()),
            strategy,
            status,
            message: None,
            rollback_safe,
            started_at_epoch_ms: 1,
            finished_at_epoch_ms: 2,
        }
    }
}
