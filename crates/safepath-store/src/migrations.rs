use std::fs;

use rusqlite::{params, Connection};
use safepath_core::ActionRecordDto;

use crate::util::{action_record_status_code, execution_operation_kind_code};

use super::Store;

const LATEST_SCHEMA_VERSION: i32 = 2;

pub(crate) fn initialize_schema(store: &Store) -> Result<(), String> {
    if let Some(parent) = store.db_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let connection = store.connection()?;
    connection
        .execute_batch("PRAGMA journal_mode = WAL;")
        .map_err(|error| error.to_string())?;

    let has_user_tables = count_user_tables(&connection)? > 0;
    let mut current_version = schema_version(&connection)?;
    if current_version == 0 && has_user_tables {
        current_version = 1;
    }

    if current_version > LATEST_SCHEMA_VERSION {
        return Err(format!(
            "Database schema version {} is newer than this build supports.",
            current_version
        ));
    }

    if !has_user_tables {
        create_latest_schema(&connection)?;
        set_schema_version(&connection, LATEST_SCHEMA_VERSION)?;
        return Ok(());
    }

    if current_version < 2 {
        migrate_v1_to_v2(&connection)?;
        current_version = 2;
    }

    create_latest_schema(&connection)?;
    set_schema_version(&connection, current_version)?;

    Ok(())
}

