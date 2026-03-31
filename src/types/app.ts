export type PermissionReadinessState = 'unknown' | 'ready' | 'needsAttention'

export type WorkflowPhase = 'idle' | 'scanning' | 'analyzing' | 'planning' | 'executing'
export type FileCategory =
  | 'directory'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'archive'
  | 'code'
  | 'unknown'
  | 'other'
export type StructureSignalKind =
  | 'flatChaos'
  | 'deepNesting'
  | 'mixedContent'
  | 'hiddenClutter'
  | 'emptyFolders'
export type DuplicateCertainty = 'definite' | 'likely' | 'possible'
export type ProtectionState =
  | 'userProtected'
  | 'autoDetectedHigh'
  | 'autoDetectedMedium'
  | 'autoDetectedLow'
  | 'unprotected'
export type BoundaryKind = 'projectRoot' | 'parentFolder' | 'preserveBoundary' | 'independent'
export type ProtectionOverrideKind =
  | 'userProtected'
  | 'projectRoot'
  | 'parentFolder'
  | 'preserveBoundary'
  | 'independent'

export interface PermissionReadinessDto {
  state: PermissionReadinessState
  summary: string
  details: string[]
}

export interface AppStatusDto {
  appName: string
  appVersion: string
  platform: string
  workflowPhase: WorkflowPhase
  permissionsReadiness: PermissionReadinessDto
  hasSources: boolean
  hasDestinations: boolean
  sourcePaths: string[]
  destinationPaths: string[]
}

export type ScanJobState = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
export type ManifestEntryKind = 'file' | 'directory'

export interface StartScanRequest {
  sourcePaths: string[]
}

export type SyntheticDatasetCategory =
  | 'documents'
  | 'pdfs'
  | 'spreadsheets'
  | 'images'
  | 'rawImages'
  | 'videos'
  | 'archives'
  | 'audio'
  | 'codeProjects'
  | 'mixedClutter'

export interface GenerateSyntheticDatasetRequest {
  outputRoot: string
  datasetName: string
  categories: SyntheticDatasetCategory[]
  maxDepth: number
  messinessLevel: number
  duplicateRatePercent: number
  includeHiddenFiles: boolean
  includeEmptyFolders: boolean
  targetApparentSizeBytes: number
}

export interface SyntheticCategoryCountDto {
  category: SyntheticDatasetCategory
  count: number
}

export interface GenerateSyntheticDatasetResultDto {
  datasetName: string
  rootPath: string
  manifestPath: string
  createdAtEpochMs: number
  fileCount: number
  directoryCount: number
  sparseFileCount: number
  apparentSizeBytes: number
  estimatedActualSizeBytes: number
  hashSkipThresholdBytes: number
  categoryCounts: SyntheticCategoryCountDto[]
  warnings: string[]
}

export interface ScanJobStatusDto {
  jobId: string
  status: ScanJobState
  sourcePaths: string[]
  discoveredEntries: number
  scannedFiles: number
  scannedDirectories: number
  pageSize: number
  startedAtEpochMs: number
  finishedAtEpochMs: number | null
  errorMessage: string | null
}

export interface ManifestEntryDto {
  entryId: string
  jobId: string
  sourceRoot: string
  path: string
  relativePath: string
  name: string
  entryKind: ManifestEntryKind
  sizeBytes: number
  extension: string | null
  isHidden: boolean
  createdAtEpochMs: number | null
  modifiedAtEpochMs: number | null
}

export interface ManifestPageDto {
  jobId: string
  page: number
  pageSize: number
  totalEntries: number
  totalPages: number
  entries: ManifestEntryDto[]
}

export interface HistoryEntryDto {
  recordId: string
  sessionId: string
  operationKind: ExecutionOperationKind
  actionId: string
  sourcePath: string
  destinationPath: string | null
  strategy: ExecutionStrategy
  status: ActionRecordStatus
  message: string | null
  rollbackSafe: boolean
  startedAtEpochMs: number
  finishedAtEpochMs: number
  undoEligible: boolean
  undoBlockedReason: string | null
  session: HistorySessionSummaryDto
}

