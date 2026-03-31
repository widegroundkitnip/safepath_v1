use std::collections::{BTreeMap, BTreeSet};
use std::fs::{self, OpenOptions};
use std::io::{Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::to_vec_pretty;

use crate::types::{
    GenerateSyntheticDatasetRequest, GenerateSyntheticDatasetResultDto, SyntheticCategoryCountDto,
    SyntheticDatasetCategory, SyntheticDatasetManifestDto,
};

pub const SYNTHETIC_DATASET_MANIFEST_NAME: &str = ".safepath-synthetic-dataset.json";
pub const SYNTHETIC_HASH_SKIP_THRESHOLD_BYTES: u64 = 512 * 1024 * 1024;
const SYNTHETIC_DATASET_SCHEMA_VERSION: u32 = 1;

pub fn generate_synthetic_dataset(
    request: &GenerateSyntheticDatasetRequest,
) -> Result<GenerateSyntheticDatasetResultDto, String> {
    let output_root = Path::new(request.output_root.trim());
    if request.output_root.trim().is_empty() {
        return Err("Choose an output root folder for synthetic data.".to_string());
    }
    if !output_root.exists() {
        return Err(format!(
            "Output root `{}` must already exist.",
            output_root.display()
        ));
    }
    if !output_root.is_dir() {
        return Err(format!(
            "Output root `{}` must be a folder.",
            output_root.display()
        ));
    }

    let dataset_name = sanitize_dataset_name(&request.dataset_name)?;
    let categories = normalized_categories(&request.categories);
    if categories.is_empty() {
        return Err("Select at least one file category for the synthetic dataset.".to_string());
    }

    let max_depth = request.max_depth.clamp(1, 6);
    let messiness_level = request.messiness_level.clamp(1, 5);
    let duplicate_rate_percent = request.duplicate_rate_percent.min(80);
    let dataset_root = output_root.join(&dataset_name);
    ensure_dataset_root_is_safe(&dataset_root)?;
    fs::create_dir_all(&dataset_root).map_err(|error| {
        format!(
            "Failed to create synthetic dataset root `{}`: {error}",
            dataset_root.display()
        )
    })?;

    let created_at_epoch_ms = now_epoch_ms();
    let seed = format!(
        "{}|{}|{}|{}|{}|{}",
        request.output_root.trim(),
        dataset_name,
        max_depth,
        messiness_level,
        duplicate_rate_percent,
        request.target_apparent_size_bytes
    );
    let mut rng = DeterministicRng::from_seed(&seed);
    let folder_pool = build_folder_pool(&mut rng, &categories, max_depth, messiness_level);
    let mut summary = GenerationSummary::default();
    summary
        .directory_paths
        .insert(normalize_path(&dataset_root));
    let mut duplicate_candidates = Vec::new();
    let mut sparse_relative_paths = Vec::new();
    let mut category_counts = BTreeMap::new();

    for relative_dir in &folder_pool {
        ensure_directory(&dataset_root.join(relative_dir), &mut summary)?;
    }

    for category in &categories {
        let blueprint = category_blueprint(*category);
        let small_count = (2 + usize::from(messiness_level)) + rng.gen_range_usize(0, 3);
        let medium_count = 1 + rng.gen_range_usize(0, usize::from(messiness_level));

        for _ in 0..small_count {
            let path = choose_relative_file_path(
                &mut rng,
                &dataset_root,
                &folder_pool,
                &blueprint,
                max_depth,
                false,
            )?;
            let size = rng.gen_range_u64(1_024, 48_000);
            let bytes_written = write_real_file(
                &path,
                &synthetic_bytes(&mut rng, &blueprint, &path, size),
                &mut summary,
            )?;
            let relative_path = relative_to_root(&dataset_root, &path)?;
            summary.register_file(size, bytes_written);
            *category_counts.entry(*category).or_insert(0_u64) += 1;
            duplicate_candidates.push(DuplicateCandidate {
                category: *category,
                source_path: path,
                relative_path,
            });
        }

        for _ in 0..medium_count {
            let path = choose_relative_file_path(
                &mut rng,
                &dataset_root,
                &folder_pool,
                &blueprint,
                max_depth,
                false,
            )?;
            let size = rng.gen_range_u64(96_000, 1_400_000);
            let bytes_written = write_real_file(
                &path,
                &synthetic_bytes(&mut rng, &blueprint, &path, size),
                &mut summary,
            )?;
            let relative_path = relative_to_root(&dataset_root, &path)?;
            summary.register_file(size, bytes_written);
            *category_counts.entry(*category).or_insert(0_u64) += 1;
            duplicate_candidates.push(DuplicateCandidate {
                category: *category,
                source_path: path,
                relative_path,
            });
        }
    }

    if request.include_hidden_files {
        for hidden_name in [".DS_Store", ".localized", ".thumb-cache", ".pending-sort"] {
            let folder = choose_existing_folder(&mut rng, &folder_pool);
            let path = dataset_root.join(folder).join(hidden_name);
            let bytes_written =
                write_real_file(&path, &hidden_file_bytes(hidden_name), &mut summary)?;
            summary.register_file(bytes_written, bytes_written);
            *category_counts
                .entry(SyntheticDatasetCategory::MixedClutter)
                .or_insert(0_u64) += 1;
        }
    }

    if request.include_empty_folders {
        let empty_target = 2 + usize::from(messiness_level);
        for index in 0..empty_target {
            let folder = dataset_root
                .join("To Sort")
                .join(format!("empty-folder-{}", index + 1));
            ensure_directory(&folder, &mut summary)?;
        }
    }

    let sparse_capable_categories = categories
        .iter()
        .copied()
        .filter(supports_sparse_placeholders)
        .collect::<Vec<_>>();
    let mut remaining_sparse_budget = request.target_apparent_size_bytes;
    if !sparse_capable_categories.is_empty() && remaining_sparse_budget > 0 {
        let placeholder_target = sparse_placeholder_target(remaining_sparse_budget);
        for index in 0..placeholder_target {
            if remaining_sparse_budget == 0 {
                break;
            }
            let category = sparse_capable_categories[index % sparse_capable_categories.len()];
            let blueprint = category_blueprint(category);
            let path = choose_relative_file_path(
                &mut rng,
                &dataset_root,
                &folder_pool,
                &blueprint,
                max_depth,
                true,
            )?;
            let apparent_size = choose_sparse_size_for_category(
                &mut rng,
                category,
                remaining_sparse_budget,
                index + 1 == placeholder_target,
            );
            let bytes_written = write_sparse_file(
                &path,
                sparse_file_header(category, apparent_size),
                apparent_size,
                &mut summary,
            )?;
            let relative_path = relative_to_root(&dataset_root, &path)?;
            sparse_relative_paths.push(relative_path.clone());
            summary.sparse_file_count += 1;
            summary.register_file(apparent_size, bytes_written);
            *category_counts.entry(category).or_insert(0_u64) += 1;
            remaining_sparse_budget = remaining_sparse_budget.saturating_sub(apparent_size);
        }
    }

    let duplicate_count = (duplicate_candidates.len() * usize::from(duplicate_rate_percent)) / 100;
    for candidate in duplicate_candidates
        .iter()
        .take(duplicate_count.min(duplicate_candidates.len()))
    {
        let blueprint = category_blueprint(candidate.category);
        let path = choose_relative_file_path(
            &mut rng,
            &dataset_root,
            &folder_pool,
            &blueprint,
            max_depth,
            false,
        )?;
        let source_name = Path::new(&candidate.relative_path)
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| "Synthetic duplicate source had an invalid file name.".to_string())?;
        let duplicate_path = path.with_file_name(source_name);
        if duplicate_path == candidate.source_path {
            continue;
        }
        ensure_parent_directory(&duplicate_path, &mut summary)?;
        let copied = fs::copy(&candidate.source_path, &duplicate_path).map_err(|error| {
            format!(
                "Failed to create duplicate file `{}`: {error}",
                duplicate_path.display()
            )
        })?;
        summary.register_file(copied, copied);
        *category_counts.entry(candidate.category).or_insert(0_u64) += 1;
    }

    let manifest = SyntheticDatasetManifestDto {
        schema_version: SYNTHETIC_DATASET_SCHEMA_VERSION,
        dataset_name: dataset_name.clone(),
        root_path: normalize_path(&dataset_root),
        created_at_epoch_ms,
        categories: categories.clone(),
        target_apparent_size_bytes: request.target_apparent_size_bytes,
        apparent_size_bytes: summary.apparent_size_bytes,
        estimated_actual_size_bytes: summary.estimated_actual_size_bytes,
        hash_skip_threshold_bytes: SYNTHETIC_HASH_SKIP_THRESHOLD_BYTES,
        sparse_file_relative_paths: sparse_relative_paths.clone(),
    };
    let manifest_path = dataset_root.join(SYNTHETIC_DATASET_MANIFEST_NAME);
    let manifest_bytes = to_vec_pretty(&manifest).map_err(|error| error.to_string())?;
    let written_manifest_bytes = write_real_file(&manifest_path, &manifest_bytes, &mut summary)?;
    summary.register_file(written_manifest_bytes, written_manifest_bytes);

    let mut warnings = Vec::new();
    if summary.sparse_file_count > 0 {
        warnings.push(format!(
            "{} large synthetic placeholder file(s) will be skipped by expensive duplicate hashing above {}.",
            summary.sparse_file_count,
            human_size(SYNTHETIC_HASH_SKIP_THRESHOLD_BYTES)
        ));
    }
    warnings.push(
        "Synthetic large placeholders are safe for scan and planning tests, but execution can still copy their full logical size."
            .to_string(),
    );

    Ok(GenerateSyntheticDatasetResultDto {
        dataset_name,
        root_path: normalize_path(&dataset_root),
        manifest_path: normalize_path(&manifest_path),
        created_at_epoch_ms,
        file_count: summary.file_count,
        directory_count: summary.directory_paths.len() as u64,
        sparse_file_count: summary.sparse_file_count,
        apparent_size_bytes: summary.apparent_size_bytes,
        estimated_actual_size_bytes: summary.estimated_actual_size_bytes,
        hash_skip_threshold_bytes: SYNTHETIC_HASH_SKIP_THRESHOLD_BYTES,
        category_counts: category_counts
            .into_iter()
            .map(|(category, count)| SyntheticCategoryCountDto { category, count })
            .collect(),
        warnings,
    })
}

