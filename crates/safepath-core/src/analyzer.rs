use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};

use uuid::Uuid;

use crate::test_data::SYNTHETIC_DATASET_MANIFEST_NAME;
use crate::types::{
    AiAssistedSuggestionDto, AiAssistedSuggestionKind, AnalysisSummaryDto, BoundaryKind,
    CategoryCountDto, DuplicateCertainty, DuplicateGroupDto, DuplicateMemberDto, FileCategory,
    ManifestEntryDto, ManifestEntryKind, ProtectionDetectionDto, ProtectionOverrideDto,
    ProtectionOverrideKind, ProtectionState, SourceProfileKind, StructureSignalDto,
    StructureSignalKind, SyntheticDatasetManifestDto,
};

#[derive(Debug, Clone)]
struct StructureIntelligenceInputs {
    total_files: u64,
    image_files: u64,
    video_files: u64,
    archive_files: u64,
    code_files: u64,
    unknown_files: u64,
    no_extension_count: u64,
    root_file_count: u64,
    max_depth: usize,
    hidden_entries: u64,
    mixed_content_detected: bool,
    marker_folder_count: usize,
    source_roots: Vec<String>,
}

#[derive(Debug, Clone)]
struct StructureProfileMatch {
    kind: SourceProfileKind,
    score: u8,
    confidence: f32,
    reasons: Vec<String>,
}

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
    let mut source_roots = BTreeSet::new();
    let mut total_files = 0_u64;

    for entry in entries {
        source_roots.insert(entry.source_root.clone());
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
            total_files += 1;
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

    let mixed_content_detected = folder_categories
        .values()
        .any(|categories| categories.len() >= 4);
    if mixed_content_detected {
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

    let marker_folder_count = markers_by_parent.len();
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

    let ai_assisted_suggestions = build_ai_assisted_suggestions(
        &StructureIntelligenceInputs {
            total_files,
            image_files: category_total(&category_counts, FileCategory::Image),
            video_files: category_total(&category_counts, FileCategory::Video),
            archive_files: category_total(&category_counts, FileCategory::Archive),
            code_files: category_total(&category_counts, FileCategory::Code),
            unknown_files: unknown_count,
            no_extension_count,
            root_file_count,
            max_depth,
            hidden_entries,
            mixed_content_detected,
            marker_folder_count,
            source_roots: source_roots.into_iter().collect(),
        },
        &detected_protections,
        protection_overrides,
    );

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
        ai_assisted_suggestions,
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

fn build_ai_assisted_suggestions(
    inputs: &StructureIntelligenceInputs,
    detected_protections: &[ProtectionDetectionDto],
    protection_overrides: &[ProtectionOverrideDto],
) -> Vec<AiAssistedSuggestionDto> {
    let mut suggestions = Vec::new();
    let profile = best_structure_profile(inputs, detected_protections);

    if let Some(profile) = profile.as_ref() {
        suggestions.push(AiAssistedSuggestionDto {
            suggestion_id: format!("structure-profile-{}", structure_profile_slug(profile.kind)),
            kind: AiAssistedSuggestionKind::SourceProfile,
            title: structure_profile_title(profile.kind).to_string(),
            summary: structure_profile_summary(profile.kind).to_string(),
            confidence: profile.confidence,
            reasons: profile.reasons.clone(),
            source_profile_kind: Some(profile.kind),
            suggested_preset_id: None,
            suggested_protection_path: None,
            suggested_protection_kind: None,
        });

        if let Some((preset_id, preset_name, summary)) =
            suggested_preset_for_source_profile(profile.kind)
        {
            suggestions.push(AiAssistedSuggestionDto {
                suggestion_id: format!("suggested-preset-{preset_id}"),
                kind: AiAssistedSuggestionKind::PresetRecommendation,
                title: format!("Suggested preset: {preset_name}"),
                summary: summary.to_string(),
                confidence: (profile.confidence - 0.03).max(0.55),
                reasons: profile.reasons.clone(),
                source_profile_kind: Some(profile.kind),
                suggested_preset_id: Some(preset_id.to_string()),
                suggested_protection_path: None,
                suggested_protection_kind: None,
            });
        }
    }

    if let Some(protection_suggestion) = build_protection_suggestion(
        inputs,
        detected_protections,
        protection_overrides,
        profile.as_ref(),
    ) {
        suggestions.push(protection_suggestion);
    }

    suggestions.sort_by(|left, right| {
        right
            .confidence
            .partial_cmp(&left.confidence)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    suggestions
}

fn best_structure_profile(
    inputs: &StructureIntelligenceInputs,
    detected_protections: &[ProtectionDetectionDto],
) -> Option<StructureProfileMatch> {
    let candidates = vec![
        score_workspace_profile(inputs, detected_protections),
        score_media_import_profile(inputs),
        score_downloads_profile(inputs),
        score_archive_bundle_profile(inputs),
    ];

    candidates
        .into_iter()
        .flatten()
        .max_by(|left, right| left.score.cmp(&right.score))
}

fn score_workspace_profile(
    inputs: &StructureIntelligenceInputs,
    detected_protections: &[ProtectionDetectionDto],
) -> Option<StructureProfileMatch> {
    let mut score = 0_u8;
    let mut reasons = Vec::new();

    if !detected_protections.is_empty() {
        score += 4;
        reasons.push("Project or workspace markers were detected.".to_string());
    }
    if inputs.code_files >= 5 {
        score += 2;
        reasons.push(format!(
            "{} code/project files were detected.",
            inputs.code_files
        ));
    }
    if inputs.max_depth >= 5 {
        score += 1;
        reasons.push(
            "The folder depth looks more like a nested workspace than a loose inbox.".to_string(),
        );
    }
    if inputs.root_file_count <= 10 && inputs.total_files >= 8 {
        score += 1;
        reasons.push(
            "Most files sit inside nested folders instead of directly in the source root."
                .to_string(),
        );
    }

    structure_profile_match(SourceProfileKind::Workspace, score, 4, reasons)
}

fn score_media_import_profile(
    inputs: &StructureIntelligenceInputs,
) -> Option<StructureProfileMatch> {
    let media_files = inputs.image_files + inputs.video_files;
    let mut score = 0_u8;
    let mut reasons = Vec::new();

    if inputs.total_files >= 8 && media_files * 100 >= inputs.total_files * 70 {
        score += 4;
        reasons.push(format!(
            "{} of {} files look like photos or videos.",
            media_files, inputs.total_files
        ));
    }
    if inputs.code_files == 0 {
        score += 1;
        reasons.push("No code/project files were detected in the scan.".to_string());
    }
    if inputs.root_file_count >= 5 {
        score += 1;
        reasons.push("Several media files sit directly in the source root, which often means a fresh import batch.".to_string());
    }

    structure_profile_match(SourceProfileKind::MediaImport, score, 4, reasons)
}

fn score_downloads_profile(inputs: &StructureIntelligenceInputs) -> Option<StructureProfileMatch> {
    let diverse_categories = [
        inputs.image_files > 0,
        inputs.video_files > 0,
        inputs.archive_files > 0,
        inputs.code_files > 0,
        inputs.unknown_files > 0,
    ]
    .into_iter()
    .filter(|present| *present)
    .count();
    let mut score = 0_u8;
    let mut reasons = Vec::new();

    if inputs.root_file_count >= 15 {
        score += 3;
        reasons.push(format!(
            "{} loose files sit directly in the source root.",
            inputs.root_file_count
        ));
    }
    if inputs.mixed_content_detected {
        score += 2;
        reasons.push("At least one folder mixes many file categories.".to_string());
    }
    if inputs.unknown_files + inputs.no_extension_count >= 3 {
        score += 1;
        reasons.push(
            "Unknown files and no-extension leftovers suggest an inbox-style folder.".to_string(),
        );
    }
    if inputs.marker_folder_count == 0 {
        score += 1;
        reasons.push("No strong project markers were detected.".to_string());
    }
    if diverse_categories >= 4 {
        score += 1;
        reasons.push(
            "The scan mixes several distinct file types instead of one dominant media shape."
                .to_string(),
        );
    }

    structure_profile_match(SourceProfileKind::DownloadsInbox, score, 5, reasons)
}

fn score_archive_bundle_profile(
    inputs: &StructureIntelligenceInputs,
) -> Option<StructureProfileMatch> {
    let mut score = 0_u8;
    let mut reasons = Vec::new();

    if inputs.total_files >= 5 && inputs.archive_files * 100 >= inputs.total_files * 35 {
        score += 4;
        reasons.push(format!(
            "{} of {} files look like archives or packaged bundles.",
            inputs.archive_files, inputs.total_files
        ));
    }
    if inputs.root_file_count >= 5 {
        score += 1;
        reasons.push("Many archive files sit directly in the source root.".to_string());
    }
    if inputs.hidden_entries == 0 {
        score += 1;
        reasons.push(
            "The scan looks more like exported or packaged files than a working project tree."
                .to_string(),
        );
    }

    structure_profile_match(SourceProfileKind::ArchiveBundle, score, 4, reasons)
}

fn structure_profile_match(
    kind: SourceProfileKind,
    score: u8,
    threshold: u8,
    reasons: Vec<String>,
) -> Option<StructureProfileMatch> {
    if score < threshold {
        return None;
    }

    Some(StructureProfileMatch {
        kind,
        score,
        confidence: (0.58 + f32::from(score.saturating_sub(threshold)) * 0.08).min(0.92),
        reasons,
    })
}

fn build_protection_suggestion(
    inputs: &StructureIntelligenceInputs,
    detected_protections: &[ProtectionDetectionDto],
    protection_overrides: &[ProtectionOverrideDto],
    profile: Option<&StructureProfileMatch>,
) -> Option<AiAssistedSuggestionDto> {
    let overridden_paths = protection_overrides
        .iter()
        .map(|override_item| override_item.path.clone())
        .collect::<HashSet<_>>();

    if inputs.source_roots.len() == 1 && detected_protections.len() >= 2 {
        let source_root = inputs.source_roots[0].clone();
        if overridden_paths.contains(&source_root) {
            return None;
        }

        return Some(AiAssistedSuggestionDto {
            suggestion_id: "suggested-parent-boundary".to_string(),
            kind: AiAssistedSuggestionKind::ProtectionRecommendation,
            title: "Suggested parent boundary".to_string(),
            summary:
                "Several structured subfolders were detected under the same source root. Consider preserving the source root as a parent boundary before broad moves."
                    .to_string(),
            confidence: 0.84,
            reasons: vec![
                format!(
                    "{} likely protected subfolders were detected beneath the same source root.",
                    detected_protections.len()
                ),
                "A parent boundary can reduce accidental cross-project moves.".to_string(),
            ],
            source_profile_kind: None,
            suggested_preset_id: None,
            suggested_protection_path: Some(source_root),
            suggested_protection_kind: Some(ProtectionOverrideKind::ParentFolder),
        });
    }

    let top_detection = detected_protections
        .iter()
        .filter(|detection| !overridden_paths.contains(&detection.path))
        .max_by(|left, right| {
            left.confidence
                .unwrap_or_default()
                .partial_cmp(&right.confidence.unwrap_or_default())
                .unwrap_or(std::cmp::Ordering::Equal)
        })?;

    if profile.is_some_and(|item| item.kind == SourceProfileKind::Workspace)
        || top_detection.state == ProtectionState::AutoDetectedHigh
    {
        return Some(AiAssistedSuggestionDto {
            suggestion_id: format!(
                "suggested-protection-{}",
                normalize_path(&top_detection.path)
            ),
            kind: AiAssistedSuggestionKind::ProtectionRecommendation,
            title: "Suggested protection review".to_string(),
            summary:
                "Safepath thinks this path should stay protected before broader organization moves."
                    .to_string(),
            confidence: top_detection.confidence.unwrap_or(0.72),
            reasons: top_detection.reasons.clone(),
            source_profile_kind: None,
            suggested_preset_id: None,
            suggested_protection_path: Some(top_detection.path.clone()),
            suggested_protection_kind: Some(protection_override_for_boundary(
                top_detection.boundary_kind,
            )),
        });
    }

    None
}

fn structure_profile_slug(kind: SourceProfileKind) -> &'static str {
    match kind {
        SourceProfileKind::Workspace => "workspace",
        SourceProfileKind::MediaImport => "media-import",
        SourceProfileKind::DownloadsInbox => "downloads-inbox",
        SourceProfileKind::ArchiveBundle => "archive-bundle",
    }
}

fn structure_profile_title(kind: SourceProfileKind) -> &'static str {
    match kind {
        SourceProfileKind::Workspace => "Workspace-like source detected",
        SourceProfileKind::MediaImport => "Media import shape detected",
        SourceProfileKind::DownloadsInbox => "Downloads-style inbox detected",
        SourceProfileKind::ArchiveBundle => "Archive-heavy batch detected",
    }
}

fn structure_profile_summary(kind: SourceProfileKind) -> &'static str {
    match kind {
        SourceProfileKind::Workspace => {
            "This source looks more like a structured workspace than a disposable inbox."
        }
        SourceProfileKind::MediaImport => {
            "This scan looks dominated by photos and videos, which often means a camera or device import."
        }
        SourceProfileKind::DownloadsInbox => {
            "This source looks like a mixed downloads inbox with many loose files and leftovers."
        }
        SourceProfileKind::ArchiveBundle => {
            "This scan looks archive-heavy and may represent packaged exports, downloads, or backup bundles."
        }
    }
}

pub(crate) fn suggested_preset_for_source_profile(
    kind: SourceProfileKind,
) -> Option<(&'static str, &'static str, &'static str)> {
    match kind {
        SourceProfileKind::Workspace => Some((
            "project_safe",
            "Project Safe",
            "Project markers and nested structure suggest starting with the most protection-aware preset.",
        )),
        SourceProfileKind::MediaImport => Some((
            "camera_import",
            "Camera Import",
            "A media-heavy import batch usually benefits from a dated photo/video preset first.",
        )),
        SourceProfileKind::DownloadsInbox => Some((
            "downloads_cleanup",
            "Downloads Cleanup",
            "A mixed inbox of loose files usually benefits from the most conservative cleanup preset before broader organization.",
        )),
        SourceProfileKind::ArchiveBundle => Some((
            "general_organize",
            "General Organize",
            "An archive-heavy batch is usually safest with the broadest conservative preset instead of a narrow import preset.",
        )),
    }
}

fn protection_override_for_boundary(boundary_kind: BoundaryKind) -> ProtectionOverrideKind {
    match boundary_kind {
        BoundaryKind::ProjectRoot => ProtectionOverrideKind::ProjectRoot,
        BoundaryKind::ParentFolder => ProtectionOverrideKind::ParentFolder,
        BoundaryKind::PreserveBoundary => ProtectionOverrideKind::PreserveBoundary,
        BoundaryKind::Independent => ProtectionOverrideKind::Independent,
    }
}

fn category_total(category_counts: &HashMap<FileCategory, u64>, category: FileCategory) -> u64 {
    category_counts.get(&category).copied().unwrap_or(0)
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
        AiAssistedSuggestionKind, BoundaryKind, DuplicateCertainty, ManifestEntryDto,
        ManifestEntryKind, ProtectionOverrideDto, ProtectionOverrideKind, ProtectionState,
        StructureSignalKind, SyntheticDatasetCategory, SyntheticDatasetManifestDto,
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
    fn suggests_camera_import_for_media_heavy_scans() {
        let root = temp_path("media-import");
        let entries = vec![
            manifest_entry(
                "img-1",
                &root,
                &root.join("IMG_0001.jpg"),
                "IMG_0001.jpg",
                "IMG_0001.jpg",
                ManifestEntryKind::File,
                20,
            ),
            manifest_entry(
                "img-2",
                &root,
                &root.join("IMG_0002.jpg"),
                "IMG_0002.jpg",
                "IMG_0002.jpg",
                ManifestEntryKind::File,
                20,
            ),
            manifest_entry(
                "img-3",
                &root,
                &root.join("IMG_0003.jpg"),
                "IMG_0003.jpg",
                "IMG_0003.jpg",
                ManifestEntryKind::File,
                20,
            ),
            manifest_entry(
                "img-4",
                &root,
                &root.join("IMG_0004.jpg"),
                "IMG_0004.jpg",
                "IMG_0004.jpg",
                ManifestEntryKind::File,
                20,
            ),
            manifest_entry(
                "img-5",
                &root,
                &root.join("IMG_0005.jpg"),
                "IMG_0005.jpg",
                "IMG_0005.jpg",
                ManifestEntryKind::File,
                20,
            ),
            manifest_entry(
                "vid-1",
                &root,
                &root.join("clip-1.mp4"),
                "clip-1.mp4",
                "clip-1.mp4",
                ManifestEntryKind::File,
                20,
            ),
            manifest_entry(
                "vid-2",
                &root,
                &root.join("clip-2.mp4"),
                "clip-2.mp4",
                "clip-2.mp4",
                ManifestEntryKind::File,
                20,
            ),
            manifest_entry(
                "vid-3",
                &root,
                &root.join("clip-3.mp4"),
                "clip-3.mp4",
                "clip-3.mp4",
                ManifestEntryKind::File,
                20,
            ),
        ];

        let summary = analyze_manifest("job-media", &entries, &[]);
        assert!(summary.ai_assisted_suggestions.iter().any(|suggestion| {
            suggestion.kind == AiAssistedSuggestionKind::PresetRecommendation
                && suggestion.suggested_preset_id.as_deref() == Some("camera_import")
        }));
    }

    #[test]
    fn suggests_parent_boundary_for_multi_project_source() {
        let root = temp_path("workspace-boundary");
        let app_a = root.join("apps/app-a");
        let app_b = root.join("apps/app-b");
        let entries = vec![
            manifest_entry(
                "root",
                &root,
                &root,
                ".",
                "workspace",
                ManifestEntryKind::Directory,
                0,
            ),
            manifest_entry(
                "app-a",
                &root,
                &app_a,
                "apps/app-a",
                "app-a",
                ManifestEntryKind::Directory,
                0,
            ),
            manifest_entry(
                "app-b",
                &root,
                &app_b,
                "apps/app-b",
                "app-b",
                ManifestEntryKind::Directory,
                0,
            ),
            manifest_entry(
                "pkg-a",
                &root,
                &app_a.join("package.json"),
                "apps/app-a/package.json",
                "package.json",
                ManifestEntryKind::File,
                10,
            ),
            manifest_entry(
                "pkg-b",
                &root,
                &app_b.join("package.json"),
                "apps/app-b/package.json",
                "package.json",
                ManifestEntryKind::File,
                10,
            ),
        ];

        let summary = analyze_manifest("job-boundary", &entries, &[]);
        assert!(summary.ai_assisted_suggestions.iter().any(|suggestion| {
            suggestion.kind == AiAssistedSuggestionKind::ProtectionRecommendation
                && suggestion.suggested_protection_path.as_deref()
                    == Some(root.to_string_lossy().as_ref())
                && suggestion.suggested_protection_kind
                    == Some(ProtectionOverrideKind::ParentFolder)
        }));
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
            media_date_epoch_ms: None,
            media_date_source: None,
        }
    }

    fn temp_path(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!("safepath-{label}-{}", Uuid::new_v4()))
    }
}