export interface HistorySessionSummaryDto {
  sessionId: string
  planId: string
  operationKind: ExecutionOperationKind
  relatedSessionId: string | null
  status: ExecutionSessionStatus
  startedAtEpochMs: number
  finishedAtEpochMs: number | null
  approvedActionCount: number
  completedActionCount: number
  failedActionCount: number
  skippedActionCount: number
}

export type LearnerSuggestionFeedbackKind = 'acceptedForLater' | 'suppressed'

export type DuplicateKeeperSelectionObservationDto = {
  kind: 'duplicateKeeperSelection'
  observationId: string
  observedAtEpochMs: number
  schemaVersion: number
  planId: string
  jobId: string
  presetId: string
  relatedSessionId: string | null
  groupId: string
  certainty: DuplicateCertainty
  representativeName: string
  itemCount: number
  memberEntryIds: string[]
  memberActionIds: string[]
  recommendedKeeperEntryId: string | null
  recommendedKeeperReason: string | null
  selectedKeeperEntryId: string
  userAgreedWithRecommendation: boolean
}

export type PlannedActionReviewDecisionObservationDto = {
  kind: 'plannedActionReviewDecision'
  observationId: string
  observedAtEpochMs: number
  schemaVersion: number
  planId: string
  jobId: string
  presetId: string
  actionId: string
  sourceEntryId: string
  sourcePath: string
  actionKind: PlannedActionKind
  matchedRuleId: string | null
  decision: ReviewDecision
  resultingReviewState: ReviewState
  safetyFlags: SafetyFlag[]
  conflictStatus: ConflictKind | null
}

export type SuggestionFeedbackObservationDto = {
  kind: 'suggestionFeedback'
  observationId: string
  observedAtEpochMs: number
  schemaVersion: number
  suggestionId: string
  presetId: string
  feedback: LearnerSuggestionFeedbackKind
}

export type LearnerObservationDto =
  | DuplicateKeeperSelectionObservationDto
  | PlannedActionReviewDecisionObservationDto
  | SuggestionFeedbackObservationDto

export interface RecordLearnerSuggestionFeedbackRequest {
  suggestionId: string
  presetId: string
  feedback: LearnerSuggestionFeedbackKind
}

export type DuplicateKeeperPolicySuggestionDto = {
  kind: 'duplicateKeeperPolicySuggestion'
  suggestionId: string
  generatedAtEpochMs: number
  presetId: string
  basedOnObservationCount: number
  agreementCount: number
  disagreementCount: number
  disagreementRate: number
  title: string
  rationale: string
  suggestedAdjustment: string
  representativeNames: string[]
  sampleGroupIds: string[]
  feedback: LearnerSuggestionFeedbackKind | null
  feedbackRecordedAtEpochMs: number | null
}

export type RuleReviewTuningSuggestionDto = {
  kind: 'ruleReviewTuningSuggestion'
  suggestionId: string
  generatedAtEpochMs: number
  presetId: string
  ruleId: string
  basedOnObservationCount: number
  approvalCount: number
  rejectionCount: number
  rejectionRate: number
  title: string
  rationale: string
  suggestedAdjustment: string
  sampleSourcePaths: string[]
  feedback: LearnerSuggestionFeedbackKind | null
  feedbackRecordedAtEpochMs: number | null
}

export type LearnerSuggestionDto =
  | DuplicateKeeperPolicySuggestionDto
  | RuleReviewTuningSuggestionDto

export type DuplicateKeeperPolicyDraftPreviewDto = {
  kind: 'duplicateKeeperPolicyDraft'
  draftId: string
  suggestionId: string
  presetId: string
  presetName: string
  title: string
  summary: string
  beforeDuplicatePolicy: DuplicatePolicy
  afterDuplicatePolicy: DuplicatePolicy
  beforeReviewMode: ReviewMode
  afterReviewMode: ReviewMode
}

