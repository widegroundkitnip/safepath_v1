use rusqlite::params;

use crate::Store;

impl Store {
    /// Drop hash / dHash cache rows for `entry_id` values that are not in the current manifest.
    pub(crate) fn prune_orphaned_expensive_analysis_caches(&self, job_id: &str) -> Result<(), String> {
        let connection = self.connection()?;
        connection
            .execute(
                "DELETE FROM file_content_hashes
                 WHERE job_id = ?1
                   AND entry_id NOT IN (
                       SELECT entry_id FROM manifest_entries WHERE job_id = ?1
                   )",
                params![job_id],
            )
            .map_err(|e| e.to_string())?;
        connection
            .execute(
                "DELETE FROM image_dhash_cache
                 WHERE job_id = ?1
                   AND entry_id NOT IN (
                       SELECT entry_id FROM manifest_entries WHERE job_id = ?1
                   )",
                params![job_id],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Remove all expensive-analysis cache rows for a job (cancelled / failed scan, etc.).
    pub fn clear_expensive_analysis_caches_for_job(&self, job_id: &str) -> Result<(), String> {
        let connection = self.connection()?;
        connection
            .execute(
                "DELETE FROM file_content_hashes WHERE job_id = ?1",
                params![job_id],
            )
            .map_err(|e| e.to_string())?;
        connection
            .execute(
                "DELETE FROM image_dhash_cache WHERE job_id = ?1",
                params![job_id],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Drop hash / dHash cache rows for `job_id` values not present in `scan_jobs` (orphaned rows).
    pub(crate) fn prune_expensive_analysis_caches_for_unknown_jobs(&self) -> Result<(), String> {
        let connection = self.connection()?;
        connection
            .execute(
                "DELETE FROM file_content_hashes
                 WHERE job_id NOT IN (SELECT job_id FROM scan_jobs)",
                [],
            )
            .map_err(|e| e.to_string())?;
        connection
            .execute(
                "DELETE FROM image_dhash_cache
                 WHERE job_id NOT IN (SELECT job_id FROM scan_jobs)",
                [],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}
