use rusqlite::params;
use safepath_core::types::ScannedEntryRecord;
use safepath_core::{ManifestEntryDto, ManifestPageDto};
use uuid::Uuid;

use crate::util::{manifest_entry_kind_code, parse_manifest_entry_kind};
use crate::Store;

impl Store {
    pub fn record_manifest_entry(
        &self,
        job_id: &str,
        entry: &ScannedEntryRecord,
    ) -> Result<u64, String> {
        let connection = self.connection()?;
        let entry_id = Uuid::new_v4().to_string();
        let media_date_source_json = entry
            .media_date_source
            .map(|value| serde_json::to_string(&value))
            .transpose()
            .map_err(|error| error.to_string())?;
        connection
            .execute(
                "INSERT INTO manifest_entries (
                    entry_id, job_id, source_root, path, relative_path, name, entry_kind,
                    size_bytes, extension, is_hidden, created_at_epoch_ms, modified_at_epoch_ms,
                    media_date_epoch_ms, media_date_source
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
                params![
                    entry_id,
                    job_id,
                    entry.source_root,
                    entry.path,
                    entry.relative_path,
                    entry.name,
                    manifest_entry_kind_code(entry.entry_kind),
                    entry.size_bytes as i64,
                    entry.extension,
                    entry.is_hidden as i64,
                    entry.created_at_epoch_ms,
                    entry.modified_at_epoch_ms,
                    entry.media_date_epoch_ms,
                    media_date_source_json,
                ],
            )
            .map_err(|error| error.to_string())?;

        connection
            .execute(
                "UPDATE scan_jobs
                 SET discovered_entries = discovered_entries + 1,
                     scanned_files = scanned_files + CASE WHEN ?2 = 'file' THEN 1 ELSE 0 END,
                     scanned_directories = scanned_directories + CASE WHEN ?2 = 'directory' THEN 1 ELSE 0 END
                 WHERE job_id = ?1",
                params![job_id, manifest_entry_kind_code(entry.entry_kind)],
            )
            .map_err(|error| error.to_string())?;

        let discovered_entries = connection
            .query_row(
                "SELECT discovered_entries FROM scan_jobs WHERE job_id = ?1",
                params![job_id],
                |row| row.get::<_, i64>(0),
            )
            .map_err(|error| error.to_string())?;

        Ok(discovered_entries as u64)
    }

    pub fn get_manifest_page(
        &self,
        job_id: &str,
        page: u32,
        page_size: u32,
    ) -> Result<ManifestPageDto, String> {
        let safe_page_size = page_size.max(1);
        let offset = i64::from(page.saturating_mul(safe_page_size));
        let connection = self.connection()?;
        let total_entries = connection
            .query_row(
                "SELECT COUNT(*) FROM manifest_entries WHERE job_id = ?1",
                params![job_id],
                |row| row.get::<_, i64>(0),
            )
            .map_err(|error| error.to_string())? as u64;

        let total_pages = if total_entries == 0 {
            0
        } else {
            ((total_entries - 1) / u64::from(safe_page_size) + 1) as u32
        };

        let entries =
            self.load_manifest_entries(job_id, Some(i64::from(safe_page_size)), Some(offset))?;

        Ok(ManifestPageDto {
            job_id: job_id.to_string(),
            page,
            page_size: safe_page_size,
            total_entries,
            total_pages,
            entries,
        })
    }

    pub fn get_manifest_entries(&self, job_id: &str) -> Result<Vec<ManifestEntryDto>, String> {
        self.load_manifest_entries(job_id, None, None)
    }

    fn load_manifest_entries(
        &self,
        job_id: &str,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> Result<Vec<ManifestEntryDto>, String> {
        let connection = self.connection()?;

        let sql = if limit.is_some() && offset.is_some() {
            "SELECT
                entry_id, job_id, source_root, path, relative_path, name, entry_kind,
                size_bytes, extension, is_hidden, created_at_epoch_ms, modified_at_epoch_ms,
                media_date_epoch_ms, media_date_source
             FROM manifest_entries
             WHERE job_id = ?1
             ORDER BY path ASC
             LIMIT ?2 OFFSET ?3"
        } else {
            "SELECT
                entry_id, job_id, source_root, path, relative_path, name, entry_kind,
                size_bytes, extension, is_hidden, created_at_epoch_ms, modified_at_epoch_ms,
                media_date_epoch_ms, media_date_source
             FROM manifest_entries
             WHERE job_id = ?1
             ORDER BY path ASC"
        };

        let mut statement = connection.prepare(sql).map_err(|error| error.to_string())?;
        let mapped_rows = match (limit, offset) {
            (Some(limit), Some(offset)) => {
                statement.query_map(params![job_id, limit, offset], map_manifest_entry)
            }
            _ => statement.query_map(params![job_id], map_manifest_entry),
        }
        .map_err(|error| error.to_string())?;

        mapped_rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())
    }
}

fn map_manifest_entry(row: &rusqlite::Row<'_>) -> rusqlite::Result<ManifestEntryDto> {
    Ok(ManifestEntryDto {
        entry_id: row.get(0)?,
        job_id: row.get(1)?,
        source_root: row.get(2)?,
        path: row.get(3)?,
        relative_path: row.get(4)?,
        name: row.get(5)?,
        entry_kind: parse_manifest_entry_kind(row.get::<_, String>(6)?),
        size_bytes: row.get::<_, i64>(7)? as u64,
        extension: row.get(8)?,
        is_hidden: row.get::<_, i64>(9)? != 0,
        created_at_epoch_ms: row.get(10)?,
        modified_at_epoch_ms: row.get(11)?,
        media_date_epoch_ms: row.get(12)?,
        media_date_source: row
            .get::<_, Option<String>>(13)?
            .map(|value| serde_json::from_str(&value))
            .transpose()
            .map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    13,
                    rusqlite::types::Type::Text,
                    Box::new(error),
                )
            })?,
    })
}