export type RuleReviewTuningDraftPreviewDto = {
  kind: 'ruleReviewTuningDraft'
  draftId: string
  suggestionId: string
  presetId: string
  presetName: string
  ruleId: string
  ruleName: string
  title: string
  summary: string
  beforeActionKind: PlannedActionKind
  afterActionKind: PlannedActionKind
  destinationTemplate: string | null
  conditionCount: number
}

export type LearnerDraftPreviewDto =
  | DuplicateKeeperPolicyDraftPreviewDto
  | RuleReviewTuningDraftPreviewDto

export interface SaveLearnerDraftPreviewRequest {
  draftId: string
}

export interface HistoryPageDto {
  page: number
  pageSize: number
  totalEntries: number
  totalPages: number
  entries: HistoryEntryDto[]
}

export interface ScanProgressEvent {
  jobId: string
  discoveredEntries: number
  scannedFiles: number
  scannedDirectories: number
  latestPath: string | null
}

export interface CategoryCountDto {
  category: FileCategory
  count: number
}

export interface StructureSignalDto {
  kind: StructureSignalKind
  description: string
}

export interface DuplicateMemberDto {
  entryId: string
  path: string
}

export interface DuplicateGroupDto {
  groupId: string
  certainty: DuplicateCertainty
  representativeName: string
  sizeBytes: number
  itemCount: number
  members: DuplicateMemberDto[]
}

export interface ProtectionDetectionDto {
  path: string
  state: ProtectionState
  boundaryKind: BoundaryKind
  confidence: number | null
  markers: string[]
  reasons: string[]
}

export interface ProtectionOverrideDto {
  path: string
  overrideKind: ProtectionOverrideKind
}

export interface AnalysisSummaryDto {
  jobId: string
  categoryCounts: CategoryCountDto[]
  structureSignals: StructureSignalDto[]
  unknownCount: number
  noExtensionCount: number
  likelyDuplicateGroups: DuplicateGroupDto[]
  skippedLargeSyntheticFiles: number
  detectedProtections: ProtectionDetectionDto[]
  protectionOverrides: ProtectionOverrideDto[]
}

export interface BuildPlanRequest {
  jobId: string
  presetId: string
}

export interface PresetDefinitionDto {
  presetId: string
  name: string
  description: string
  ruleSet: RuleSetDto
  planOptions: PlanOptionsDto
}

export interface RuleSetDto {
  ruleSetId: string
  name: string
  rules: RuleDto[]
}

export type RuleConditionDto =
  | { kind: 'fileCategory'; category: FileCategory }
  | { kind: 'extensionIn'; extensions: string[] }
  | { kind: 'filenameContains'; value: string }
  | { kind: 'pathContains'; value: string }
  | { kind: 'sizeRange'; minBytes: number | null; maxBytes: number | null }
  | { kind: 'noExtension' }
  | { kind: 'duplicateGroup' }
  | { kind: 'anyOf'; conditions: RuleConditionDto[] }
  | { kind: 'allOf'; conditions: RuleConditionDto[] }
  | { kind: 'always' }

export type PlannedActionKind = 'move' | 'review' | 'skip'

export interface RuleDto {
  ruleId: string
  name: string
  priority: number
  conditions: RuleConditionDto[]
  actionKind: PlannedActionKind
  destinationTemplate: string | null
  explanation: string
}

export type ChecksumMode = 'off' | 'on'
export type DuplicatePolicy = 'flagOnly' | 'informational' | 'fullReview'
export type ReviewMode = 'standard' | 'strict' | 'duplicateFirst'
export type ProjectSafetyMode = 'on' | 'strict'
export type FallbackBehavior = 'skip'

export interface PlanOptionsDto {
  checksumMode: ChecksumMode
  duplicatePolicy: DuplicatePolicy
  reviewMode: ReviewMode
  projectSafetyMode: ProjectSafetyMode
  fallbackBehavior: FallbackBehavior
}

export type ReviewState =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'blocked'
  | 'needsChoice'
  | 'executed'

export type ReviewDecision = 'approve' | 'reject' | 'reset'

