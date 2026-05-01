use serde::{Deserialize, Serialize};

use crate::duplicate_config::{
    DuplicateConfig, DuplicateEvidence, DuplicateMatchBasis, DuplicateMatchExplanation,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppStatusDto {
    pub app_name: String,
    pub app_version: String,
    pub platform: String,
    pub workflow_phase: WorkflowPhase,
    pub permissions_readiness: PermissionReadinessDto,
    pub has_sources: bool,
    pub has_destinations: bool,
    pub source_paths: Vec<String>,
    pub destination_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedSelectionStateDto {
    pub source_paths: Vec<String>,
    pub destination_paths: Vec<String>,
    pub workflow_phase: WorkflowPhase,
    #[serde(default)]
    pub duplicate_config: Option<DuplicateConfig>,
}

impl Default for PersistedSelectionStateDto {
    fn default() -> Self {
        Self {
            source_paths: Vec::new(),
            destination_paths: Vec::new(),
            workflow_phase: WorkflowPhase::Idle,
            duplicate_config: None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionReadinessDto {
    pub state: PermissionReadinessState,
    pub summary: String,
    pub details: Vec<String>,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PermissionReadinessState {
    Unknown,
    Ready,
    NeedsAttention,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum WorkflowPhase {
    Idle,
    Scanning,
    Analyzing,
    Planning,
    Executing,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartScanRequest {
    pub source_paths: Vec<String>,
    #[serde(default)]
    pub duplicate_config: Option<DuplicateConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateSyntheticDatasetRequest {
    pub output_root: String,
    pub dataset_name: String,
    pub categories: Vec<SyntheticDatasetCategory>,
    pub max_depth: u8,
    pub messiness_level: u8,
    pub duplicate_rate_percent: u8,
    pub include_hidden_files: bool,
    pub include_empty_folders: bool,
    pub target_apparent_size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateSyntheticDatasetResultDto {
    pub dataset_name: String,
    pub root_path: String,
    pub manifest_path: String,
    pub created_at_epoch_ms: i64,
    pub file_count: u64,
    pub directory_count: u64,
    pub sparse_file_count: u64,
    pub apparent_size_bytes: u64,
    pub estimated_actual_size_bytes: u64,
    pub hash_skip_threshold_bytes: u64,
    pub category_counts: Vec<SyntheticCategoryCountDto>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyntheticDatasetManifestDto {
    pub schema_version: u32,
    pub dataset_name: String,
    pub root_path: String,
    pub created_at_epoch_ms: i64,
    pub categories: Vec<SyntheticDatasetCategory>,
    pub target_apparent_size_bytes: u64,
    pub apparent_size_bytes: u64,
    pub estimated_actual_size_bytes: u64,
    pub hash_skip_threshold_bytes: u64,
    pub sparse_file_relative_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyntheticCategoryCountDto {
    pub category: SyntheticDatasetCategory,
    pub count: u64,
}

/// Progress phases for duplicate detection work tied to a scan job (`job_id` doubles as `run_id`).
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum DuplicateRunPhase {
    #[default]
    Idle,
    Discovering,
    AnalyzingDuplicates,
    HashingDuplicateContent,
    /// Perceptual dHash / image similarity pass during expensive analysis.
    SketchingImageSimilarity,
    FinalizingAnalysis,
    ReviewReady,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateRunProgressEvent {
    pub job_id: String,
    pub phase: DuplicateRunPhase,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanJobStatusDto {
    pub job_id: String,
    pub status: ScanJobState,
    pub source_paths: Vec<String>,
    pub discovered_entries: u64,
    pub scanned_files: u64,
    pub scanned_directories: u64,
    pub page_size: u32,
    pub started_at_epoch_ms: i64,
    pub finished_at_epoch_ms: Option<i64>,
    pub error_message: Option<String>,
    #[serde(default)]
    pub duplicate_config: Option<DuplicateConfig>,
    #[serde(default)]
    pub config_fingerprint: Option<String>,
    #[serde(default)]
    pub duplicate_run_phase: DuplicateRunPhase,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ScanJobState {
    Pending,
    Running,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestPageDto {
    pub job_id: String,
    pub page: u32,
    pub page_size: u32,
    pub total_entries: u64,
    pub total_pages: u32,
    pub entries: Vec<ManifestEntryDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryPageDto {
    pub page: u32,
    pub page_size: u32,
    pub total_entries: u64,
    pub total_pages: u32,
    pub entries: Vec<HistoryEntryDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntryDto {
    pub record_id: String,
    pub session_id: String,
    pub operation_kind: ExecutionOperationKind,
    pub action_id: String,
    pub source_path: String,
    pub destination_path: Option<String>,
    pub strategy: ExecutionStrategy,
    pub status: ActionRecordStatus,
    pub message: Option<String>,
    pub rollback_safe: bool,
    pub started_at_epoch_ms: i64,
    pub finished_at_epoch_ms: i64,
    pub undo_eligible: bool,
    pub undo_blocked_reason: Option<String>,
    pub session: HistorySessionSummaryDto,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistorySessionSummaryDto {
    pub session_id: String,
    pub plan_id: String,
    pub operation_kind: ExecutionOperationKind,
    pub related_session_id: Option<String>,
    pub status: ExecutionSessionStatus,
    pub started_at_epoch_ms: i64,
    pub finished_at_epoch_ms: Option<i64>,
    pub approved_action_count: u32,
    pub completed_action_count: u32,
    pub failed_action_count: u32,
    pub skipped_action_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum LearnerObservationDto {
    DuplicateKeeperSelection {
        observation_id: String,
        observed_at_epoch_ms: i64,
        schema_version: u32,
        plan_id: String,
        job_id: String,
        preset_id: String,
        related_session_id: Option<String>,
        group_id: String,
        certainty: DuplicateCertainty,
        representative_name: String,
        item_count: u32,
        member_entry_ids: Vec<String>,
        member_action_ids: Vec<String>,
        recommended_keeper_entry_id: Option<String>,
        recommended_keeper_reason: Option<String>,
        selected_keeper_entry_id: String,
        user_agreed_with_recommendation: bool,
    },
    PlannedActionReviewDecision {
        observation_id: String,
        observed_at_epoch_ms: i64,
        schema_version: u32,
        plan_id: String,
        job_id: String,
        preset_id: String,
        action_id: String,
        source_entry_id: String,
        source_path: String,
        action_kind: PlannedActionKind,
        matched_rule_id: Option<String>,
        decision: ReviewDecision,
        resulting_review_state: ReviewState,
        safety_flags: Vec<SafetyFlag>,
        conflict_status: Option<ConflictKind>,
    },
    SuggestionFeedback {
        observation_id: String,
        observed_at_epoch_ms: i64,
        schema_version: u32,
        suggestion_id: String,
        preset_id: String,
        feedback: LearnerSuggestionFeedbackKind,
    },
    PresetSelectionContext {
        observation_id: String,
        observed_at_epoch_ms: i64,
        schema_version: u32,
        plan_id: String,
        job_id: String,
        preset_id: String,
        source_profile_kind: Option<SourceProfileKind>,
        source_profile_confidence: Option<f32>,
    },
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LearnerSuggestionFeedbackKind {
    AcceptedForLater,
    Suppressed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordLearnerSuggestionFeedbackRequest {
    pub suggestion_id: String,
    pub preset_id: String,
    pub feedback: LearnerSuggestionFeedbackKind,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum LearnerSuggestionDto {
    DuplicateKeeperPolicySuggestion {
        suggestion_id: String,
        generated_at_epoch_ms: i64,
        preset_id: String,
        based_on_observation_count: u32,
        agreement_count: u32,
        disagreement_count: u32,
        disagreement_rate: f32,
        title: String,
        rationale: String,
        suggested_adjustment: String,
        representative_names: Vec<String>,
        sample_group_ids: Vec<String>,
        feedback: Option<LearnerSuggestionFeedbackKind>,
        feedback_recorded_at_epoch_ms: Option<i64>,
    },
    RuleReviewTuningSuggestion {
        suggestion_id: String,
        generated_at_epoch_ms: i64,
        preset_id: String,
        rule_id: String,
        based_on_observation_count: u32,
        approval_count: u32,
        rejection_count: u32,
        rejection_rate: f32,
        title: String,
        rationale: String,
        suggested_adjustment: String,
        sample_source_paths: Vec<String>,
        feedback: Option<LearnerSuggestionFeedbackKind>,
        feedback_recorded_at_epoch_ms: Option<i64>,
    },
    PresetAffinitySuggestion {
        suggestion_id: String,
        generated_at_epoch_ms: i64,
        preset_id: String,
        source_profile_kind: SourceProfileKind,
        based_on_observation_count: u32,
        preset_selection_count: u32,
        preset_selection_rate: f32,
        title: String,
        rationale: String,
        suggested_adjustment: String,
        feedback: Option<LearnerSuggestionFeedbackKind>,
        feedback_recorded_at_epoch_ms: Option<i64>,
    },
    ReviewModePreferenceSuggestion {
        suggestion_id: String,
        generated_at_epoch_ms: i64,
        preset_id: String,
        based_on_observation_count: u32,
        approval_count: u32,
        rejection_count: u32,
        agreement_count: u32,
        disagreement_count: u32,
        conservative_preference_rate: f32,
        suggested_review_mode: ReviewMode,
        title: String,
        rationale: String,
        suggested_adjustment: String,
        feedback: Option<LearnerSuggestionFeedbackKind>,
        feedback_recorded_at_epoch_ms: Option<i64>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum LearnerDraftPreviewDto {
    DuplicateKeeperPolicyDraft {
        draft_id: String,
        suggestion_id: String,
        preset_id: String,
        preset_name: String,
        title: String,
        summary: String,
        before_duplicate_policy: DuplicatePolicy,
        after_duplicate_policy: DuplicatePolicy,
        before_review_mode: ReviewMode,
        after_review_mode: ReviewMode,
    },
    RuleReviewTuningDraft {
        draft_id: String,
        suggestion_id: String,
        preset_id: String,
        preset_name: String,
        rule_id: String,
        rule_name: String,
        title: String,
        summary: String,
        before_action_kind: PlannedActionKind,
        after_action_kind: PlannedActionKind,
        destination_template: Option<String>,
        condition_count: u32,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveLearnerDraftPreviewRequest {
    pub draft_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiEvaluationSnapshotDto {
    pub generated_at_epoch_ms: i64,
    pub total_observation_count: u32,
    pub tasks: Vec<AiEvaluationTaskDto>,
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiEvaluationTaskDto {
    pub task_id: String,
    pub title: String,
    pub summary: String,
    pub baseline_name: String,
    pub candidate_name: Option<String>,
    pub observation_count: u32,
    pub candidate_coverage_count: u32,
    pub baseline_match_rate: Option<f32>,
    pub candidate_match_rate: Option<f32>,
    pub recommendation: String,
    pub confidence_guidance: String,
    pub trust_notes: Vec<String>,
    pub status: AiEvaluationStatus,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AiEvaluationStatus {
    KeepHeuristic,
    CandidatePromising,
    InsufficientData,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestEntryDto {
    pub entry_id: String,
    pub job_id: String,
    pub source_root: String,
    pub path: String,
    pub relative_path: String,
    pub name: String,
    pub entry_kind: ManifestEntryKind,
    pub size_bytes: u64,
    pub extension: Option<String>,
    pub is_hidden: bool,
    pub created_at_epoch_ms: Option<i64>,
    pub modified_at_epoch_ms: Option<i64>,
    pub media_date_epoch_ms: Option<i64>,
    pub media_date_source: Option<MediaDateSource>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ManifestEntryKind {
    File,
    Directory,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum MediaDateSource {
    EmbeddedMetadata,
    FilesystemCreated,
    FilesystemModified,
}

/// Debug/export bundle for duplicate workflow review (plan + scan context + preflight).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateWorkflowReportDto {
    pub schema_version: u32,
    pub exported_at_epoch_ms: i64,
    pub plan_id: String,
    pub plan: PlanDto,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scan_job: Option<ScanJobStatusDto>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub analysis_summary: Option<AnalysisSummaryDto>,
    pub execution_preflight: Vec<PreflightIssueDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisSummaryDto {
    pub job_id: String,
    pub category_counts: Vec<CategoryCountDto>,
    pub structure_signals: Vec<StructureSignalDto>,
    pub unknown_count: u64,
    pub no_extension_count: u64,
    pub likely_duplicate_groups: Vec<DuplicateGroupDto>,
    #[serde(default)]
    pub skipped_large_synthetic_files: u64,
    pub detected_protections: Vec<ProtectionDetectionDto>,
    pub protection_overrides: Vec<ProtectionOverrideDto>,
    #[serde(default)]
    pub ai_assisted_suggestions: Vec<AiAssistedSuggestionDto>,
    #[serde(default)]
    pub duplicate_config: Option<DuplicateConfig>,
    #[serde(default)]
    pub config_fingerprint: Option<String>,
    #[serde(default)]
    pub analysis_partial_notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildPlanRequest {
    pub job_id: String,
    pub preset_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresetDefinitionDto {
    pub preset_id: String,
    pub name: String,
    pub description: String,
    pub rule_set: RuleSetDto,
    pub plan_options: PlanOptionsDto,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleSetDto {
    pub rule_set_id: String,
    pub name: String,
    pub rules: Vec<RuleDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleDto {
    pub rule_id: String,
    pub name: String,
    pub priority: i32,
    pub conditions: Vec<RuleConditionDto>,
    pub action_kind: PlannedActionKind,
    pub destination_template: Option<String>,
    pub explanation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum RuleConditionDto {
    FileCategory {
        category: FileCategory,
    },
    ExtensionIn {
        extensions: Vec<String>,
    },
    FilenameContains {
        value: String,
    },
    PathContains {
        value: String,
    },
    SizeRange {
        min_bytes: Option<u64>,
        max_bytes: Option<u64>,
    },
    NoExtension,
    DuplicateGroup,
    AnyOf {
        conditions: Vec<RuleConditionDto>,
    },
    AllOf {
        conditions: Vec<RuleConditionDto>,
    },
    Always,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanOptionsDto {
    pub checksum_mode: ChecksumMode,
    pub duplicate_policy: DuplicatePolicy,
    pub review_mode: ReviewMode,
    pub project_safety_mode: ProjectSafetyMode,
    pub fallback_behavior: FallbackBehavior,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ChecksumMode {
    Off,
    On,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DuplicatePolicy {
    FlagOnly,
    Informational,
    FullReview,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ReviewMode {
    Standard,
    Strict,
    DuplicateFirst,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ProjectSafetyMode {
    On,
    Strict,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum FallbackBehavior {
    Skip,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanDto {
    pub plan_id: String,
    pub job_id: String,
    pub preset_id: String,
    pub preset_name: String,
    pub destination_root: String,
    pub plan_options: PlanOptionsDto,
    pub summary: PlanSummaryDto,
    pub duplicate_groups: Vec<PlanDuplicateGroupDto>,
    pub actions: Vec<PlannedActionDto>,
    #[serde(default)]
    pub config_fingerprint: Option<String>,
    #[serde(default)]
    pub duplicate_config_snapshot: Option<DuplicateConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanSummaryDto {
    pub total_actions: u32,
    pub move_actions: u32,
    pub review_actions: u32,
    pub blocked_actions: u32,
    pub skipped_actions: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlannedActionDto {
    pub action_id: String,
    pub source_entry_id: String,
    pub source_path: String,
    pub destination_path: Option<String>,
    pub duplicate_group_id: Option<String>,
    pub action_kind: PlannedActionKind,
    pub review_state: ReviewState,
    pub explanation: ActionExplanationDto,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanDuplicateGroupDto {
    pub group_id: String,
    pub certainty: DuplicateCertainty,
    pub representative_name: String,
    pub item_count: u32,
    pub member_action_ids: Vec<String>,
    pub member_entry_ids: Vec<String>,
    pub selected_keeper_entry_id: Option<String>,
    pub recommended_keeper_entry_id: Option<String>,
    pub recommended_keeper_reason: Option<String>,
    pub recommended_keeper_confidence: Option<f32>,
    #[serde(default)]
    pub recommended_keeper_reason_tags: Vec<String>,
    #[serde(default)]
    pub match_basis: Option<DuplicateMatchBasis>,
    #[serde(default)]
    pub confidence: Option<f32>,
    #[serde(default)]
    pub evidence: Option<DuplicateEvidence>,
    #[serde(default)]
    pub match_explanation: Option<DuplicateMatchExplanation>,
    #[serde(default)]
    pub stable_group_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateReviewGroupDetailsDto {
    pub group_id: String,
    pub representative_name: String,
    pub certainty: DuplicateCertainty,
    pub item_count: u32,
    pub selected_keeper_entry_id: Option<String>,
    pub recommended_keeper_entry_id: Option<String>,
    pub recommended_keeper_reason: Option<String>,
    pub recommended_keeper_confidence: Option<f32>,
    #[serde(default)]
    pub recommended_keeper_reason_tags: Vec<String>,
    pub members: Vec<DuplicateReviewMemberDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateReviewMemberDto {
    pub entry_id: String,
    pub action_id: Option<String>,
    pub path: String,
    pub name: String,
    pub size_bytes: u64,
    pub created_at_epoch_ms: Option<i64>,
    pub modified_at_epoch_ms: Option<i64>,
    pub media_date_epoch_ms: Option<i64>,
    pub media_date_source: Option<MediaDateSource>,
    pub review_state: Option<ReviewState>,
    pub is_selected_keeper: bool,
    pub is_recommended_keeper: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PlannedActionKind {
    Move,
    Review,
    Skip,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ReviewState {
    Pending,
    Approved,
    Rejected,
    Blocked,
    NeedsChoice,
    Executed,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ReviewDecision {
    Approve,
    Reject,
    Reset,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateReviewStateRequest {
    pub plan_id: String,
    pub action_ids: Vec<String>,
    pub decision: ReviewDecision,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetDuplicateKeeperRequest {
    pub plan_id: String,
    pub group_id: String,
    pub keeper_entry_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutePlanRequest {
    pub plan_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UndoRecordRequest {
    pub record_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UndoSessionRequest {
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionSessionDto {
    pub session_id: String,
    pub plan_id: String,
    #[serde(default)]
    pub operation_kind: ExecutionOperationKind,
    #[serde(default)]
    pub related_session_id: Option<String>,
    pub status: ExecutionSessionStatus,
    pub started_at_epoch_ms: i64,
    pub finished_at_epoch_ms: Option<i64>,
    pub approved_action_count: u32,
    pub completed_action_count: u32,
    pub failed_action_count: u32,
    pub skipped_action_count: u32,
    pub preflight_issues: Vec<PreflightIssueDto>,
    pub records: Vec<ActionRecordDto>,
    #[serde(default)]
    pub config_fingerprint: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ExecutionSessionStatus {
    Pending,
    Running,
    Completed,
    PartiallyFailed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreflightIssueDto {
    pub action_id: Option<String>,
    pub severity: PreflightIssueSeverity,
    pub message: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PreflightIssueSeverity {
    Info,
    Warning,
    #[serde(rename = "error")]
    Blocking,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionRecordDto {
    pub record_id: String,
    pub session_id: String,
    #[serde(default)]
    pub operation_kind: ExecutionOperationKind,
    #[serde(default)]
    pub related_record_id: Option<String>,
    pub action_id: String,
    pub source_path: String,
    pub destination_path: Option<String>,
    pub strategy: ExecutionStrategy,
    pub status: ActionRecordStatus,
    pub message: Option<String>,
    pub rollback_safe: bool,
    pub started_at_epoch_ms: i64,
    pub finished_at_epoch_ms: i64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ActionRecordStatus {
    Completed,
    Failed,
    Skipped,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ExecutionOperationKind {
    #[default]
    Execute,
    Undo,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ExecutionStrategy {
    SameVolumeMove,
    CrossVolumeSafeMove,
    CopyOnly,
    DuplicateConsolidate,
    DeleteToTrash,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionExplanationDto {
    pub matched_preset: String,
    pub matched_rule: Option<String>,
    pub matched_conditions: Vec<String>,
    pub rule_priority: Option<i32>,
    pub confidence: f32,
    pub safety_flags: Vec<SafetyFlag>,
    pub duplicate_tier: Option<DuplicateCertainty>,
    pub protection_state: Option<ProtectionState>,
    pub blocked_reason: Option<String>,
    pub destination_root: Option<String>,
    pub template_used: Option<String>,
    pub template_error: Option<String>,
    pub previewed_template_output: Option<String>,
    pub destination_conflict_path: Option<String>,
    pub conflict_status: Option<ConflictKind>,
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SafetyFlag {
    Protected,
    Duplicate,
    UnknownFile,
    NoExtension,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ConflictKind {
    ProtectionConflict,
    DuplicateConflict,
    TemplateConflict,
    DestinationConflict,
    RuleConflict,
    PermissionConflict,
    NeedsUserChoice,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryCountDto {
    pub category: FileCategory,
    pub count: u64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash, PartialOrd, Ord)]
#[serde(rename_all = "camelCase")]
pub enum FileCategory {
    Directory,
    Image,
    Video,
    Audio,
    Document,
    Archive,
    Code,
    Unknown,
    Other,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash, PartialOrd, Ord)]
#[serde(rename_all = "camelCase")]
pub enum SyntheticDatasetCategory {
    Documents,
    Pdfs,
    Spreadsheets,
    Images,
    RawImages,
    Videos,
    Archives,
    Audio,
    CodeProjects,
    MixedClutter,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StructureSignalDto {
    pub kind: StructureSignalKind,
    pub description: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum StructureSignalKind {
    FlatChaos,
    DeepNesting,
    MixedContent,
    HiddenClutter,
    EmptyFolders,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateGroupDto {
    pub group_id: String,
    pub certainty: DuplicateCertainty,
    pub representative_name: String,
    pub size_bytes: u64,
    pub item_count: u32,
    pub members: Vec<DuplicateMemberDto>,
    #[serde(default)]
    pub match_basis: Option<DuplicateMatchBasis>,
    #[serde(default)]
    pub confidence: Option<f32>,
    #[serde(default)]
    pub evidence: Option<DuplicateEvidence>,
    #[serde(default)]
    pub match_explanation: Option<DuplicateMatchExplanation>,
    #[serde(default)]
    pub stable_group_key: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DuplicateCertainty {
    Definite,
    Likely,
    Possible,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateMemberDto {
    pub entry_id: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtectionDetectionDto {
    pub path: String,
    pub state: ProtectionState,
    pub boundary_kind: BoundaryKind,
    pub confidence: Option<f32>,
    pub markers: Vec<String>,
    pub reasons: Vec<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ProtectionState {
    UserProtected,
    AutoDetectedHigh,
    AutoDetectedMedium,
    AutoDetectedLow,
    Unprotected,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum BoundaryKind {
    ProjectRoot,
    ParentFolder,
    PreserveBoundary,
    Independent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtectionOverrideDto {
    pub path: String,
    pub override_kind: ProtectionOverrideKind,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAssistedSuggestionDto {
    pub suggestion_id: String,
    pub kind: AiAssistedSuggestionKind,
    pub title: String,
    pub summary: String,
    pub confidence: f32,
    pub reasons: Vec<String>,
    #[serde(default)]
    pub source_profile_kind: Option<SourceProfileKind>,
    pub suggested_preset_id: Option<String>,
    pub suggested_protection_path: Option<String>,
    pub suggested_protection_kind: Option<ProtectionOverrideKind>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AiAssistedSuggestionKind {
    SourceProfile,
    PresetRecommendation,
    ProtectionRecommendation,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub enum SourceProfileKind {
    Workspace,
    MediaImport,
    DownloadsInbox,
    ArchiveBundle,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ProtectionOverrideKind {
    UserProtected,
    ProjectRoot,
    ParentFolder,
    PreserveBoundary,
    Independent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanStartedEvent {
    pub job_id: String,
    pub source_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgressEvent {
    pub job_id: String,
    pub discovered_entries: u64,
    pub scanned_files: u64,
    pub scanned_directories: u64,
    pub latest_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanPageReadyEvent {
    pub job_id: String,
    pub page: u32,
    pub page_size: u32,
    pub total_entries: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisProgressEvent {
    pub job_id: String,
    pub stage: AnalysisStage,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanReadyEvent {
    pub plan_id: String,
    pub job_id: String,
    pub preset_id: String,
    pub action_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionProgressEvent {
    pub session_id: String,
    pub completed_action_count: u32,
    pub total_actions: u32,
    pub current_action_id: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionCompletedEvent {
    pub session_id: String,
    pub status: ExecutionSessionStatus,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AnalysisStage {
    Started,
    Completed,
}

#[derive(Debug, Clone)]
pub struct ScannedEntryRecord {
    pub source_root: String,
    pub path: String,
    pub relative_path: String,
    pub name: String,
    pub entry_kind: ManifestEntryKind,
    pub size_bytes: u64,
    pub extension: Option<String>,
    pub is_hidden: bool,
    pub created_at_epoch_ms: Option<i64>,
    pub modified_at_epoch_ms: Option<i64>,
    pub media_date_epoch_ms: Option<i64>,
    pub media_date_source: Option<MediaDateSource>,
}
