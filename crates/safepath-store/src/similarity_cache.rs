use rusqlite::{params, OptionalExtension};

use safepath_core::ImageDHashCache;

use crate::Store;

impl ImageDHashCache for Store {
    fn get_cached_image_dhash(
        &self,
        job_id: &str,
        entry_id: &str,
        size_bytes: u64,
        modified_ms: Option<i64>,
    ) -> Option<u64> {
        self.get_cached_image_dhash_impl(job_id, entry_id, size_bytes, modified_ms)
            .ok()
            .flatten()
    }

    fn put_cached_image_dhash(
        &self,
        job_id: &str,
        entry_id: &str,
        size_bytes: u64,
        modified_ms: Option<i64>,
        d_hash: u64,
    ) -> Result<(), String> {
        self.put_cached_image_dhash_impl(job_id, entry_id, size_bytes, modified_ms, d_hash)
    }
}

impl Store {
    fn get_cached_image_dhash_impl(
        &self,
        job_id: &str,
        entry_id: &str,
        size_bytes: u64,
        modified_ms: Option<i64>,
    ) -> Result<Option<u64>, String> {
        let connection = self.connection()?;
        let row = connection
            .query_row(
                "SELECT d_hash, size_bytes, modified_ms FROM image_dhash_cache
                 WHERE job_id = ?1 AND entry_id = ?2",
                params![job_id, entry_id],
                |row| {
                    Ok((
                        row.get::<_, i64>(0)? as u64,
                        row.get::<_, i64>(1)? as u64,
                        row.get::<_, Option<i64>>(2)?,
                    ))
                },
            )
            .optional()
            .map_err(|error| error.to_string())?;

        match row {
            Some((hash, stored_size, stored_mtime))
                if stored_size == size_bytes && stored_mtime == modified_ms =>
            {
                Ok(Some(hash))
            }
            Some(_) => Ok(None),
            None => Ok(None),
        }
    }

    fn put_cached_image_dhash_impl(
        &self,
        job_id: &str,
        entry_id: &str,
        size_bytes: u64,
        modified_ms: Option<i64>,
        d_hash: u64,
    ) -> Result<(), String> {
        let connection = self.connection()?;
        connection
            .execute(
                "INSERT INTO image_dhash_cache (job_id, entry_id, size_bytes, modified_ms, d_hash)
                 VALUES (?1, ?2, ?3, ?4, ?5)
                 ON CONFLICT(job_id, entry_id) DO UPDATE SET
                    size_bytes = excluded.size_bytes,
                    modified_ms = excluded.modified_ms,
                    d_hash = excluded.d_hash",
                params![
                    job_id,
                    entry_id,
                    size_bytes as i64,
                    modified_ms,
                    d_hash as i64
                ],
            )
            .map_err(|error| error.to_string())?;
        Ok(())
    }
}