fn ensure_dataset_root_is_safe(dataset_root: &Path) -> Result<(), String> {
    if dataset_root.exists() {
        if !dataset_root.is_dir() {
            return Err(format!(
                "Synthetic dataset target `{}` already exists and is not a folder.",
                dataset_root.display()
            ));
        }

        let mut entries = fs::read_dir(dataset_root)
            .map_err(|error| format!("Failed to inspect `{}`: {error}", dataset_root.display()))?;
        if entries.next().is_some() {
            return Err(format!(
                "Synthetic dataset target `{}` already exists and is not empty.",
                dataset_root.display()
            ));
        }
    }

    Ok(())
}

fn sanitize_dataset_name(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("Enter a dataset name.".to_string());
    }
    if trimmed.contains('/') || trimmed.contains('\\') {
        return Err("Dataset name cannot contain path separators.".to_string());
    }

    Ok(trimmed.to_string())
}

fn normalized_categories(categories: &[SyntheticDatasetCategory]) -> Vec<SyntheticDatasetCategory> {
    let mut seen = BTreeSet::new();
    categories
        .iter()
        .copied()
        .filter(|category| seen.insert(*category))
        .collect()
}

fn build_folder_pool(
    rng: &mut DeterministicRng,
    categories: &[SyntheticDatasetCategory],
    max_depth: u8,
    messiness_level: u8,
) -> Vec<PathBuf> {
    let top_levels = [
        "Downloads",
        "Desktop",
        "Projects",
        "Photos",
        "Media",
        "Old Backups",
        "To Sort",
        "Incoming",
        "External Drive Dump",
    ];
    let subfolders = [
        "2024",
        "2025",
        "Archive",
        "Phone Imports",
        "Final",
        "Final FINAL",
        "Exports",
        "Sorted Later",
        "Temp",
        "Recovered",
        "Needs Review",
        "Client Work",
        "Family",
        "Unsorted",
        "From Laptop",
        "SD Card 03",
        "Dropbox Old",
    ];

    let folder_target = 8 + usize::from(messiness_level) * 4 + categories.len();
    let mut folders = BTreeSet::new();
    for _ in 0..folder_target {
        let depth = 1 + rng.gen_range_usize(0, usize::from(max_depth));
        let mut relative = PathBuf::new();
        relative.push(top_levels[rng.gen_range_usize(0, top_levels.len())]);
        for _ in 1..depth {
            relative.push(subfolders[rng.gen_range_usize(0, subfolders.len())]);
        }
        folders.insert(relative);
    }

    folders.into_iter().collect()
}

