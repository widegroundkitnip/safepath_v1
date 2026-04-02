use chrono::{Local, NaiveDate, TimeZone};
use exif::{In, Reader, Tag, Value};
use std::fs::File;
use std::io::BufReader;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use walkdir::WalkDir;

use crate::types::{ManifestEntryKind, MediaDateSource, ScanProgressEvent, ScannedEntryRecord};

const MAX_EMBEDDED_MEDIA_SCAN_BYTES: u64 = 128 * 1024 * 1024;

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
            let extension = path
                .extension()
                .map(|extension| extension.to_string_lossy().to_string());
            let entry_kind = if metadata.is_dir() {
                scanned_directories += 1;
                ManifestEntryKind::Directory
            } else {
                scanned_files += 1;
                ManifestEntryKind::File
            };
            let created_at_epoch_ms = system_time_to_epoch_ms(metadata.created().ok());
            let modified_at_epoch_ms = system_time_to_epoch_ms(metadata.modified().ok());
            let (media_date_epoch_ms, media_date_source) = media_date_for_entry(
                &path,
                entry_kind,
                extension.as_deref(),
                metadata.len(),
                created_at_epoch_ms,
                modified_at_epoch_ms,
            );

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
                extension,
                is_hidden,
                created_at_epoch_ms,
                modified_at_epoch_ms,
                media_date_epoch_ms,
                media_date_source,
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

fn media_date_for_entry(
    path: &Path,
    entry_kind: ManifestEntryKind,
    extension: Option<&str>,
    size_bytes: u64,
    created_at_epoch_ms: Option<i64>,
    modified_at_epoch_ms: Option<i64>,
) -> (Option<i64>, Option<MediaDateSource>) {
    if entry_kind != ManifestEntryKind::File {
        return (None, None);
    }

    let Some(extension) = extension.map(|value| value.to_ascii_lowercase()) else {
        return (None, None);
    };

    if !is_media_extension(&extension) {
        return (None, None);
    }

    if is_embedded_metadata_extension(&extension) && size_bytes <= MAX_EMBEDDED_MEDIA_SCAN_BYTES {
        if let Some(media_date_epoch_ms) = embedded_media_date_epoch_ms(path) {
            return (
                Some(media_date_epoch_ms),
                Some(MediaDateSource::EmbeddedMetadata),
            );
        }
    }

    if let Some(created_at_epoch_ms) = created_at_epoch_ms {
        return (
            Some(created_at_epoch_ms),
            Some(MediaDateSource::FilesystemCreated),
        );
    }

    if let Some(modified_at_epoch_ms) = modified_at_epoch_ms {
        return (
            Some(modified_at_epoch_ms),
            Some(MediaDateSource::FilesystemModified),
        );
    }

    (None, None)
}

fn embedded_media_date_epoch_ms(path: &Path) -> Option<i64> {
    let file = File::open(path).ok()?;
    let mut reader = BufReader::new(file);
    let exif = Reader::new().read_from_container(&mut reader).ok()?;
    let field = exif
        .get_field(Tag::DateTimeOriginal, In::PRIMARY)
        .or_else(|| exif.get_field(Tag::DateTimeDigitized, In::PRIMARY))
        .or_else(|| exif.get_field(Tag::DateTime, In::PRIMARY))?;
    let ascii = match &field.value {
        Value::Ascii(values) => values.first()?.as_slice(),
        _ => return None,
    };
    let datetime = exif::DateTime::from_ascii(ascii).ok()?;
    naive_local_datetime_to_epoch_ms(
        i32::from(datetime.year),
        datetime.month,
        datetime.day,
        datetime.hour,
        datetime.minute,
        datetime.second,
    )
}

fn naive_local_datetime_to_epoch_ms(
    year: i32,
    month: u8,
    day: u8,
    hour: u8,
    minute: u8,
    second: u8,
) -> Option<i64> {
    let date = NaiveDate::from_ymd_opt(year, u32::from(month), u32::from(day))?;
    let naive = date.and_hms_opt(u32::from(hour), u32::from(minute), u32::from(second))?;
    Local
        .from_local_datetime(&naive)
        .single()
        .or_else(|| Local.from_local_datetime(&naive).earliest())
        .or_else(|| Local.from_local_datetime(&naive).latest())
        .map(|datetime| datetime.timestamp_millis())
}

fn is_media_extension(extension: &str) -> bool {
    matches!(
        extension,
        "jpg"
            | "jpeg"
            | "png"
            | "gif"
            | "webp"
            | "heic"
            | "tif"
            | "tiff"
            | "bmp"
            | "svg"
            | "mov"
            | "mp4"
            | "m4v"
            | "mxf"
            | "avi"
            | "mkv"
            | "webm"
    )
}

fn is_embedded_metadata_extension(extension: &str) -> bool {
    matches!(extension, "jpg" | "jpeg" | "tif" | "tiff")
}

#[cfg(test)]
mod tests {
    use super::{media_date_for_entry, naive_local_datetime_to_epoch_ms, scan_sources};
    use crate::types::{ManifestEntryKind, MediaDateSource};
    use std::path::Path;

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

    #[test]
    fn media_date_prefers_created_then_modified_for_video_fallbacks() {
        let result = media_date_for_entry(
            Path::new("/tmp/video.mp4"),
            ManifestEntryKind::File,
            Some("mp4"),
            42,
            Some(10),
            Some(20),
        );
        assert_eq!(result, (Some(10), Some(MediaDateSource::FilesystemCreated)));

        let modified_fallback = media_date_for_entry(
            Path::new("/tmp/video.mp4"),
            ManifestEntryKind::File,
            Some("mp4"),
            42,
            None,
            Some(20),
        );
        assert_eq!(
            modified_fallback,
            (Some(20), Some(MediaDateSource::FilesystemModified))
        );
    }

    #[test]
    fn local_datetime_conversion_returns_epoch_ms() {
        assert!(naive_local_datetime_to_epoch_ms(2024, 1, 2, 3, 4, 5).is_some());
    }
}
