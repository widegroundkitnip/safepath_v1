use rusqlite::{params, OptionalExtension};
use safepath_core::{ScanJobState, ScanJobStatusDto};
use uuid::Uuid;

use crate::util::{now_epoch_ms, parse_scan_state, scan_state_code};
use crate::Store;

impl Store {
    pub fn create_scan_job(
        &self,
        source_paths: &[String],
        page_size: u32,
    ) -> Result<ScanJobStatusDto, String> {
        let job_id = Uuid::new_v4().to_string();
        let started_at = now_epoch_ms();
        let connection = self.connection()?;
        connection
            .execute(
                "INSERT INTO scan_jobs (
                    job_id, status, discovered_entries, scanned_files, scanned_directories,
                    page_size, started_at_epoch_ms, finished_at_epoch_ms, error_message
                ) VALUES (?1, ?2, 0, 0, 0, ?3, ?4, NULL, NULL)",
                params![
                    job_id,
                    scan_state_code(ScanJobState::Pending),
                    page_size,
                    started_at
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

        self.get_scan_status(&job_id)?
            .ok_or_else(|| "Failed to load scan job after creation.".to_string())
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
                    error_message
                 FROM scan_jobs
                 WHERE job_id = ?1",
            )
            .map_err(|error| error.to_string())?;

        let row = statement
            .query_row(params![job_id], |row| {
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