fn choose_relative_file_path(
    rng: &mut DeterministicRng,
    dataset_root: &Path,
    folder_pool: &[PathBuf],
    blueprint: &CategoryBlueprint,
    max_depth: u8,
    prefer_large_names: bool,
) -> Result<PathBuf, String> {
    let folder = if folder_pool.is_empty() {
        PathBuf::from("To Sort")
    } else {
        let base = &folder_pool[rng.gen_range_usize(0, folder_pool.len())];
        let mut folder = base.clone();
        if base.components().count() < usize::from(max_depth) && rng.gen_bool(35) {
            folder.push(
                blueprint.folder_segments[rng.gen_range_usize(0, blueprint.folder_segments.len())],
            );
        }
        folder
    };

    let extension = blueprint.extensions[rng.gen_range_usize(0, blueprint.extensions.len())];
    let prefix = if prefer_large_names {
        blueprint.large_names[rng.gen_range_usize(0, blueprint.large_names.len())]
    } else {
        blueprint.file_names[rng.gen_range_usize(0, blueprint.file_names.len())]
    };
    let suffix = rng.gen_range_usize(1, 9_999);
    let filename = format!("{prefix} {suffix}.{extension}");
    Ok(dataset_root.join(folder).join(filename))
}

fn choose_existing_folder(rng: &mut DeterministicRng, folder_pool: &[PathBuf]) -> PathBuf {
    if folder_pool.is_empty() {
        PathBuf::from("To Sort")
    } else {
        folder_pool[rng.gen_range_usize(0, folder_pool.len())].clone()
    }
}

