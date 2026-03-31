use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};

use uuid::Uuid;

use crate::test_data::SYNTHETIC_DATASET_MANIFEST_NAME;
use crate::types::{
    AnalysisSummaryDto, BoundaryKind, CategoryCountDto, DuplicateCertainty, DuplicateGroupDto,
    DuplicateMemberDto, FileCategory, ManifestEntryDto, ManifestEntryKind, ProtectionDetectionDto,
    ProtectionOverrideDto, ProtectionOverrideKind, ProtectionState, StructureSignalDto,
    StructureSignalKind, SyntheticDatasetManifestDto,
};

pub fn analyze_manifest(
    job_id: &str,
    entries: &[ManifestEntryDto],
    protection_overrides: &[ProtectionOverrideDto],
) -> AnalysisSummaryDto {
    let mut category_counts: HashMap<FileCategory, u64> = HashMap::new();
    let mut likely_duplicate_buckets: BTreeMap<(String, u64), Vec<&ManifestEntryDto>> =
        BTreeMap::new();
    let mut hidden_entries = 0_u64;
    let mut no_extension_count = 0_u64;
    let mut unknown_count = 0_u64;
    let mut max_depth = 0_usize;
    let mut root_file_count = 0_u64;
    let mut folder_categories: BTreeMap<String, BTreeSet<FileCategory>> = BTreeMap::new();
    let mut markers_by_parent: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    let mut directories_with_children: HashSet<String> = HashSet::new();

    for entry in entries {
        let category = classify_entry(entry);
        *category_counts.entry(category).or_insert(0) += 1;

        if entry.is_hidden {
            hidden_entries += 1;
        }

        if entry.entry_kind == ManifestEntryKind::File && entry.extension.is_none() {
            no_extension_count += 1;
        }

        if category == FileCategory::Unknown {
            unknown_count += 1;
        }

        if entry.relative_path != "." {
            let depth = entry.relative_path.split('/').count();
            max_depth = max_depth.max(depth);
        }

        if entry.relative_path != "."
            && !entry.relative_path.contains('/')
            && entry.entry_kind == ManifestEntryKind::File
        {
            root_file_count += 1;
        }

        if entry.relative_path != "." {
            directories_with_children.insert(parent_key(&entry.path, &entry.source_root));
        }

        let folder_key = parent_key(&entry.path, &entry.source_root);
        folder_categories
            .entry(folder_key)
            .or_default()
            .insert(category);

        if is_project_marker(&entry.name) {
            let parent = parent_key(&entry.path, &entry.source_root);
            markers_by_parent
                .entry(parent)
                .or_default()
                .insert(entry.name.clone());
        }

        if entry.entry_kind == ManifestEntryKind::File {
            if entry.size_bytes > 0 {
                likely_duplicate_buckets
                    .entry((entry.name.to_lowercase(), entry.size_bytes))
                    .or_default()
                    .push(entry);
            }
        }
    }

    let mut structure_signals = Vec::new();
    let empty_directories = entries
        .iter()
        .filter(|entry| {
            entry.entry_kind == ManifestEntryKind::Directory
                && !directories_with_children.contains(&entry.path)
        })
        .count() as u64;
    if root_file_count >= 20 {
        structure_signals.push(StructureSignalDto {
            kind: StructureSignalKind::FlatChaos,
            description: format!("{root_file_count} loose files sit directly in a source root."),
        });
    }
    if max_depth >= 6 {
        structure_signals.push(StructureSignalDto {
            kind: StructureSignalKind::DeepNesting,
            description: format!("The deepest scanned path reaches {max_depth} levels."),
        });
    }
    if hidden_entries > 0 {
        structure_signals.push(StructureSignalDto {
            kind: StructureSignalKind::HiddenClutter,
            description: format!("{hidden_entries} hidden items were detected."),
        });
    }
    if empty_directories > 0 {
        structure_signals.push(StructureSignalDto {
            kind: StructureSignalKind::EmptyFolders,
            description: format!("{empty_directories} empty folders were detected."),
        });
    }

    if folder_categories
        .values()
        .any(|categories| categories.len() >= 4)
    {
        structure_signals.push(StructureSignalDto {
            kind: StructureSignalKind::MixedContent,
            description: "At least one folder mixes four or more file categories.".to_string(),
        });
    }

    let likely_duplicate_groups = likely_duplicate_buckets
        .into_iter()
        .filter(|(_, members)| members.len() > 1)
        .map(|((name, size_bytes), members)| DuplicateGroupDto {
            group_id: Uuid::new_v4().to_string(),
            certainty: DuplicateCertainty::Likely,
            representative_name: name,
            size_bytes,
            item_count: members.len() as u32,
            members: members
                .into_iter()
                .map(|entry| DuplicateMemberDto {
                    entry_id: entry.entry_id.clone(),
                    path: entry.path.clone(),
                })
                .collect(),
        })
        .collect();

    let mut detected_protections: Vec<ProtectionDetectionDto> = markers_by_parent
        .into_iter()
        .map(|(path, markers)| {
            let markers_vec = markers.into_iter().collect::<Vec<_>>();
            let (state, confidence, reasons) = if markers_vec.iter().any(|marker| marker == ".git")
            {
                (
                    ProtectionState::AutoDetectedHigh,
                    Some(0.95),
                    vec!["Git metadata indicates a likely project root.".to_string()],
                )
            } else if markers_vec.iter().any(|marker| {
                matches!(
                    marker.as_str(),
                    "Cargo.toml" | "package.json" | "pyproject.toml"
                )
            }) {
                (
                    ProtectionState::AutoDetectedHigh,
                    Some(0.88),
                    vec!["Project manifest files indicate a likely code or app root.".to_string()],
                )
            } else {
                (
                    ProtectionState::AutoDetectedMedium,
                    Some(0.65),
                    vec![
                        "Common workspace markers indicate a structured project folder."
                            .to_string(),
                    ],
                )
            };

            ProtectionDetectionDto {
                path,
                state,
                boundary_kind: BoundaryKind::ProjectRoot,
                confidence,
                markers: markers_vec,
                reasons,
            }
        })
        .collect();

    for override_item in protection_overrides {
        detected_protections.push(ProtectionDetectionDto {
            path: override_item.path.clone(),
            state: ProtectionState::UserProtected,
            boundary_kind: boundary_from_override(override_item.override_kind),
            confidence: Some(1.0),
            markers: vec!["user_override".to_string()],
            reasons: vec!["The user explicitly marked this path as protected.".to_string()],
        });
    }

    AnalysisSummaryDto {
        job_id: job_id.to_string(),
        category_counts: category_counts
            .into_iter()
            .map(|(category, count)| CategoryCountDto { category, count })
            .collect(),
        structure_signals,
        unknown_count,
        no_extension_count,
        likely_duplicate_groups,
        skipped_large_synthetic_files: 0,
        detected_protections,
        protection_overrides: protection_overrides.to_vec(),
    }
}

