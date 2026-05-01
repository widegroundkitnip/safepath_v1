use rusqlite::{params, OptionalExtension};

use safepath_core::FileContentHashCache;

use crate::Store;

impl FileContentHashCache for Store {
    fn get_cached_file_hash(
        &self,
        job_id: &str,
        entry_id: &str,
        size_bytes: u64,
        modified_ms: Option<i64>,
    ) -> Option<String> {
        self.get_cached_file_hash_impl(job_id, entry_id, size_bytes, modified_ms)
            .ok()
            .flatten()
    }

    fn put_cached_file_hash(
        &self,
        job_id: &str,
        entry_id: &str,
        size_bytes: u64,
        modified_ms: Option<i64>,
        hash_hex: &str,
    ) -> Result<(), String> {
        self.put_cached_file_hash_impl(job_id, entry_id, size_bytes, modified_ms, hash_hex)
    }
}

impl Store {
    fn get_cached_file_hash_impl(
        &self,
        job_id: &str,
        entry_id: &str,
        size_bytes: u64,
        modified_ms: Option<i64>,
    ) -> Result<Option<String>, String> {
        let connection = self.connection()?;
        let row = connection
            .query_row(
                "SELECT hash_hex, size_bytes, modified_ms FROM file_content_hashes
                 WHERE job_id = ?1 AND entry_id = ?2",
                params![job_id, entry_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
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

    fn put_cached_file_hash_impl(
        &self,
        job_id: &str,
        entry_id: &str,
        size_bytes: u64,
        modified_ms: Option<i64>,
        hash_hex: &str,
    ) -> Result<(), String> {
        let connection = self.connection()?;
        connection
            .execute(
                "INSERT INTO file_content_hashes (job_id, entry_id, size_bytes, modified_ms, hash_hex)
                 VALUES (?1, ?2, ?3, ?4, ?5)
                 ON CONFLICT(job_id, entry_id) DO UPDATE SET
                    size_bytes = excluded.size_bytes,
                    modified_ms = excluded.modified_ms,
                    hash_hex = excluded.hash_hex",
                params![
                    job_id,
                    entry_id,
                    size_bytes as i64,
                    modified_ms,
                    hash_hex
                ],
            )
            .map_err(|error| error.to_string())?;
        Ok(())
    }
}