fn write_real_file(
    path: &Path,
    bytes: &[u8],
    summary: &mut GenerationSummary,
) -> Result<u64, String> {
    ensure_parent_directory(path, summary)?;
    fs::write(path, bytes).map_err(|error| {
        format!(
            "Failed to write synthetic file `{}`: {error}",
            path.display()
        )
    })?;
    Ok(bytes.len() as u64)
}

fn write_sparse_file(
    path: &Path,
    header: Vec<u8>,
    apparent_size_bytes: u64,
    summary: &mut GenerationSummary,
) -> Result<u64, String> {
    ensure_parent_directory(path, summary)?;
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|error| format!("Failed to create sparse file `{}`: {error}", path.display()))?;

    let mut written = 0_u64;
    if !header.is_empty() {
        file.write_all(&header).map_err(|error| {
            format!(
                "Failed to write sparse file header `{}`: {error}",
                path.display()
            )
        })?;
        written += header.len() as u64;
    }

    file.set_len(apparent_size_bytes).map_err(|error| {
        format!(
            "Failed to set sparse file length `{}`: {error}",
            path.display()
        )
    })?;

    if apparent_size_bytes > 0 {
        file.seek(SeekFrom::Start(apparent_size_bytes.saturating_sub(1)))
            .map_err(|error| format!("Failed to seek sparse file `{}`: {error}", path.display()))?;
        file.write_all(&[0]).map_err(|error| {
            format!(
                "Failed to finalize sparse file `{}`: {error}",
                path.display()
            )
        })?;
        written += 1;
    }

    Ok(written)
}

