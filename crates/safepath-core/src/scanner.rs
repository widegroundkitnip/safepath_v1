use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use walkdir::WalkDir;

use crate::types::{ManifestEntryKind, ScanProgressEvent, ScannedEntryRecord};

pub fn scan_sources<F, G>(
    source_paths: &[String],
    mut on_entry: F,
    mut on_progress: G,
    mut is_cancelled: impl FnMut() -> bool,
) -> Result<(), String>
where
    F: FnMut(ScannedEntryRecord) -> Result<(), String>,
    G: FnMut(ScanProgressEvent) -> Result<(), String>,
{
    let mut discovered_entries = 0_u64;
    let mut scanned_files = 0_u64;
    let mut scanned_directories = 0_u64;

    for source in source_paths {
        let root = PathBuf::from(source);
        if !root.exists() {
            return Err(format!("Source path does not exist: {source}"));
        }

        for item in WalkDir::new(&root).follow_links(false) {
            if is_cancelled() {
                return Ok(());
            }

            let entry = item.map_err(|error| error.to_string())?;
            let metadata = entry.metadata().map_err(|error| error.to_string())?;
            let path = entry.path().to_path_buf();
            let source_root = normalize_path(&root);
            let relative_path = build_relative_path(&root, &path);
            let name = entry.file_name().to_string_lossy().to_string();
            let is_hidden = name.starts_with('.');
            let entry_kind = if metadata.is_dir() {
                scanned_directories += 1;
                ManifestEntryKind::Directory
            } else {
                scanned_files += 1;
                ManifestEntryKind::File
            };

            discovered_entries += 1;

            on_entry(ScannedEntryRecord {
                source_root,
                path: normalize_path(&path),
                relative_path,
                name: name.clone(),
                entry_kind,
                size_bytes: if metadata.is_file() {
                    metadata.len()
                } else {
                    0
                },
                extension: path
                    .extension()
                    .map(|extension| extension.to_string_lossy().to_string()),
                is_hidden,
                created_at_epoch_ms: system_time_to_epoch_ms(metadata.created().ok()),
                modified_at_epoch_ms: system_time_to_epoch_ms(metadata.modified().ok()),
            })?;

            if discovered_entries == 1 || discovered_entries % 25 == 0 {
                on_progress(ScanProgressEvent {
                    job_id: String::new(),
                    discovered_entries,
                    scanned_files,
                    scanned_directories,
                    latest_path: Some(normalize_path(&path)),
                })?;
            }
        }
    }

    on_progress(ScanProgressEvent {
        job_id: String::new(),
        discovered_entries,
        scanned_files,
        scanned_directories,
        latest_path: None,
    })?;

    Ok(())
}

fn build_relative_path(root: &Path, path: &Path) -> String {
    match path.strip_prefix(root) {
        Ok(relative) if !relative.as_os_str().is_empty() => normalize_path(relative),
        _ => ".".to_string(),
    }
}

fn normalize_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn system_time_to_epoch_ms(value: Option<SystemTime>) -> Option<i64> {
    value
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as i64)
}

#[cfg(test)]
mod tests {
    use super::scan_sources;

    #[test]
    fn reports_missing_source_error() {
        let result = scan_sources(
            &["/definitely/missing".to_string()],
            |_| Ok(()),
            |_| Ok(()),
            || false,
        );
        assert!(result.is_err());
    }
}
