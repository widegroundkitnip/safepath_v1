use std::collections::{HashMap, HashSet};

use rusqlite::{params, Connection, OptionalExtension};
use safepath_core::{
    history, ActionRecordDto, ExecutionSessionDto, HistoryEntryDto, HistoryPageDto,
};

use crate::Store;

impl Store {
    pub fn get_history_page(&self, page: u32, page_size: u32) -> Result<HistoryPageDto, String> {
        let safe_page_size = page_size.max(1);
        let offset = i64::from(page.saturating_mul(safe_page_size));
        let connection = self.connection()?;
        let undone_record_ids = load_undone_record_ids(&connection)?;
        let total_entries = connection
            .query_row("SELECT COUNT(*) FROM action_records", [], |row| {
                row.get::<_, i64>(0)
            })
            .map_err(|error| error.to_string())? as u64;

        let total_pages = if total_entries == 0 {
            0
        } else {
            ((total_entries - 1) / u64::from(safe_page_size) + 1) as u32
        };

        let mut statement = connection
            .prepare(
                "SELECT record_id, session_id, payload_json
                 FROM action_records
                 ORDER BY rowid DESC
                 LIMIT ?1 OFFSET ?2",
            )
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map(params![i64::from(safe_page_size), offset], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;
        let mut sessions_by_id = HashMap::<String, ExecutionSessionDto>::new();
        let entries = rows
            .into_iter()
            .map(|(_record_id, session_id, payload_json)| {
                let record = serde_json::from_str::<ActionRecordDto>(&payload_json)
                    .map_err(|error| error.to_string())?;
                if !sessions_by_id.contains_key(&session_id) {
                    let session =
                        load_execution_session(&connection, &session_id)?.ok_or_else(|| {
                            format!("Execution session `{session_id}` was not found.")
                        })?;
                    sessions_by_id.insert(session_id.clone(), session);
                }
                let session = sessions_by_id
                    .get(&session_id)
                    .ok_or_else(|| format!("Execution session `{session_id}` was not cached."))?;
                Ok(history::summarize_record(
                    session,
                    &record,
                    undone_record_ids.contains(&record.record_id),
                ))
            })
            .collect::<Result<Vec<HistoryEntryDto>, String>>()?;

        Ok(HistoryPageDto {
            page,
            page_size: safe_page_size,
            total_entries,
            total_pages,
            entries,
        })
    }
}

fn load_undone_record_ids(connection: &Connection) -> Result<HashSet<String>, String> {
    let mut statement = connection
        .prepare(
            "SELECT related_record_id
             FROM action_records
             WHERE operation_kind = 'undo'
               AND status = 'completed'
               AND related_record_id IS NOT NULL",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;
    rows.map(|row| row.map_err(|error| error.to_string()))
        .collect::<Result<HashSet<_>, _>>()
}

fn load_execution_session(
    connection: &Connection,
    session_id: &str,
) -> Result<Option<ExecutionSessionDto>, String> {
    let payload = connection
        .query_row(
            "SELECT payload_json FROM execution_sessions WHERE session_id = ?1",
            params![session_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;

    payload
        .map(|json| {
            serde_json::from_str::<ExecutionSessionDto>(&json).map_err(|error| error.to_string())
        })
        .transpose()
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use safepath_core::{
        ActionRecordDto, ActionRecordStatus, ExecutionOperationKind, ExecutionSessionDto,
        ExecutionSessionStatus, ExecutionStrategy, PreflightIssueDto,
    };
    use uuid::Uuid;

    use crate::Store;

    #[test]
    fn get_history_page_hydrates_entries_and_orders_newest_first() {
        let db_path = temp_db_path("history");
        let store = Store::new(&db_path).expect("store");
        let session = sample_session("session-1");
        store
            .save_execution_session(&session)
            .expect("save execution session");
        store
            .append_action_record(&sample_record(
                "record-1",
                "session-1",
                ExecutionStrategy::SameVolumeMove,
                ActionRecordStatus::Completed,
                false,
            ))
            .expect("append first record");
        store
            .append_action_record(&sample_record(
                "record-2",
                "session-1",
                ExecutionStrategy::CopyOnly,
                ActionRecordStatus::Completed,
                true,
            ))
            .expect("append second record");

        let page = store.get_history_page(0, 10).expect("history page");

        assert_eq!(page.total_entries, 2);
        assert_eq!(page.entries.len(), 2);
        assert_eq!(page.entries[0].record_id, "record-2");
        assert!(page.entries[0].undo_eligible);
        assert_eq!(page.entries[0].session.plan_id, "plan-1");
        assert_eq!(page.entries[1].record_id, "record-1");
        assert!(!page.entries[1].undo_eligible);

        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn get_history_page_paginates_stably() {
        let db_path = temp_db_path("history-page");
        let store = Store::new(&db_path).expect("store");
        let session = sample_session("session-1");
        store
            .save_execution_session(&session)
            .expect("save execution session");

        for record_id in ["record-1", "record-2", "record-3"] {
            store
                .append_action_record(&sample_record(
                    record_id,
                    "session-1",
                    ExecutionStrategy::CopyOnly,
                    ActionRecordStatus::Completed,
                    true,
                ))
                .expect("append paged record");
        }

        let first_page = store.get_history_page(0, 2).expect("first page");
        let second_page = store.get_history_page(1, 2).expect("second page");

        assert_eq!(first_page.total_pages, 2);
        assert_eq!(first_page.entries.len(), 2);
        assert_eq!(first_page.entries[0].record_id, "record-3");
        assert_eq!(first_page.entries[1].record_id, "record-2");
        assert_eq!(second_page.entries.len(), 1);
        assert_eq!(second_page.entries[0].record_id, "record-1");

        let _ = std::fs::remove_file(db_path);
    }

    fn temp_db_path(prefix: &str) -> PathBuf {
        PathBuf::from(format!(
            "{}/safepath-{prefix}-{}.sqlite3",
            std::env::temp_dir().display(),
            Uuid::new_v4()
        ))
    }

    fn sample_session(session_id: &str) -> ExecutionSessionDto {
        ExecutionSessionDto {
            session_id: session_id.to_string(),
            plan_id: "plan-1".to_string(),
            operation_kind: ExecutionOperationKind::Execute,
            related_session_id: None,
            status: ExecutionSessionStatus::Completed,
            started_at_epoch_ms: 1,
            finished_at_epoch_ms: Some(2),
            approved_action_count: 3,
            completed_action_count: 3,
            failed_action_count: 0,
            skipped_action_count: 0,
            preflight_issues: Vec::<PreflightIssueDto>::new(),
            records: Vec::new(),
            config_fingerprint: None,
        }
    }

    fn sample_record(
        record_id: &str,
        session_id: &str,
        strategy: ExecutionStrategy,
        status: ActionRecordStatus,
        rollback_safe: bool,
    ) -> ActionRecordDto {
        ActionRecordDto {
            record_id: record_id.to_string(),
            session_id: session_id.to_string(),
            operation_kind: ExecutionOperationKind::Execute,
            related_record_id: None,
            action_id: format!("action-{record_id}"),
            source_path: "/tmp/source.txt".to_string(),
            destination_path: Some("/tmp/destination.txt".to_string()),
            strategy,
            status,
            message: Some("sample".to_string()),
            rollback_safe,
            started_at_epoch_ms: 1,
            finished_at_epoch_ms: 2,
        }
    }
}