pub fn run_expensive_analysis(
    job_id: &str,
    entries: &[ManifestEntryDto],
    protection_overrides: &[ProtectionOverrideDto],
) -> Result<AnalysisSummaryDto, String> {
    let mut summary = analyze_manifest(job_id, entries, protection_overrides);
    let hash_skip_policy = load_synthetic_hash_skip_policy(entries);
    let (definite_groups, skipped_large_synthetic_files) =
        build_definite_duplicate_groups(entries, &hash_skip_policy)?;
    let definite_member_ids = definite_groups
        .iter()
        .flat_map(|group| group.members.iter().map(|member| member.entry_id.clone()))
        .collect::<HashSet<_>>();

    let mut duplicate_groups = definite_groups;
    duplicate_groups.extend(summary.likely_duplicate_groups.into_iter().filter(|group| {
        !group
            .members
            .iter()
            .all(|member| definite_member_ids.contains(&member.entry_id))
    }));
    summary.likely_duplicate_groups = duplicate_groups;
    summary.skipped_large_synthetic_files = skipped_large_synthetic_files;

    Ok(summary)
}

pub fn classify_entry(entry: &ManifestEntryDto) -> FileCategory {
    if entry.entry_kind == ManifestEntryKind::Directory {
        return FileCategory::Directory;
    }

    let Some(extension) = entry
        .extension
        .as_deref()
        .map(|extension| extension.to_ascii_lowercase())
    else {
        return FileCategory::Unknown;
    };

    match extension.as_str() {
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "heic" | "tif" | "tiff" | "bmp" | "svg" => {
            FileCategory::Image
        }
        "mov" | "mp4" | "m4v" | "mxf" | "avi" | "mkv" | "webm" => FileCategory::Video,
        "wav" | "mp3" | "aif" | "aiff" | "flac" | "m4a" => FileCategory::Audio,
        "pdf" | "doc" | "docx" | "pages" | "txt" | "rtf" | "md" => FileCategory::Document,
        "zip" | "rar" | "7z" | "tar" | "gz" | "tgz" => FileCategory::Archive,
        "rs" | "ts" | "tsx" | "js" | "jsx" | "json" | "toml" | "py" | "go" | "java" | "swift"
        | "css" | "html" | "sql" => FileCategory::Code,
        "app" | "pkg" | "dmg" => FileCategory::Other,
        _ => FileCategory::Other,
    }
}

