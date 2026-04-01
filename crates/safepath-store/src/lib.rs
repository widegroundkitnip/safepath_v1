mod analysis;
mod execution;
mod history;
mod learner;
mod manifest;
mod migrations;
mod plans;
mod presets;
mod protection;
mod scan_jobs;
mod selection;
mod util;

use std::path::PathBuf;

use rusqlite::Connection;

#[derive(Debug, Clone)]
pub struct Store {
    db_path: PathBuf,
}

impl Store {
    pub fn new(db_path: impl Into<PathBuf>) -> Result<Self, String> {
        let store = Self {
            db_path: db_path.into(),
        };
        migrations::initialize_schema(&store)?;
        Ok(store)
    }

    pub(crate) fn connection(&self) -> Result<Connection, String> {
        Connection::open(&self.db_path).map_err(|error| error.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::Store;
    use rusqlite::Connection;
    use safepath_core::{
        ActionRecordDto, ActionRecordStatus, ExecutionOperationKind, ExecutionStrategy,
    };
    use std::path::PathBuf;
    use uuid::Uuid;

    #[test]
    fn creates_scan_job_and_pages_empty_manifest() {
        let db_path = PathBuf::from(format!(
            "{}/safepath-store-test-{}.sqlite3",
            std::env::temp_dir().display(),
            Uuid::new_v4()
        ));
        let store = Store::new(&db_path).expect("store");
        let job = store
            .create_scan_job(&["/tmp".to_string()], 25)
            .expect("job creation");

        let page = store
            .get_manifest_page(&job.job_id, 0, 25)
            .expect("manifest page");
        let history = store.get_history_page(0, 25).expect("history page");

        assert_eq!(page.total_entries, 0);
        assert!(page.entries.is_empty());
        assert_eq!(history.total_entries, 0);
        assert!(history.entries.is_empty());

        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn migrates_legacy_action_records_and_sets_schema_version() {
        let db_path = PathBuf::from(format!(
            "{}/safepath-store-migration-test-{}.sqlite3",
            std::env::temp_dir().display(),
            Uuid::new_v4()
        ));
        let connection = Connection::open(&db_path).expect("legacy connection");
        connection
            .execute_batch(
                "
                CREATE TABLE action_records (
                    record_id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    payload_json TEXT NOT NULL
                );
                CREATE TABLE execution_sessions (
                    session_id TEXT PRIMARY KEY,
                    plan_id TEXT NOT NULL,
                    payload_json TEXT
                );
                ",
            )
            .expect("create legacy schema");
        let payload = serde_json::to_string(&ActionRecordDto {
            record_id: "record-1".to_string(),
            session_id: "session-1".to_string(),
            operation_kind: ExecutionOperationKind::Undo,
            related_record_id: Some("record-0".to_string()),
            action_id: "action-1".to_string(),
            source_path: "/tmp/source.txt".to_string(),
            destination_path: Some("/tmp/destination.txt".to_string()),
            strategy: ExecutionStrategy::CopyOnly,
            status: ActionRecordStatus::Completed,
            message: None,
            rollback_safe: true,
            started_at_epoch_ms: 1,
            finished_at_epoch_ms: 2,
        })
        .expect("record payload");
        connection
            .execute(
                "INSERT INTO action_records (record_id, session_id, payload_json) VALUES (?1, ?2, ?3)",
                rusqlite::params!["record-1", "session-1", payload],
            )
            .expect("insert legacy record");
        drop(connection);

        let store = Store::new(&db_path).expect("migrated store");
        let connection = store.connection().expect("connection after migration");
        let version = connection
            .pragma_query_value(None, "user_version", |row| row.get::<_, i32>(0))
            .expect("user version");
        let metadata = connection
            .query_row(
                "SELECT operation_kind, related_record_id, status FROM action_records WHERE record_id = ?1",
                rusqlite::params!["record-1"],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, Option<String>>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                },
            )
            .expect("migrated metadata");

        assert_eq!(version, 3);
        assert_eq!(metadata.0, "undo");
        assert_eq!(metadata.1.as_deref(), Some("record-0"));
        assert_eq!(metadata.2, "completed");

        let _ = std::fs::remove_file(db_path);
    }
}