fn ensure_directory(path: &Path, summary: &mut GenerationSummary) -> Result<(), String> {
    fs::create_dir_all(path)
        .map_err(|error| format!("Failed to create directory `{}`: {error}", path.display()))?;
    summary.directory_paths.insert(normalize_path(path));
    Ok(())
}

fn ensure_parent_directory(path: &Path, summary: &mut GenerationSummary) -> Result<(), String> {
    let Some(parent) = path.parent() else {
        return Ok(());
    };
    fs::create_dir_all(parent)
        .map_err(|error| format!("Failed to create directory `{}`: {error}", parent.display()))?;
    summary.directory_paths.insert(normalize_path(parent));
    Ok(())
}

fn relative_to_root(root: &Path, path: &Path) -> Result<String, String> {
    path.strip_prefix(root).map(normalize_path).map_err(|_| {
        format!(
            "Failed to compute synthetic path relative to `{}`.",
            root.display()
        )
    })
}

fn normalize_path(path: impl AsRef<Path>) -> String {
    path.as_ref().to_string_lossy().replace('\\', "/")
}

fn synthetic_bytes(
    rng: &mut DeterministicRng,
    blueprint: &CategoryBlueprint,
    path: &Path,
    size: u64,
) -> Vec<u8> {
    let mut bytes = blueprint.header.to_vec();
    let metadata = format!(
        "\nSynthetic placeholder for {}\nGenerated by Safepath test data.\n",
        path.file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("unknown-file")
    );
    bytes.extend_from_slice(metadata.as_bytes());
    while bytes.len() < size as usize {
        bytes.push(rng.gen_range_u64(32, 126) as u8);
    }
    bytes.truncate(size as usize);
    bytes
}

fn hidden_file_bytes(name: &str) -> Vec<u8> {
    format!("Synthetic hidden artifact: {name}\n").into_bytes()
}

fn sparse_file_header(category: SyntheticDatasetCategory, apparent_size_bytes: u64) -> Vec<u8> {
    let label = format!(
        "Synthetic sparse {:?} placeholder, apparent size {}.\n",
        category,
        human_size(apparent_size_bytes)
    );
    match category {
        SyntheticDatasetCategory::Videos => {
            let mut bytes = b"\0\0\0\x18ftypisom".to_vec();
            bytes.extend_from_slice(label.as_bytes());
            bytes
        }
        SyntheticDatasetCategory::Archives => {
            let mut bytes = b"PK\x03\x04".to_vec();
            bytes.extend_from_slice(label.as_bytes());
            bytes
        }
        SyntheticDatasetCategory::RawImages => {
            let mut bytes = b"II*\0".to_vec();
            bytes.extend_from_slice(label.as_bytes());
            bytes
        }
        SyntheticDatasetCategory::Audio => {
            let mut bytes = b"ID3".to_vec();
            bytes.extend_from_slice(label.as_bytes());
            bytes
        }
        _ => label.into_bytes(),
    }
}

fn supports_sparse_placeholders(category: &SyntheticDatasetCategory) -> bool {
    matches!(
        category,
        SyntheticDatasetCategory::Videos
            | SyntheticDatasetCategory::Archives
            | SyntheticDatasetCategory::RawImages
            | SyntheticDatasetCategory::Audio
            | SyntheticDatasetCategory::MixedClutter
    )
}