fn is_project_marker(name: &str) -> bool {
    matches!(
        name,
        ".git"
            | "Cargo.toml"
            | "package.json"
            | "pyproject.toml"
            | "requirements.txt"
            | "Pipfile"
            | "go.mod"
            | "vite.config.ts"
            | "tsconfig.json"
    ) || name.ends_with(".xcodeproj")
        || name.ends_with(".xcworkspace")
}

fn parent_key(path: &str, source_root: &str) -> String {
    let path_buf = PathBuf::from(path);
    let parent = path_buf.parent().unwrap_or_else(|| Path::new(source_root));
    normalize_path(parent)
}

fn build_definite_duplicate_groups(
    entries: &[ManifestEntryDto],
    hash_skip_policy: &SyntheticHashSkipPolicy,
) -> Result<(Vec<DuplicateGroupDto>, u64), String> {
    let mut size_buckets: BTreeMap<u64, Vec<&ManifestEntryDto>> = BTreeMap::new();

    for entry in entries {
        if entry.entry_kind == ManifestEntryKind::File {
            size_buckets
                .entry(entry.size_bytes)
                .or_default()
                .push(entry);
        }
    }

    let mut definite_groups = Vec::new();
    let mut skipped_large_synthetic_files = 0_u64;

    for (size_bytes, members) in size_buckets {
        if members.len() < 2 {
            continue;
        }

        let mut hash_buckets: BTreeMap<String, Vec<&ManifestEntryDto>> = BTreeMap::new();
        for entry in members {
            if hash_skip_policy.should_skip(entry) {
                skipped_large_synthetic_files += 1;
                continue;
            }
            let hash = hash_file(&entry.path)?;
            hash_buckets.entry(hash).or_default().push(entry);
        }

        for hash_members in hash_buckets.into_values() {
            if hash_members.len() < 2 {
                continue;
            }

            let representative_name = hash_members
                .first()
                .map(|entry| entry.name.clone())
                .unwrap_or_else(|| "duplicate".to_string());
            let item_count = hash_members.len() as u32;
            let members = hash_members
                .into_iter()
                .map(|entry| DuplicateMemberDto {
                    entry_id: entry.entry_id.clone(),
                    path: entry.path.clone(),
                })
                .collect();

            definite_groups.push(DuplicateGroupDto {
                group_id: Uuid::new_v4().to_string(),
                certainty: DuplicateCertainty::Definite,
                representative_name,
                size_bytes,
                item_count,
                members,
            });
        }
    }

    Ok((definite_groups, skipped_large_synthetic_files))
}