export interface UpdateReviewStateRequest {
  planId: string
  actionIds: string[]
  decision: ReviewDecision
}

export interface SetDuplicateKeeperRequest {
  planId: string
  groupId: string
  keeperEntryId: string
}

export interface ExecutePlanRequest {
  planId: string
}

export interface UndoRecordRequest {
  recordId: string
}

export interface UndoSessionRequest {
  sessionId: string
}

export type SafetyFlag = 'protected' | 'duplicate' | 'unknownFile' | 'noExtension'

export type ConflictKind =
  | 'protectionConflict'
  | 'duplicateConflict'
  | 'templateConflict'
  | 'destinationConflict'
  | 'ruleConflict'
  | 'permissionConflict'
  | 'needsUserChoice'

export interface ActionExplanationDto {
  matchedPreset: string
  matchedRule: string | null
  matchedConditions: string[]
  rulePriority: number | null
  confidence: number
  safetyFlags: SafetyFlag[]
  duplicateTier: DuplicateCertainty | null
  protectionState: ProtectionState | null
  blockedReason: string | null
  destinationRoot: string | null
  templateUsed: string | null
  templateError: string | null
  previewedTemplateOutput: string | null
  destinationConflictPath: string | null
  conflictStatus: ConflictKind | null
  notes: string[]
}

export interface PlannedActionDto {
  actionId: string
  sourceEntryId: string
  sourcePath: string
  destinationPath: string | null
  duplicateGroupId: string | null
  actionKind: PlannedActionKind
  reviewState: ReviewState
  explanation: ActionExplanationDto
}

export interface PlanDuplicateGroupDto {
  groupId: string
  certainty: DuplicateCertainty
  representativeName: string
  itemCount: number
  memberActionIds: string[]
  memberEntryIds: string[]
  selectedKeeperEntryId: string | null
  recommendedKeeperEntryId: string | null
  recommendedKeeperReason: string | null
}

export interface PlanSummaryDto {
  totalActions: number
  moveActions: number
  reviewActions: number
  blockedActions: number
  skippedActions: number
}

export interface PlanDto {
  planId: string
  jobId: string
  presetId: string
  presetName: string
  destinationRoot: string
  planOptions: PlanOptionsDto
  summary: PlanSummaryDto
  duplicateGroups: PlanDuplicateGroupDto[]
  actions: PlannedActionDto[]
}

export type ExecutionSessionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'partiallyFailed'
  | 'failed'

export type PreflightIssueSeverity = 'warning' | 'error'

export interface PreflightIssueDto {
  actionId: string | null
  severity: PreflightIssueSeverity
  message: string
}

export type ActionRecordStatus = 'completed' | 'failed' | 'skipped'
export type ExecutionOperationKind = 'execute' | 'undo'

export type ExecutionStrategy =
  | 'sameVolumeMove'
  | 'crossVolumeSafeMove'
  | 'copyOnly'
  | 'duplicateConsolidate'
  | 'deleteToTrash'

export interface ActionRecordDto {
  recordId: string
  sessionId: string
  operationKind: ExecutionOperationKind
  relatedRecordId: string | null
  actionId: string
  sourcePath: string
  destinationPath: string | null
  strategy: ExecutionStrategy
  status: ActionRecordStatus
  message: string | null
  rollbackSafe: boolean
  startedAtEpochMs: number
  finishedAtEpochMs: number
}

export interface ExecutionSessionDto {
  sessionId: string
  planId: string
  operationKind: ExecutionOperationKind
  relatedSessionId: string | null
  status: ExecutionSessionStatus
  startedAtEpochMs: number
  finishedAtEpochMs: number | null
  approvedActionCount: number
  completedActionCount: number
  failedActionCount: number
  skippedActionCount: number
  preflightIssues: PreflightIssueDto[]
  records: ActionRecordDto[]
}

export interface ExecutionProgressEvent {
  sessionId: string
  completedActionCount: number
  totalActions: number
  currentActionId: string | null
  message: string | null
}

export interface ExecutionCompletedEvent {
  sessionId: string
  status: ExecutionSessionStatus
}