fn sparse_placeholder_target(target_apparent_size_bytes: u64) -> usize {
    if target_apparent_size_bytes >= 5 * 1024 * 1024 * 1024 * 1024 {
        8
    } else if target_apparent_size_bytes >= 1 * 1024 * 1024 * 1024 * 1024 {
        6
    } else if target_apparent_size_bytes >= 100 * 1024 * 1024 * 1024 {
        4
    } else {
        2
    }
}

fn choose_sparse_size_for_category(
    rng: &mut DeterministicRng,
    category: SyntheticDatasetCategory,
    remaining_bytes: u64,
    final_slot: bool,
) -> u64 {
    if final_slot {
        return remaining_bytes.max(1);
    }

    let options = match category {
        SyntheticDatasetCategory::Videos => {
            &[gib(4), gib(18), gib(90), gib(350), tib(1), tib(2)][..]
        }
        SyntheticDatasetCategory::Archives => &[gib(2), gib(14), gib(60), gib(240), tib(1)][..],
        SyntheticDatasetCategory::RawImages => &[gib(1), gib(8), gib(32), gib(96), gib(220)][..],
        SyntheticDatasetCategory::Audio => &[gib(1), gib(6), gib(18), gib(42)][..],
        _ => &[gib(1), gib(10), gib(40), gib(120)][..],
    };

    let candidates = options
        .iter()
        .copied()
        .filter(|size| *size <= remaining_bytes)
        .collect::<Vec<_>>();
    if candidates.is_empty() {
        remaining_bytes.max(1)
    } else {
        candidates[rng.gen_range_usize(0, candidates.len())]
    }
}

fn category_blueprint(category: SyntheticDatasetCategory) -> CategoryBlueprint<'static> {
    match category {
        SyntheticDatasetCategory::Documents => CategoryBlueprint {
            folder_segments: &["Notes", "Letters", "Reports", "Meeting Notes"],
            file_names: &[
                "Project Notes",
                "Draft",
                "Meeting Notes",
                "Reference Copy",
                "Final",
            ],
            large_names: &["Reference Export"],
            extensions: &["txt", "md", "docx", "pages", "rtf"],
            header: b"Synthetic document\n",
        },
        SyntheticDatasetCategory::Pdfs => CategoryBlueprint {
            folder_segments: &["Invoices", "Manuals", "Scans", "Reports"],
            file_names: &["Invoice", "Manual", "Scanned Notes", "Report", "Statement"],
            large_names: &["Merged Scan"],
            extensions: &["pdf"],
            header: b"%PDF-1.7\n",
        },
        SyntheticDatasetCategory::Spreadsheets => CategoryBlueprint {
            folder_segments: &["Budgets", "Exports", "Finance", "Tracking"],
            file_names: &["Budget", "Expense Export", "Tracking Sheet", "Inventory"],
            large_names: &["Quarterly Export"],
            extensions: &["csv", "xlsx", "numbers"],
            header: b"Synthetic spreadsheet\n",
        },
        SyntheticDatasetCategory::Images => CategoryBlueprint {
            folder_segments: &["JPEGs", "Edits", "Phone Shots", "Screenshots"],
            file_names: &["IMG", "Edited Photo", "Screenshot", "Cover Shot"],
            large_names: &["Photo Batch"],
            extensions: &["jpg", "jpeg", "png", "webp"],
            header: &[0xFF, 0xD8, 0xFF, 0xE0],
        },
        SyntheticDatasetCategory::RawImages => CategoryBlueprint {
            folder_segments: &["RAW", "Camera Backup", "Unedited", "Selects"],
            file_names: &["DSC", "Capture", "Camera Roll", "Shoot"],
            large_names: &["Camera Backup"],
            extensions: &["cr2", "nef", "arw", "dng"],
            header: b"II*\0",
        },
        SyntheticDatasetCategory::Videos => CategoryBlueprint {
            folder_segments: &["Footage", "Exports", "Edits", "Phone Videos"],
            file_names: &["Clip", "Sequence", "Take", "Export", "Vlog"],
            large_names: &["Master Export", "Interview Backup", "Event Footage"],
            extensions: &["mov", "mp4", "mkv", "mxf"],
            header: b"\0\0\0\x18ftypisom",
        },
        SyntheticDatasetCategory::Archives => CategoryBlueprint {
            folder_segments: &["Backups", "Archives", "Compressed", "Deliverables"],
            file_names: &["Backup", "Archive", "Bundle", "Deliverable"],
            large_names: &["Full Backup", "Cold Archive", "Migration Package"],
            extensions: &["zip", "7z", "rar", "tar"],
            header: b"PK\x03\x04",
        },
        SyntheticDatasetCategory::Audio => CategoryBlueprint {
            folder_segments: &["Voice Memos", "Music", "Mixes", "Masters"],
            file_names: &["Memo", "Mix", "Track", "Master"],
            large_names: &["Session Audio", "Long Recording"],
            extensions: &["wav", "mp3", "flac", "m4a"],
            header: b"ID3",
        },
        SyntheticDatasetCategory::CodeProjects => CategoryBlueprint {
            folder_segments: &["Repos", "Experiments", "Scripts", "Exports"],
            file_names: &["app", "index", "server", "config", "draft-script"],
            large_names: &["bundle"],
            extensions: &["ts", "tsx", "rs", "json", "toml", "md", "py"],
            header: b"// synthetic code file\n",
        },
        SyntheticDatasetCategory::MixedClutter => CategoryBlueprint {
            folder_segments: &["Misc", "Random", "To Sort", "Recovered"],
            file_names: &["untitled", "final", "final final", "copy", "new file"],
            large_names: &["disk-image", "old-export"],
            extensions: &["txt", "json", "pkg", "dmg", "zip", "jpg"],
            header: b"Synthetic clutter\n",
        },
    }
}

