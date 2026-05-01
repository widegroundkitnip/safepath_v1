//! Canonical duplicate-detection configuration and fingerprinting.

use serde::{Deserialize, Serialize};

/// Increment when serialized shape or semantics change incompatibly.
pub const DUPLICATE_CONFIG_SCHEMA_VERSION: u32 = 1;

/// Blake3 hex digest of the canonical JSON serialization of `DuplicateConfig`.
pub fn duplicate_config_fingerprint(config: &DuplicateConfig) -> String {
    let bytes = serde_json::to_vec(config).expect("DuplicateConfig serializes to JSON");
    blake3::hash(&bytes).to_hex().to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DuplicateUiMode {
    Simple,
    Advanced,
}

impl Default for DuplicateUiMode {
    fn default() -> Self {
        Self::Simple
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DuplicateProfile {
    Custom,
    Safe,
    Balanced,
    Flexible,
}

impl Default for DuplicateProfile {
    fn default() -> Self {
        Self::Balanced
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum MatchingStrategy {
    /// Size-bucket then full-file hash; only groups with identical hash.
    ExactHash,
    /// Name (normalized) + size bucketing; no hash unless hybrid confirms.
    FastNameSize,
    /// Name/size candidates, then hash confirmation for "definite" tier.
    Hybrid,
    /// Reserved for perceptual / similarity passes (gated by limits and media modules).
    Similar,
    /// Extension + size + coarse metadata only (low confidence).
    MetadataOnly,
}

impl Default for MatchingStrategy {
    fn default() -> Self {
        Self::Hybrid
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ExecutionSafetyTier {
    /// Non-destructive; Simple mode default.
    SafeHold,
    Reversible,
    Destructive,
}

impl Default for ExecutionSafetyTier {
    fn default() -> Self {
        Self::SafeHold
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MatchingConditions {
    #[serde(default = "default_true")]
    pub require_same_size: bool,
    #[serde(default = "default_true")]
    pub require_same_normalized_name_for_heuristic: bool,
    #[serde(default)]
    pub time_window_tolerance_ms: Option<i64>,
    #[serde(default)]
    pub structure_depth_max: Option<u32>,
}

fn default_true() -> bool {
    true
}

impl Default for MatchingConditions {
    fn default() -> Self {
        Self {
            require_same_size: true,
            require_same_normalized_name_for_heuristic: true,
            time_window_tolerance_ms: None,
            structure_depth_max: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScopeFilters {
    #[serde(default)]
    pub min_size_bytes: u64,
    #[serde(default = "default_max_u64")]
    pub max_size_bytes: u64,
    #[serde(default = "default_true")]
    pub include_hidden: bool,
    #[serde(default)]
    pub ignore_system_junk: bool,
    #[serde(default)]
    pub group_by_parent_folder: bool,
    #[serde(default)]
    pub ignore_globs: Vec<String>,
}

fn default_max_u64() -> u64 {
    u64::MAX
}

impl Default for ScopeFilters {
    fn default() -> Self {
        Self {
            min_size_bytes: 0,
            max_size_bytes: u64::MAX,
            include_hidden: true,
            ignore_system_junk: true,
            group_by_parent_folder: false,
            ignore_globs: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MediaModuleRules {
    #[serde(default)]
    pub images_enabled: bool,
    #[serde(default)]
    pub audio_enabled: bool,
    #[serde(default)]
    pub video_enabled: bool,
    #[serde(default)]
    pub documents_enabled: bool,
}

impl Default for MediaModuleRules {
    fn default() -> Self {
        Self {
            images_enabled: false,
            audio_enabled: false,
            video_enabled: false,
            documents_enabled: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DuplicateGroupScope {
    /// Members may span source roots.
    External,
    /// Members must share the same immediate source root.
    PerSourceRoot,
}

impl Default for DuplicateGroupScope {
    fn default() -> Self {
        Self::External
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GroupingPolicy {
    #[serde(default)]
    pub scope: DuplicateGroupScope,
    #[serde(default)]
    pub treat_folder_duplicates_separately: bool,
}

impl Default for GroupingPolicy {
    fn default() -> Self {
        Self {
            scope: DuplicateGroupScope::default(),
            treat_folder_duplicates_separately: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum KeeperPreference {
    Newest,
    Oldest,
    PreferOriginalFolder,
    PreferProtected,
    ShortestPath,
    LargestFile,
}

impl Default for KeeperPreference {
    fn default() -> Self {
        Self::Newest
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KeeperStrategySettings {
    #[serde(default)]
    pub preference: KeeperPreference,
    /// When false, bulk destructive keeper resolution requires explicit confirmation (Flexible Simple).
    #[serde(default = "default_true")]
    pub allow_auto_keeper: bool,
}

impl Default for KeeperStrategySettings {
    fn default() -> Self {
        Self {
            preference: KeeperPreference::default(),
            allow_auto_keeper: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateExecutionPolicy {
    #[serde(default)]
    pub safety_tier: ExecutionSafetyTier,
    #[serde(default)]
    pub require_dry_run_acknowledgment: bool,
}

impl Default for DuplicateExecutionPolicy {
    fn default() -> Self {
        Self {
            safety_tier: ExecutionSafetyTier::SafeHold,
            require_dry_run_acknowledgment: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisLimits {
    #[serde(default = "default_max_similarity_files")]
    pub max_files_for_similarity: u32,
    #[serde(default = "default_max_pairwise")]
    pub max_pairwise_comparisons: u64,
    /// Best-effort wall-clock cap for expensive duplicate analysis (`None` or `0` = no limit).
    /// When exceeded, hashing / similarity stop and a partial note is recorded on the summary.
    #[serde(default)]
    pub analysis_timeout_ms: Option<u64>,
}

fn default_max_similarity_files() -> u32 {
    5_000
}

fn default_max_pairwise() -> u64 {
    50_000
}

impl Default for AnalysisLimits {
    fn default() -> Self {
        Self {
            max_files_for_similarity: default_max_similarity_files(),
            max_pairwise_comparisons: default_max_pairwise(),
            analysis_timeout_ms: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateConfig {
    #[serde(default = "default_version")]
    pub version: u32,
    #[serde(default)]
    pub ui_mode: DuplicateUiMode,
    #[serde(default)]
    pub profile: DuplicateProfile,
    #[serde(default)]
    pub matching_strategy: MatchingStrategy,
    #[serde(default)]
    pub conditions: MatchingConditions,
    #[serde(default)]
    pub filters: ScopeFilters,
    #[serde(default)]
    pub media_modules: MediaModuleRules,
    #[serde(default)]
    pub grouping: GroupingPolicy,
    #[serde(default)]
    pub keeper: KeeperStrategySettings,
    #[serde(default)]
    pub execution: DuplicateExecutionPolicy,
    #[serde(default)]
    pub limits: AnalysisLimits,
}

fn default_version() -> u32 {
    DUPLICATE_CONFIG_SCHEMA_VERSION
}

impl Default for DuplicateConfig {
    fn default() -> Self {
        Self {
            version: DUPLICATE_CONFIG_SCHEMA_VERSION,
            ui_mode: DuplicateUiMode::default(),
            profile: DuplicateProfile::default(),
            matching_strategy: MatchingStrategy::default(),
            conditions: MatchingConditions::default(),
            filters: ScopeFilters::default(),
            media_modules: MediaModuleRules::default(),
            grouping: GroupingPolicy::default(),
            keeper: KeeperStrategySettings::default(),
            execution: DuplicateExecutionPolicy::default(),
            limits: AnalysisLimits::default(),
        }
    }
}

impl DuplicateConfig {
    pub fn validated(self) -> Result<Self, String> {
        if self.version != DUPLICATE_CONFIG_SCHEMA_VERSION {
            return Err(format!(
                "Unsupported duplicate config version {} (expected {}).",
                self.version, DUPLICATE_CONFIG_SCHEMA_VERSION
            ));
        }
        Ok(self)
    }
}

/// Per-member hash captured during analysis (for drift detection).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct MemberContentHash {
    pub entry_id: String,
    pub hash_hex: String,
}

/// Evidence snapshot attached to a duplicate group for drift and explainability.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateEvidence {
    #[serde(default)]
    pub primary_content_hash: Option<String>,
    #[serde(default)]
    pub member_hashes: Vec<MemberContentHash>,
    #[serde(default)]
    pub size_bytes: Option<u64>,
    #[serde(default)]
    pub normalized_name: Option<String>,
    #[serde(default)]
    pub stat_fingerprint_epoch_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DuplicateMatchBasis {
    ExactContentHash,
    NameSizeHeuristic,
    HybridHashConfirmed,
    Similarity,
    Metadata,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateMatchExplanation {
    #[serde(default)]
    pub strategy_used: String,
    #[serde(default)]
    pub matched_conditions: Vec<String>,
    #[serde(default)]
    pub confidence_reasons: Vec<String>,
    #[serde(default)]
    pub human_summary: String,
}

// --- Simple mode presets (product mapping) ---

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SimpleDuplicateMode {
    ExactDuplicates,
    SimilarFiles,
    MediaDuplicates,
}

impl Default for SimpleDuplicateMode {
    fn default() -> Self {
        Self::ExactDuplicates
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SimpleStrictness {
    Strict,
    Balanced,
    Flexible,
}

impl Default for SimpleStrictness {
    fn default() -> Self {
        Self::Balanced
    }
}

/// Maps Simple controls to a full `DuplicateConfig`. Simple mode always uses `SafeHold`.
pub fn duplicate_config_from_simple(
    mode: SimpleDuplicateMode,
    strictness: SimpleStrictness,
    keeper: KeeperPreference,
    ignore_small_files: bool,
    ignore_hidden_system: bool,
    group_by_folder: bool,
) -> DuplicateConfig {
    let mut config = DuplicateConfig::default();
    config.ui_mode = DuplicateUiMode::Simple;
    config.execution.safety_tier = ExecutionSafetyTier::SafeHold;
    config.execution.require_dry_run_acknowledgment = true;
    config.keeper.preference = keeper;
    config.filters.group_by_parent_folder = group_by_folder;
    config.filters.ignore_system_junk = ignore_hidden_system;
    if ignore_small_files {
        config.filters.min_size_bytes = 4_096;
    }

    match mode {
        SimpleDuplicateMode::ExactDuplicates => {
            config.profile = match strictness {
                SimpleStrictness::Strict => DuplicateProfile::Safe,
                SimpleStrictness::Balanced | SimpleStrictness::Flexible => DuplicateProfile::Balanced,
            };
            config.matching_strategy = MatchingStrategy::ExactHash;
            config.media_modules = MediaModuleRules::default();
        }
        SimpleDuplicateMode::SimilarFiles => {
            config.profile = DuplicateProfile::Flexible;
            config.matching_strategy = match strictness {
                SimpleStrictness::Strict => MatchingStrategy::Hybrid,
                SimpleStrictness::Balanced => MatchingStrategy::Hybrid,
                SimpleStrictness::Flexible => MatchingStrategy::Similar,
            };
            config.media_modules.images_enabled = true;
            config.keeper.allow_auto_keeper = false;
        }
        SimpleDuplicateMode::MediaDuplicates => {
            config.profile = DuplicateProfile::Balanced;
            config.matching_strategy = MatchingStrategy::Hybrid;
            config.media_modules = MediaModuleRules {
                images_enabled: true,
                audio_enabled: true,
                video_enabled: true,
                documents_enabled: false,
            };
        }
    }

    match strictness {
        SimpleStrictness::Strict => {
            config.filters.include_hidden = false;
            if mode == SimpleDuplicateMode::ExactDuplicates {
                config.matching_strategy = MatchingStrategy::ExactHash;
            }
        }
        SimpleStrictness::Balanced => {}
        SimpleStrictness::Flexible => {
            config.keeper.allow_auto_keeper = false;
        }
    }

    config
}

/// Perceptual dHash cache (64-bit), invalidated when size or mtime drifts.
/// SQLite-backed implementations live in `safepath-store`.
pub trait ImageDHashCache {
    fn get_cached_image_dhash(
        &self,
        job_id: &str,
        entry_id: &str,
        size_bytes: u64,
        modified_ms: Option<i64>,
    ) -> Option<u64>;

    fn put_cached_image_dhash(
        &self,
        job_id: &str,
        entry_id: &str,
        size_bytes: u64,
        modified_ms: Option<i64>,
        d_hash: u64,
    ) -> Result<(), String>;
}

/// SQLite-backed implementations live in `safepath-store`.
pub trait FileContentHashCache {
    fn get_cached_file_hash(
        &self,
        job_id: &str,
        entry_id: &str,
        size_bytes: u64,
        modified_ms: Option<i64>,
    ) -> Option<String>;

    fn put_cached_file_hash(
        &self,
        job_id: &str,
        entry_id: &str,
        size_bytes: u64,
        modified_ms: Option<i64>,
        hash_hex: &str,
    ) -> Result<(), String>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fingerprint_stable_for_equal_config() {
        let a = DuplicateConfig::default();
        let b = DuplicateConfig::default();
        assert_eq!(duplicate_config_fingerprint(&a), duplicate_config_fingerprint(&b));
    }

    #[test]
    fn fingerprint_changes_when_strategy_changes() {
        let a = DuplicateConfig::default();
        let mut b = DuplicateConfig::default();
        b.matching_strategy = MatchingStrategy::ExactHash;
        assert_ne!(duplicate_config_fingerprint(&a), duplicate_config_fingerprint(&b));
    }

    #[test]
    fn serde_round_trip() {
        let config = duplicate_config_from_simple(
            SimpleDuplicateMode::MediaDuplicates,
            SimpleStrictness::Balanced,
            KeeperPreference::Oldest,
            true,
            true,
            true,
        );
        let json = serde_json::to_string(&config).unwrap();
        let back: DuplicateConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(config, back);
    }
}
