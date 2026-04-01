pub mod analyzer;
pub mod executor;
pub mod history;
pub mod learner;
pub mod pathing;
pub mod planner;
pub mod presets;
pub mod rules;
pub mod scanner;
pub mod templates;
pub mod test_data;
pub mod types;

pub use types::{
    ActionExplanationDto, ActionRecordDto, ActionRecordStatus, AnalysisProgressEvent,
    AnalysisStage, AnalysisSummaryDto, AppStatusDto, BoundaryKind, BuildPlanRequest, ChecksumMode,
    ConflictKind, DuplicateCertainty, DuplicateGroupDto, DuplicatePolicy, ExecutePlanRequest,
    ExecutionCompletedEvent, ExecutionOperationKind, ExecutionProgressEvent, ExecutionSessionDto,
    ExecutionSessionStatus, ExecutionStrategy, FallbackBehavior, FileCategory,
    GenerateSyntheticDatasetRequest, GenerateSyntheticDatasetResultDto, HistoryEntryDto,
    HistoryPageDto, HistorySessionSummaryDto, LearnerDraftPreviewDto, LearnerObservationDto,
    LearnerSuggestionDto, LearnerSuggestionFeedbackKind, ManifestEntryDto, ManifestEntryKind,
    ManifestPageDto, PermissionReadinessDto, PermissionReadinessState, PersistedSelectionStateDto,
    PlanDto,
    PlanDuplicateGroupDto, PlanOptionsDto, PlanReadyEvent, PlanSummaryDto, PlannedActionDto,
    PlannedActionKind, PreflightIssueDto, PreflightIssueSeverity, PresetDefinitionDto,
    ProjectSafetyMode, ProtectionDetectionDto, ProtectionOverrideDto, ProtectionOverrideKind,
    ProtectionState, RecordLearnerSuggestionFeedbackRequest, ReviewDecision, ReviewMode,
    ReviewState, RuleConditionDto, RuleDto, RuleSetDto, SafetyFlag, SaveLearnerDraftPreviewRequest,
    ScanJobState, ScanJobStatusDto, ScanPageReadyEvent, ScanProgressEvent, ScanStartedEvent,
    SetDuplicateKeeperRequest, StartScanRequest, StructureSignalDto, StructureSignalKind,
    SyntheticCategoryCountDto, SyntheticDatasetCategory, SyntheticDatasetManifestDto,
    UndoRecordRequest, UndoSessionRequest, UpdateReviewStateRequest, WorkflowPhase,
};

pub fn build_app_status(
    platform: impl Into<String>,
    workflow_phase: WorkflowPhase,
    permissions_readiness: PermissionReadinessDto,
    source_paths: Vec<String>,
    destination_paths: Vec<String>,
) -> AppStatusDto {
    AppStatusDto {
        app_name: "Safepath".to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        platform: platform.into(),
        workflow_phase,
        permissions_readiness,
        has_sources: !source_paths.is_empty(),
        has_destinations: !destination_paths.is_empty(),
        source_paths,
        destination_paths,
    }
}