fn human_size(bytes: u64) -> String {
    let units = ["B", "KB", "MB", "GB", "TB"];
    let mut size = bytes as f64;
    let mut index = 0;
    while size >= 1024.0 && index < units.len() - 1 {
        size /= 1024.0;
        index += 1;
    }
    format!("{size:.1} {}", units[index])
}

fn now_epoch_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn gib(value: u64) -> u64 {
    value * 1024 * 1024 * 1024
}

fn tib(value: u64) -> u64 {
    value * 1024 * 1024 * 1024 * 1024
}

#[derive(Debug, Default)]
struct GenerationSummary {
    file_count: u64,
    sparse_file_count: u64,
    apparent_size_bytes: u64,
    estimated_actual_size_bytes: u64,
    directory_paths: BTreeSet<String>,
}

impl GenerationSummary {
    fn register_file(&mut self, apparent_size_bytes: u64, estimated_actual_size_bytes: u64) {
        self.file_count += 1;
        self.apparent_size_bytes = self.apparent_size_bytes.saturating_add(apparent_size_bytes);
        self.estimated_actual_size_bytes = self
            .estimated_actual_size_bytes
            .saturating_add(estimated_actual_size_bytes);
    }
}

#[derive(Debug)]
struct DuplicateCandidate {
    category: SyntheticDatasetCategory,
    source_path: PathBuf,
    relative_path: String,
}

#[derive(Clone, Copy)]
struct CategoryBlueprint<'a> {
    folder_segments: &'a [&'a str],
    file_names: &'a [&'a str],
    large_names: &'a [&'a str],
    extensions: &'a [&'a str],
    header: &'a [u8],
}

struct DeterministicRng {
    state: u64,
}

impl DeterministicRng {
    fn from_seed(seed: &str) -> Self {
        let hash = blake3::hash(seed.as_bytes());
        let mut seed_bytes = [0_u8; 8];
        seed_bytes.copy_from_slice(&hash.as_bytes()[..8]);
        let mut state = u64::from_le_bytes(seed_bytes);
        if state == 0 {
            state = 0x9E37_79B9_7F4A_7C15;
        }
        Self { state }
    }

