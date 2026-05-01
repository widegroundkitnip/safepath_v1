mod analysis;
mod cache_pruning;
mod execution;
mod hash_cache;
mod history;
mod learner;
mod manifest;
mod migrations;
mod plans;
mod presets;
mod protection;
mod scan_jobs;
mod selection;
mod similarity_cache;
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
            .create_scan_job(&["/tmp".to_string()], 25, None)
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
    fn prune_orphaned_expensive_analysis_caches_removes_stale_entry_ids() {
        let db_path = PathBuf::from(format!(
            "{}/safepath-store-cache-prune-{}.sqlite3",
            std::env::temp_dir().display(),
            Uuid::new_v4()
        ));
        let store = Store::new(&db_path).expect("store");
        let job = store
            .create_scan_job(&["/tmp".to_string()], 25, None)
            .expect("job");
        let job_id = job.job_id.clone();

        let conn = store.connection().expect("conn");
        conn.execute(
            "INSERT INTO manifest_entries (
                entry_id, job_id, source_root, path, relative_path, name, entry_kind,
                size_bytes, extension, is_hidden
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0)",
            rusqlite::params![
                "entry-alive",
                &job_id,
                "/tmp",
                "/tmp/a.txt",
                "a.txt",
                "a.txt",
                "file",
                1_i64,
                "txt",
            ],
        )
        .expect("manifest row");
        conn.execute(
            "INSERT INTO file_content_hashes (job_id, entry_id, size_bytes, modified_ms, hash_hex)
             VALUES (?1, ?2, 1, NULL, 'aa'), (?1, ?3, 1, NULL, 'bb')",
            rusqlite::params![&job_id, "entry-alive", "entry-ghost"],
        )
        .expect("hashes");
        conn.execute(
            "INSERT INTO image_dhash_cache (job_id, entry_id, size_bytes, modified_ms, d_hash)
             VALUES (?1, ?2, 1, NULL, 42), (?1, ?3, 1, NULL, 43)",
            rusqlite::params![&job_id, "entry-alive", "entry-ghost"],
        )
        .expect("dhash");
        drop(conn);

        store
            .prune_orphaned_expensive_analysis_caches(&job_id)
            .expect("prune");

        let conn = store.connection().expect("conn");
        let fh: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM file_content_hashes WHERE job_id = ?1",
                rusqlite::params![&job_id],
                |row| row.get(0),
            )
            .expect("count fh");
        let dh: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM image_dhash_cache WHERE job_id = ?1",
                rusqlite::params![&job_id],
                |row| row.get(0),
            )
            .expect("count dh");
        assert_eq!(fh, 1);
        assert_eq!(dh, 1);

        store
            .clear_expensive_analysis_caches_for_job(&job_id)
            .expect("clear");
        let fh2: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM file_content_hashes WHERE job_id = ?1",
                rusqlite::params![&job_id],
                |row| row.get(0),
            )
            .expect("count fh2");
        assert_eq!(fh2, 0);

        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn prune_expensive_analysis_caches_for_unknown_jobs_removes_orphan_rows() {
        let db_path = PathBuf::from(format!(
            "{}/safepath-store-unknown-job-cache-{}.sqlite3",
            std::env::temp_dir().display(),
            Uuid::new_v4()
        ));
        let store = Store::new(&db_path).expect("store");
        let job = store
            .create_scan_job(&["/tmp".to_string()], 25, None)
            .expect("job");
        let job_id = job.job_id.clone();

        let conn = store.connection().expect("conn");
        conn.execute(
            "INSERT INTO file_content_hashes (job_id, entry_id, size_bytes, modified_ms, hash_hex)
             VALUES ('ghost-job', 'e1', 1, NULL, 'aa')",
            [],
        )
        .expect("orphan hash");
        conn.execute(
            "INSERT INTO file_content_hashes (job_id, entry_id, size_bytes, modified_ms, hash_hex)
             VALUES (?1, 'e2', 1, NULL, 'bb')",
            rusqlite::params![&job_id],
        )
        .expect("real job hash");
        conn.execute(
            "INSERT INTO image_dhash_cache (job_id, entry_id, size_bytes, modified_ms, d_hash)
             VALUES ('ghost-job', 'e1', 1, NULL, 1)",
            [],
        )
        .expect("orphan dhash");
        drop(conn);

        store
            .prune_expensive_analysis_caches_for_unknown_jobs()
            .expect("prune unknown jobs");

        let conn = store.connection().expect("conn");
        let ghosts: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM file_content_hashes WHERE job_id = 'ghost-job'",
                [],
                |row| row.get(0),
            )
            .expect("ghost count");
        assert_eq!(ghosts, 0);
        let real: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM file_content_hashes WHERE job_id = ?1",
                rusqlite::params![&job_id],
                |row| row.get(0),
            )
            .expect("real count");
        assert_eq!(real, 1);
        let ghost_d: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM image_dhash_cache WHERE job_id = 'ghost-job'",
                [],
                |row| row.get(0),
            )
            .expect("ghost d");
        assert_eq!(ghost_d, 0);

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

        assert_eq!(version, 7);
        assert_eq!(metadata.0, "undo");
        assert_eq!(metadata.1.as_deref(), Some("record-0"));
        assert_eq!(metadata.2, "completed");

        let _ = std::fs::remove_file(db_path);
    }
}
