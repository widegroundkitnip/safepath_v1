use std::path::{Component, Path, PathBuf};

pub fn normalize_display_path(path: impl AsRef<Path>) -> String {
    path.as_ref().to_string_lossy().replace('\\', "/")
}

pub fn join_path(root: &str, relative: &str, leaf: &str) -> String {
    let mut path = PathBuf::from(root);
    push_relative_segments(&mut path, relative);
    if !leaf.trim().is_empty() {
        path.push(leaf);
    }
    normalize_display_path(path)
}

pub fn join_segments(root: &str, segments: &[&str]) -> String {
    let mut path = PathBuf::from(root);
    for segment in segments {
        push_relative_segments(&mut path, segment);
    }
    normalize_display_path(path)
}

pub fn disambiguated_filename(source_path: &str, stable_suffix: &str) -> String {
    let file_name = Path::new(source_path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("duplicate");
    let path = Path::new(file_name);
    let stem = path.file_stem().and_then(|value| value.to_str()).unwrap_or("duplicate");
    let extension = path.extension().and_then(|value| value.to_str());
    let sanitized_suffix = sanitize_filename_segment(stable_suffix);

    match extension {
        Some(extension) if !extension.is_empty() => {
            format!("{stem}--{sanitized_suffix}.{extension}")
        }
        _ => format!("{stem}--{sanitized_suffix}"),
    }
}

pub fn path_is_within(path: &str, ancestor: &str) -> bool {
    let path_components = normalized_components(path);
    let ancestor_components = normalized_components(ancestor);

    !ancestor_components.is_empty()
        && path_components.len() >= ancestor_components.len()
        && path_components
            .iter()
            .zip(ancestor_components.iter())
            .all(|(path_component, ancestor_component)| path_component == ancestor_component)
}

pub fn normalize_selection_path(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    match std::fs::canonicalize(trimmed) {
        Ok(path) => normalize_display_path(path),
        Err(_) => normalize_display_path(strip_trailing_separators(Path::new(trimmed))),
    }
}

#[cfg(windows)]
pub fn selection_path_key(path: &str) -> String {
    path.to_ascii_lowercase()
}

#[cfg(not(windows))]
pub fn selection_path_key(path: &str) -> String {
    path.to_string()
}

fn push_relative_segments(path: &mut PathBuf, relative: &str) {
    for component in Path::new(relative).components() {
        if let Component::Normal(segment) = component {
            path.push(segment);
        }
    }
}

fn strip_trailing_separators(path: &Path) -> PathBuf {
    let normalized = normalize_display_path(path);
    if normalized == "/" {
        return PathBuf::from("/");
    }

    let trimmed = normalized.trim_end_matches('/');
    if trimmed.is_empty() {
        PathBuf::from(normalized)
    } else {
        PathBuf::from(trimmed)
    }
}

fn sanitize_filename_segment(segment: &str) -> String {
    let sanitized = segment
        .chars()
        .map(|ch| match ch {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => ch,
        })
        .collect::<String>()
        .trim()
        .to_string();
    if sanitized.is_empty() {
        "entry".to_string()
    } else {
        sanitized
    }
}

fn normalized_components(path: &str) -> Vec<String> {
    Path::new(path)
        .components()
        .filter_map(|component| match component {
            Component::Prefix(prefix) => Some(normalize_component(
                &prefix.as_os_str().to_string_lossy(),
            )),
            Component::RootDir => Some("/".to_string()),
            Component::Normal(segment) => Some(normalize_component(&segment.to_string_lossy())),
            Component::CurDir => None,
            Component::ParentDir => Some("..".to_string()),
        })
        .collect()
}

#[cfg(windows)]
fn normalize_component(component: &str) -> String {
    component.to_ascii_lowercase()
}

#[cfg(not(windows))]
fn normalize_component(component: &str) -> String {
    component.to_string()
}

#[cfg(test)]
mod tests {
    use super::{
        disambiguated_filename, join_path, normalize_selection_path, path_is_within,
        selection_path_key,
    };

    #[test]
    fn builds_joined_paths_without_manual_separator_logic() {
        assert_eq!(
            join_path("/tmp/root", "Images/2026", "photo.jpg"),
            "/tmp/root/Images/2026/photo.jpg"
        );
    }

    #[test]
    fn adds_a_stable_suffix_before_the_extension() {
        assert_eq!(
            disambiguated_filename("/tmp/example/photo.jpg", "entry-123"),
            "photo--entry-123.jpg"
        );
    }

    #[test]
    fn path_prefix_matching_uses_path_components() {
        assert!(path_is_within("/tmp/root/nested/file.txt", "/tmp/root"));
        assert!(!path_is_within("/tmp/root-else/file.txt", "/tmp/root"));
    }

    #[test]
    fn selection_path_normalization_strips_trailing_separators() {
        let normalized = normalize_selection_path("/tmp/example///");
        assert_eq!(selection_path_key(&normalized), selection_path_key("/tmp/example"));
    }
}