    fn next_u64(&mut self) -> u64 {
        self.state ^= self.state >> 12;
        self.state ^= self.state << 25;
        self.state ^= self.state >> 27;
        self.state = self.state.wrapping_mul(0x2545_F491_4F6C_DD1D);
        self.state
    }

    fn gen_range_u64(&mut self, min: u64, max_inclusive: u64) -> u64 {
        if min >= max_inclusive {
            return min;
        }
        let span = max_inclusive - min + 1;
        min + (self.next_u64() % span)
    }

    fn gen_range_usize(&mut self, min: usize, max_exclusive: usize) -> usize {
        if min >= max_exclusive {
            return min;
        }
        min + (self.next_u64() as usize % (max_exclusive - min))
    }

    fn gen_bool(&mut self, true_percent: u64) -> bool {
        self.gen_range_u64(0, 99) < true_percent.min(100)
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;

    use super::{
        generate_synthetic_dataset, gib, tib, SYNTHETIC_DATASET_MANIFEST_NAME,
        SYNTHETIC_HASH_SKIP_THRESHOLD_BYTES,
    };
    use crate::types::{GenerateSyntheticDatasetRequest, SyntheticDatasetCategory};

    #[test]
    fn generates_sparse_heavy_dataset_with_manifest() {
        let output_root = temp_dir("synthetic-data");
        fs::create_dir_all(&output_root).expect("create output root");
        let request = GenerateSyntheticDatasetRequest {
            output_root: output_root.to_string_lossy().to_string(),
            dataset_name: "QA Synthetic".to_string(),
            categories: vec![
                SyntheticDatasetCategory::Pdfs,
                SyntheticDatasetCategory::Images,
                SyntheticDatasetCategory::RawImages,
                SyntheticDatasetCategory::Videos,
                SyntheticDatasetCategory::Archives,
            ],
            max_depth: 4,
            messiness_level: 4,
            duplicate_rate_percent: 20,
            include_hidden_files: true,
            include_empty_folders: true,
            target_apparent_size_bytes: tib(1),
        };

        let result = generate_synthetic_dataset(&request).expect("generate dataset");
        let dataset_root = output_root.join("QA Synthetic");
        let manifest_path = dataset_root.join(SYNTHETIC_DATASET_MANIFEST_NAME);

        assert!(dataset_root.exists());
        assert!(manifest_path.exists());
        assert!(result.apparent_size_bytes >= gib(1));
        assert!(result.estimated_actual_size_bytes < result.apparent_size_bytes);
        assert!(result.sparse_file_count > 0);
        assert_eq!(
            result.hash_skip_threshold_bytes,
            SYNTHETIC_HASH_SKIP_THRESHOLD_BYTES
        );

        let _ = fs::remove_dir_all(output_root);
    }

    #[test]
    fn rejects_non_empty_dataset_target() {
        let output_root = temp_dir("synthetic-data-non-empty");
        let dataset_root = output_root.join("Existing Dataset");
        fs::create_dir_all(&dataset_root).expect("create existing dataset");
        fs::write(dataset_root.join("already-here.txt"), b"present").expect("seed existing file");

        let request = GenerateSyntheticDatasetRequest {
            output_root: output_root.to_string_lossy().to_string(),
            dataset_name: "Existing Dataset".to_string(),
            categories: vec![SyntheticDatasetCategory::Documents],
            max_depth: 2,
            messiness_level: 2,
            duplicate_rate_percent: 10,
            include_hidden_files: false,
            include_empty_folders: false,
            target_apparent_size_bytes: 0,
        };

        let error = generate_synthetic_dataset(&request).expect_err("expected rejection");
        assert!(error.contains("not empty"));

        let _ = fs::remove_dir_all(output_root);
    }

    fn temp_dir(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("{name}-{}", uuid::Uuid::new_v4()))
    }
}
