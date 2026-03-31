use std::fs::{self, OpenOptions};
use std::path::Path;

use safepath_core::{PermissionReadinessDto, PermissionReadinessState};
use uuid::Uuid;

pub fn permissions_readiness(
    source_paths: &[String],
    destination_paths: &[String],
) -> PermissionReadinessDto {
    if source_paths.is_empty() || destination_paths.is_empty() {
        let mut details = Vec::new();
        if source_paths.is_empty() {
            details.push("Select at least one source path to scan.".to_string());
        }
        if destination_paths.is_empty() {
            details.push("Select at least one destination folder before scanning.".to_string());
        }

        return PermissionReadinessDto {
            state: PermissionReadinessState::Unknown,
            summary: "Select sources and destinations to run permission checks.".to_string(),
            details,
        };
    }

    let mut issues = Vec::new();
    for path in source_paths {
        if let Err(error) = probe_source_path(path) {
            issues.push(error);
        }
    }
    for path in destination_paths {
        if let Err(error) = probe_destination_path(path) {
            issues.push(error);
        }
    }

    if issues.is_empty() {
        PermissionReadinessDto {
            state: PermissionReadinessState::Ready,
            summary:
                "Safepath can read the selected sources and write to the selected destinations."
                    .to_string(),
            details: vec![
                format!("{} source path(s) passed read checks.", source_paths.len()),
                format!(
                    "{} destination folder(s) passed write checks.",
                    destination_paths.len()
                ),
            ],
        }
    } else {
        PermissionReadinessDto {
            state: PermissionReadinessState::NeedsAttention,
            summary: "Fix the path or permission issues below before starting a scan.".to_string(),
            details: issues,
        }
    }
}

pub fn probe_source_path(path: &str) -> Result<(), String> {
    let metadata = fs::metadata(path)
        .map_err(|error| format_access_error("source", path, error.to_string()))?;

    if metadata.is_dir() {
        fs::read_dir(path)
            .map_err(|error| format_access_error("source", path, error.to_string()))?
            .next();
    } else {
        OpenOptions::new()
            .read(true)
            .open(path)
            .map_err(|error| format_access_error("source", path, error.to_string()))?;
    }

    Ok(())
}

pub fn probe_destination_path(path: &str) -> Result<(), String> {
    let metadata = fs::metadata(path)
        .map_err(|error| format_access_error("destination", path, error.to_string()))?;

    if !metadata.is_dir() {
        return Err(format!(
            "Destination path `{path}` must be an existing folder, not a file."
        ));
    }

    let probe_path = Path::new(path).join(format!(".safepath-permission-probe-{}", Uuid::new_v4()));
    OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&probe_path)
        .map_err(|error| format_access_error("destination", path, error.to_string()))?;
    let _ = fs::remove_file(probe_path);

    Ok(())
}

fn format_access_error(kind: &str, path: &str, error: String) -> String {
    match full_disk_access_hint(path) {
        Some(hint) => format!("Cannot access {kind} path `{path}`: {error}. {hint}"),
        None => format!("Cannot access {kind} path `{path}`: {error}."),
    }
}

fn full_disk_access_hint(path: &str) -> Option<&'static str> {
    let path = Path::new(path);
    if path.starts_with("/Users")
        && path
            .components()
            .any(|component| component.as_os_str() == "Library")
    {
        return Some("macOS may require Full Disk Access for Library content.");
    }
    if path.starts_with("/Volumes") {
        return Some("External volumes can require extra macOS privacy permissions.");
    }
    if path.starts_with("/Library") {
        return Some("System-managed folders can require elevated macOS permissions.");
    }
    None
}
