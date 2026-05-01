use rusqlite::{params, OptionalExtension};
use safepath_core::{
    duplicate_config_fingerprint, DuplicateConfig, DuplicateRunPhase, ScanJobState, ScanJobStatusDto,
};
use uuid::Uuid;

use crate::util::{
    duplicate_run_phase_code, now_epoch_ms, parse_duplicate_run_phase, parse_scan_state,
    scan_state_code,
};
use crate::Store;

impl Store {
    pub fn create_scan_job(
        &self,
        source_paths: &[String],
        page_size: u32,
        duplicate_config: Option<&DuplicateConfig>,
    ) -> Result<ScanJobStatusDto, String> {
        let job_id = Uuid::new_v4().to_string();
        let started_at = now_epoch_ms();
        let (config_json, fingerprint) = match duplicate_config {
            Some(config) => (
                Some(serde_json::to_string(config).map_err(|error| error.to_string())?),
                Some(duplicate_config_fingerprint(config)),
            ),
            None => (None, None),
        };
        let connection = self.connection()?;
        connection
            .execute(
                "INSERT INTO scan_jobs (
                    job_id, status, discovered_entries, scanned_files, scanned_directories,
                    page_size, started_at_epoch_ms, finished_at_epoch_ms, error_message,
                    duplicate_config_json, config_fingerprint, duplicate_run_phase
                ) VALUES (?1, ?2, 0, 0, 0, ?3, ?4, NULL, NULL, ?5, ?6, ?7)",
                params![
                    job_id,
                    scan_state_code(ScanJobState::Pending),
                    page_size,
                    started_at,
                    config_json,
                    fingerprint,
                    duplicate_run_phase_code(DuplicateRunPhase::Idle),
                ],
            )
            .map_err(|error| error.to_string())?;

        for source in source_paths {
            connection
                .execute(
                    "INSERT INTO scan_sources (job_id, source_path) VALUES (?1, ?2)",
                    params![job_id, source],
                )
                .map_err(|error| error.to_string())?;
        }

        drop(connection);
        self.prune_expensive_analysis_caches_for_unknown_jobs()?;

        self.get_scan_status(&job_id)?
            .ok_or_else(|| "Failed to load scan job after creation.".to_string())
    }

    pub fn get_scan_job_fingerprint(&self, job_id: &str) -> Result<Option<String>, String> {
        let connection = self.connection()?;
        let value = connection
            .query_row(
                "SELECT config_fingerprint FROM scan_jobs WHERE job_id = ?1",
                params![job_id],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional()
            .map_err(|error| error.to_string())?;
        Ok(value.flatten())
    }

    pub fn set_scan_state(
        &self,
        job_id: &str,
        state: ScanJobState,
        error_message: Option<&str>,
    ) -> Result<(), String> {
        let connection = self.connection()?;
        let finished_at = matches!(
            state,
            ScanJobState::Completed | ScanJobState::Failed | ScanJobState::Cancelled
        )
        .then(now_epoch_ms);

        connection
            .execute(
                "UPDATE scan_jobs
                 SET status = ?2, finished_at_epoch_ms = COALESCE(?3, finished_at_epoch_ms), error_message = ?4
                 WHERE job_id = ?1",
                params![job_id, scan_state_code(state), finished_at, error_message],
            )
            .map_err(|error| error.to_string())?;

        Ok(())
    }

    pub fn set_duplicate_run_phase(&self, job_id: &str, phase: DuplicateRunPhase) -> Result<(), String> {
        let connection = self.connection()?;
        connection
            .execute(
                "UPDATE scan_jobs SET duplicate_run_phase = ?2 WHERE job_id = ?1",
                params![job_id, duplicate_run_phase_code(phase)],
            )
            .map_err(|error| error.to_string())?;
        Ok(())
    }

    pub fn get_scan_status(&self, job_id: &str) -> Result<Option<ScanJobStatusDto>, String> {
        let connection = self.connection()?;
        let mut statement = connection
            .prepare(
                "SELECT
                    job_id,
                    status,
                    discovered_entries,
                    scanned_files,
                    scanned_directories,
                    page_size,
                    started_at_epoch_ms,
                    finished_at_epoch_ms,
                    error_message,
                    duplicate_config_json,
                    config_fingerprint,
                    duplicate_run_phase
                 FROM scan_jobs
                 WHERE job_id = ?1",
            )
            .map_err(|error| error.to_string())?;

        let row = statement
            .query_row(params![job_id], |row| {
                let config_json: Option<String> = row.get(9)?;
                let duplicate_config = config_json
                    .and_then(|json| serde_json::from_str::<DuplicateConfig>(&json).ok());
                let phase_raw: Option<String> = row.get(11)?;
                let duplicate_run_phase = phase_raw
                    .as_deref()
                    .map(parse_duplicate_run_phase)
                    .unwrap_or(DuplicateRunPhase::Idle);
                Ok(ScanJobStatusDto {
                    job_id: row.get(0)?,
                    status: parse_scan_state(row.get::<_, String>(1)?),
                    source_paths: Vec::new(),
                    discovered_entries: row.get::<_, i64>(2)? as u64,
                    scanned_files: row.get::<_, i64>(3)? as u64,
                    scanned_directories: row.get::<_, i64>(4)? as u64,
                    page_size: row.get::<_, i64>(5)? as u32,
                    started_at_epoch_ms: row.get(6)?,
                    finished_at_epoch_ms: row.get(7)?,
                    error_message: row.get(8)?,
                    duplicate_config,
                    config_fingerprint: row.get(10)?,
                    duplicate_run_phase,
                })
            })
            .optional()
            .map_err(|error| error.to_string())?;

        match row {
            Some(mut job) => {
                job.source_paths = self.get_scan_sources(job_id)?;
                Ok(Some(job))
            }
            None => Ok(None),
        }
    }

    pub(crate) fn get_scan_sources(&self, job_id: &str) -> Result<Vec<String>, String> {
        let connection = self.connection()?;
        let mut statement = connection
            .prepare("SELECT source_path FROM scan_sources WHERE job_id = ?1 ORDER BY rowid ASC")
            .map_err(|error| error.to_string())?;
        let sources = statement
            .query_map(params![job_id], |row| row.get(0))
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;
        Ok(sources)
    }
}