fn create_latest_schema(connection: &Connection) -> Result<(), String> {
    connection
        .execute_batch(
            "
            CREATE TABLE IF NOT EXISTS scan_jobs (
                job_id TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                discovered_entries INTEGER NOT NULL DEFAULT 0,
                scanned_files INTEGER NOT NULL DEFAULT 0,
                scanned_directories INTEGER NOT NULL DEFAULT 0,
                page_size INTEGER NOT NULL DEFAULT 100,
                started_at_epoch_ms INTEGER NOT NULL,
                finished_at_epoch_ms INTEGER,
                error_message TEXT
            );

            CREATE TABLE IF NOT EXISTS scan_sources (
                job_id TEXT NOT NULL,
                source_path TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS manifest_entries (
                entry_id TEXT PRIMARY KEY,
                job_id TEXT NOT NULL,
                source_root TEXT NOT NULL,
                path TEXT NOT NULL,
                relative_path TEXT NOT NULL,
                name TEXT NOT NULL,
                entry_kind TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                extension TEXT,
                is_hidden INTEGER NOT NULL DEFAULT 0,
                created_at_epoch_ms INTEGER,
                modified_at_epoch_ms INTEGER
            );

            CREATE TABLE IF NOT EXISTS analysis_results (
                analysis_id TEXT PRIMARY KEY,
                job_id TEXT NOT NULL UNIQUE,
                analysis_version INTEGER NOT NULL DEFAULT 1,
                payload_json TEXT
            );

            CREATE TABLE IF NOT EXISTS duplicate_groups (
                group_id TEXT PRIMARY KEY,
                job_id TEXT NOT NULL,
                certainty TEXT NOT NULL,
                payload_json TEXT
            );

            CREATE TABLE IF NOT EXISTS duplicate_group_members (
                group_id TEXT NOT NULL,
                entry_id TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS detected_protection (
                protection_id TEXT PRIMARY KEY,
                job_id TEXT NOT NULL,
                path TEXT NOT NULL,
                state TEXT NOT NULL,
                payload_json TEXT
            );

            CREATE TABLE IF NOT EXISTS protection_overrides (
                override_id TEXT PRIMARY KEY,
                path TEXT NOT NULL,
                override_kind TEXT NOT NULL,
                created_at_epoch_ms INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS presets (
                preset_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                payload_json TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS plans (
                plan_id TEXT PRIMARY KEY,
                job_id TEXT NOT NULL,
                payload_json TEXT
            );

            CREATE TABLE IF NOT EXISTS planned_actions (
                action_id TEXT PRIMARY KEY,
                plan_id TEXT NOT NULL,
                payload_json TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS execution_sessions (
                session_id TEXT PRIMARY KEY,
                plan_id TEXT NOT NULL,
                payload_json TEXT
            );

            CREATE TABLE IF NOT EXISTS action_records (
                record_id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                operation_kind TEXT NOT NULL DEFAULT 'execute',
                related_record_id TEXT,
                status TEXT NOT NULL DEFAULT 'completed',
                payload_json TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS learner_observations (
                observation_id TEXT PRIMARY KEY,
                payload_json TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_scan_sources_job_id ON scan_sources (job_id);
            CREATE INDEX IF NOT EXISTS idx_manifest_entries_job_id ON manifest_entries (job_id);
            CREATE INDEX IF NOT EXISTS idx_manifest_entries_path ON manifest_entries (job_id, path);
            CREATE INDEX IF NOT EXISTS idx_analysis_results_job_id ON analysis_results (job_id);
            CREATE INDEX IF NOT EXISTS idx_detected_protection_job_id ON detected_protection (job_id);
            CREATE INDEX IF NOT EXISTS idx_protection_overrides_path ON protection_overrides (path);
            CREATE INDEX IF NOT EXISTS idx_action_records_session_id ON action_records (session_id);
            CREATE INDEX IF NOT EXISTS idx_action_records_undo_lookup
                ON action_records (operation_kind, status, related_record_id);
            ",
        )
        .map_err(|error| error.to_string())
}

fn migrate_v1_to_v2(connection: &Connection) -> Result<(), String> {
    add_column_if_missing(connection, "action_records", "operation_kind", "TEXT")?;
    add_column_if_missing(connection, "action_records", "related_record_id", "TEXT")?;
    add_column_if_missing(connection, "action_records", "status", "TEXT")?;

    backfill_action_record_metadata(connection)?;
    Ok(())
}

fn backfill_action_record_metadata(connection: &Connection) -> Result<(), String> {
    let mut statement = connection
        .prepare("SELECT record_id, payload_json FROM action_records")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    for (record_id, payload_json) in rows {
        let record = serde_json::from_str::<ActionRecordDto>(&payload_json)
            .map_err(|error| error.to_string())?;
        connection
            .execute(
                "UPDATE action_records
                 SET operation_kind = ?2, related_record_id = ?3, status = ?4
                 WHERE record_id = ?1",
                params![
                    record_id,
                    execution_operation_kind_code(record.operation_kind),
                    record.related_record_id,
                    action_record_status_code(record.status)
                ],
            )
            .map_err(|error| error.to_string())?;
    }

    connection
        .execute(
            "UPDATE action_records SET operation_kind = 'execute' WHERE operation_kind IS NULL",
            [],
        )
        .map_err(|error| error.to_string())?;
    connection
        .execute(
            "UPDATE action_records SET status = 'completed' WHERE status IS NULL",
            [],
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

fn schema_version(connection: &Connection) -> Result<i32, String> {
    connection
        .pragma_query_value(None, "user_version", |row| row.get::<_, i32>(0))
        .map_err(|error| error.to_string())
}

fn set_schema_version(connection: &Connection, version: i32) -> Result<(), String> {
    connection
        .pragma_update(None, "user_version", version)
        .map_err(|error| error.to_string())
}

fn count_user_tables(connection: &Connection) -> Result<i64, String> {
    connection
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|error| error.to_string())
}

fn add_column_if_missing(
    connection: &Connection,
    table_name: &str,
    column_name: &str,
    column_definition: &str,
) -> Result<(), String> {
    let pragma_sql = format!("PRAGMA table_info({table_name})");
    let mut statement = connection
        .prepare(&pragma_sql)
        .map_err(|error| error.to_string())?;
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    if columns.iter().any(|column| column == column_name) {
        return Ok(());
    }

    connection
        .execute(
            &format!("ALTER TABLE {table_name} ADD COLUMN {column_name} {column_definition}"),
            [],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}