fn hash_file(path: &str) -> Result<String, String> {
    let mut file = File::open(path)
        .map_err(|error| format!("Failed to open `{path}` for hashing: {error}"))?;
    let mut hasher = blake3::Hasher::new();
    let mut buffer = [0_u8; 16 * 1024];

    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("Failed to read `{path}` for hashing: {error}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }

    Ok(hasher.finalize().to_hex().to_string())
}

fn boundary_from_override(override_kind: ProtectionOverrideKind) -> BoundaryKind {
    match override_kind {
        ProtectionOverrideKind::UserProtected | ProtectionOverrideKind::ProjectRoot => {
            BoundaryKind::ProjectRoot
        }
        ProtectionOverrideKind::ParentFolder => BoundaryKind::ParentFolder,
        ProtectionOverrideKind::PreserveBoundary => BoundaryKind::PreserveBoundary,
        ProtectionOverrideKind::Independent => BoundaryKind::Independent,
    }
}

fn normalize_path(path: impl AsRef<Path>) -> String {
    path.as_ref().to_string_lossy().replace('\\', "/")
}

fn load_synthetic_hash_skip_policy(entries: &[ManifestEntryDto]) -> SyntheticHashSkipPolicy {
    let mut threshold_by_path = HashMap::new();
    let source_roots = entries
        .iter()
        .map(|entry| entry.source_root.clone())
        .collect::<HashSet<_>>();

    for source_root in source_roots {
        let manifest_path = Path::new(&source_root).join(SYNTHETIC_DATASET_MANIFEST_NAME);
        let Ok(json) = fs::read_to_string(&manifest_path) else {
            continue;
        };
        let Ok(manifest) = serde_json::from_str::<SyntheticDatasetManifestDto>(&json) else {
            continue;
        };

        for relative_path in manifest.sparse_file_relative_paths {
            let normalized = normalize_path(Path::new(&source_root).join(relative_path));
            threshold_by_path.insert(normalized, manifest.hash_skip_threshold_bytes);
        }
    }

    SyntheticHashSkipPolicy { threshold_by_path }
}

struct SyntheticHashSkipPolicy {
    threshold_by_path: HashMap<String, u64>,
}

impl SyntheticHashSkipPolicy {
    fn should_skip(&self, entry: &ManifestEntryDto) -> bool {
        self.threshold_by_path
            .get(&entry.path)
            .map(|threshold| entry.size_bytes >= *threshold)
            .unwrap_or(false)
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::{Path, PathBuf};

    use uuid::Uuid;

    use super::{analyze_manifest, run_expensive_analysis};
    use crate::test_data::SYNTHETIC_DATASET_MANIFEST_NAME;
    use crate::types::{
        BoundaryKind, DuplicateCertainty, ManifestEntryDto, ManifestEntryKind,
        ProtectionOverrideDto, ProtectionOverrideKind, ProtectionState, StructureSignalKind,
        SyntheticDatasetCategory, SyntheticDatasetManifestDto,
    };

    #[test]
    fn detects_git_directory_as_project_root() {
        let project_root = temp_path("project-root");
        let entries = vec![
            manifest_entry(
                "root",
                &project_root,
                &project_root,
                ".",
                "example",
                ManifestEntryKind::Directory,
                0,
            ),
            manifest_entry(
                "git-dir",
                &project_root,
                &project_root.join(".git"),
                ".git",
                ".git",
                ManifestEntryKind::Directory,
                0,
            ),
        ];

        let summary = analyze_manifest("job-1", &entries, &[]);
        assert!(summary.detected_protections.iter().any(|detection| {
            detection.path == project_root.to_string_lossy()
                && detection.state == ProtectionState::AutoDetectedHigh
                && detection.boundary_kind == BoundaryKind::ProjectRoot
        }));
    }

    #[test]
    fn only_marks_truly_empty_directories() {
        let root = temp_path("structure-root");
        let nested = root.join("nested");
        let child_file = nested.join("photo.jpg");
        let empty = root.join("empty");

        let entries = vec![
            manifest_entry(
                "root",
                &root,
                &root,
                ".",
                "root",
                ManifestEntryKind::Directory,
                0,
            ),
            manifest_entry(
                "nested",
                &root,
                &nested,
                "nested",
                "nested",
                ManifestEntryKind::Directory,
                0,
            ),
            manifest_entry(
                "child",
                &root,
                &child_file,
                "nested/photo.jpg",
                "photo.jpg",
                ManifestEntryKind::File,
                10,
            ),
            manifest_entry(
                "empty",
                &root,
                &empty,
                "empty",
                "empty",
                ManifestEntryKind::Directory,
                0,
            ),
        ];

        let summary = analyze_manifest("job-2", &entries, &[]);
        let empty_signal = summary
            .structure_signals
            .iter()
            .find(|signal| signal.kind == StructureSignalKind::EmptyFolders)
            .expect("empty folders signal");
        assert_eq!(empty_signal.description, "1 empty folders were detected.");
    }

    #[test]
    fn expensive_analysis_marks_definite_duplicates() {
        let root = temp_path("expensive-analysis");
        fs::create_dir_all(&root).expect("create temp root");

        let first = root.join("a.txt");
        let second = root.join("b.txt");
        let unique = root.join("c.txt");
        fs::write(&first, b"same-content").expect("write first file");
        fs::write(&second, b"same-content").expect("write second file");
        fs::write(&unique, b"different").expect("write unique file");

        let entries = vec![
            manifest_entry(
                "a",
                &root,
                &first,
                "a.txt",
                "a.txt",
                ManifestEntryKind::File,
                12,
            ),
            manifest_entry(
                "b",
                &root,
                &second,
                "b.txt",
                "b.txt",
                ManifestEntryKind::File,
                12,
            ),
            manifest_entry(
                "c",
                &root,
                &unique,
                "c.txt",
                "c.txt",
                ManifestEntryKind::File,
                9,
            ),
        ];

        let summary = run_expensive_analysis("job-3", &entries, &[]).expect("expensive analysis");
        assert!(summary.likely_duplicate_groups.iter().any(|group| {
            group.certainty == DuplicateCertainty::Definite && group.item_count == 2
        }));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn merges_user_protection_overrides() {
        let root = temp_path("override-root");
        let entries = vec![manifest_entry(
            "root",
            &root,
            &root,
            ".",
            "root",
            ManifestEntryKind::Directory,
            0,
        )];
        let overrides = vec![ProtectionOverrideDto {
            path: root.to_string_lossy().to_string(),
            override_kind: ProtectionOverrideKind::UserProtected,
        }];

        let summary = analyze_manifest("job-4", &entries, &overrides);
        assert!(summary
            .detected_protections
            .iter()
            .any(|detection| detection.state == ProtectionState::UserProtected));
    }

    #[test]
    fn expensive_analysis_skips_large_synthetic_placeholders() {
        let root = temp_path("synthetic-skip");
        let first_folder = root.join("Media");
        let second_folder = root.join("Archive");
        let first = first_folder.join("placeholder.mov");
        let second = second_folder.join("placeholder.mov");
        fs::create_dir_all(&first_folder).expect("create first folder");
        fs::create_dir_all(&second_folder).expect("create second folder");
        fs::write(&first, b"same").expect("write first synthetic file");
        fs::write(&second, b"same").expect("write second synthetic file");

        let manifest = SyntheticDatasetManifestDto {
            schema_version: 1,
            dataset_name: "Synthetic".to_string(),
            root_path: root.to_string_lossy().to_string(),
            created_at_epoch_ms: 0,
            categories: vec![SyntheticDatasetCategory::Videos],
            target_apparent_size_bytes: 4,
            apparent_size_bytes: 4,
            estimated_actual_size_bytes: 4,
            hash_skip_threshold_bytes: 1,
            sparse_file_relative_paths: vec![
                "Media/placeholder.mov".to_string(),
                "Archive/placeholder.mov".to_string(),
            ],
        };
        fs::write(
            root.join(SYNTHETIC_DATASET_MANIFEST_NAME),
            serde_json::to_vec(&manifest).expect("serialize manifest"),
        )
        .expect("write manifest");

        let entries = vec![
            manifest_entry(
                "first",
                &root,
                &first,
                "Media/placeholder.mov",
                "placeholder.mov",
                ManifestEntryKind::File,
                4,
            ),
            manifest_entry(
                "second",
                &root,
                &second,
                "Archive/placeholder.mov",
                "placeholder.mov",
                ManifestEntryKind::File,
                4,
            ),
        ];

        let summary = run_expensive_analysis("job-5", &entries, &[]).expect("expensive analysis");
        assert_eq!(summary.skipped_large_synthetic_files, 2);
        assert!(summary.likely_duplicate_groups.iter().any(|group| {
            group.certainty == DuplicateCertainty::Likely && group.item_count == 2
        }));

        let _ = fs::remove_dir_all(root);
    }

    fn manifest_entry(
        entry_id: &str,
        source_root: &Path,
        path: &Path,
        relative_path: &str,
        name: &str,
        entry_kind: ManifestEntryKind,
        size_bytes: u64,
    ) -> ManifestEntryDto {
        ManifestEntryDto {
            entry_id: entry_id.to_string(),
            job_id: "job".to_string(),
            source_root: source_root.to_string_lossy().to_string(),
            path: path.to_string_lossy().to_string(),
            relative_path: relative_path.to_string(),
            name: name.to_string(),
            entry_kind,
            size_bytes,
            extension: path
                .extension()
                .map(|extension| extension.to_string_lossy().to_string()),
            is_hidden: name.starts_with('.'),
            created_at_epoch_ms: None,
            modified_at_epoch_ms: None,
        }
    }

    fn temp_path(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!("safepath-{label}-{}", Uuid::new_v4()))
    }
}
