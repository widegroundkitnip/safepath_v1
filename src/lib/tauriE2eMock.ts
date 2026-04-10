import type {
  ActionExplanationDto,
  ActionRecordDto,
  AiEvaluationSnapshotDto,
  AnalysisSummaryDto,
  AppStatusDto,
  WorkflowPhase,
  BuildPlanRequest,
  DuplicateReviewGroupDetailsDto,
  ExecutePlanRequest,
  ExecutionSessionDto,
  GenerateSyntheticDatasetRequest,
  GenerateSyntheticDatasetResultDto,
  HistoryEntryDto,
  HistoryPageDto,
  HistorySessionSummaryDto,
  LearnerDraftPreviewDto,
  LearnerObservationDto,
  LearnerSuggestionDto,
  ManifestPageDto,
  PlanDto,
  PreflightIssueDto,
  PresetDefinitionDto,
  ProtectionOverrideDto,
  ProtectionOverrideKind,
  RecordLearnerSuggestionFeedbackRequest,
  SaveLearnerDraftPreviewRequest,
  ScanJobStatusDto,
  SetDuplicateKeeperRequest,
  StartScanRequest,
  UndoRecordRequest,
  UndoSessionRequest,
  ReviewState,
  UpdateReviewStateRequest,
} from '../types/app'

const E2E_PRESET_ID = 'e2e-mock-preset'

let sourcePaths: string[] = []
let destinationPaths: string[] = []
let activeScan: ScanJobStatusDto | null = null
let storedPlan: PlanDto | null = null
let historyEntries: HistoryEntryDto[] = []
const executionSessionsById = new Map<string, ExecutionSessionDto>()
let e2eIdSeq = 0

function nextE2eId(prefix: string): string {
  e2eIdSeq += 1
  return `${prefix}-${Date.now()}-${e2eIdSeq}`
}

function buildHistorySessionSummary(session: ExecutionSessionDto): HistorySessionSummaryDto {
  return {
    sessionId: session.sessionId,
    planId: session.planId,
    operationKind: session.operationKind,
    relatedSessionId: session.relatedSessionId,
    status: session.status,
    startedAtEpochMs: session.startedAtEpochMs,
    finishedAtEpochMs: session.finishedAtEpochMs,
    approvedActionCount: session.approvedActionCount,
    completedActionCount: session.completedActionCount,
    failedActionCount: session.failedActionCount,
    skippedActionCount: session.skippedActionCount,
  }
}

export function isE2eMockEnabled(): boolean {
  return import.meta.env.VITE_E2E_MOCK === 'true'
}

function destinationRoot(): string {
  return destinationPaths[0] ?? '/e2e/destination'
}

function makeExplanation(): ActionExplanationDto {
  return {
    matchedPreset: E2E_PRESET_ID,
    matchedRule: null,
    matchedConditions: [],
    rulePriority: null,
    confidence: 0.85,
    safetyFlags: [],
    duplicateTier: null,
    protectionState: null,
    blockedReason: null,
    destinationRoot: destinationRoot(),
    templateUsed: null,
    templateError: null,
    previewedTemplateOutput: null,
    destinationConflictPath: null,
    conflictStatus: null,
    notes: [],
  }
}

function workflowPhaseForStatus(): WorkflowPhase {
  if (storedPlan) {
    return 'planning'
  }
  if (activeScan) {
    return 'scanning'
  }
  return 'idle'
}

function buildAppStatus(): AppStatusDto {
  const hasPaths = sourcePaths.length > 0 && destinationPaths.length > 0
  return {
    appName: 'Safepath',
    appVersion: '0.1.0',
    platform: 'e2e-mock',
    workflowPhase: workflowPhaseForStatus(),
    permissionsReadiness: {
      state: hasPaths ? 'ready' : 'unknown',
      summary: hasPaths ? 'E2E mock — ready to scan.' : 'Enter source and destination paths.',
      details: hasPaths ? [] : ['Add at least one source path and a destination folder.'],
    },
    hasSources: sourcePaths.length > 0,
    hasDestinations: destinationPaths.length > 0,
    sourcePaths: [...sourcePaths],
    destinationPaths: [...destinationPaths],
  }
}

function mockAnalysisSummary(jobId: string): AnalysisSummaryDto {
  return {
    jobId,
    categoryCounts: [{ category: 'document', count: 3 }],
    structureSignals: [],
    unknownCount: 0,
    noExtensionCount: 0,
    likelyDuplicateGroups: [],
    skippedLargeSyntheticFiles: 0,
    detectedProtections: [],
    protectionOverrides: [],
    aiAssistedSuggestions: [],
  }
}

function mockPreset(): PresetDefinitionDto {
  return {
    presetId: E2E_PRESET_ID,
    name: 'E2E mock preset',
    description: 'Deterministic preset for Playwright.',
    ruleSet: { ruleSetId: 'e2e-rules', name: 'E2E', rules: [] },
    planOptions: {
      checksumMode: 'off',
      duplicatePolicy: 'informational',
      reviewMode: 'standard',
      projectSafetyMode: 'on',
      fallbackBehavior: 'skip',
    },
  }
}

export async function e2eGetAppStatus(): Promise<AppStatusDto> {
  return buildAppStatus()
}

export async function e2eSelectSources(paths: string[]): Promise<AppStatusDto> {
  sourcePaths = [...paths]
  return buildAppStatus()
}

export async function e2eSelectDestinations(paths: string[]): Promise<AppStatusDto> {
  destinationPaths = [...paths]
  return buildAppStatus()
}

export async function e2eGetPresets(): Promise<PresetDefinitionDto[]> {
  return [mockPreset()]
}

export async function e2eStartScan(request: StartScanRequest): Promise<ScanJobStatusDto> {
  const jobId = `e2e-job-${Date.now()}`
  activeScan = {
    jobId,
    status: 'completed',
    sourcePaths: [...request.sourcePaths],
    discoveredEntries: 12,
    scannedFiles: 10,
    scannedDirectories: 2,
    pageSize: 100,
    startedAtEpochMs: Date.now(),
    finishedAtEpochMs: Date.now(),
    errorMessage: null,
  }
  storedPlan = null
  historyEntries = []
  executionSessionsById.clear()
  return activeScan
}

export async function e2eGetScanStatus(jobId: string): Promise<ScanJobStatusDto | null> {
  if (activeScan?.jobId === jobId) {
    return activeScan
  }
  return null
}

export async function e2eCancelScan(jobId: string): Promise<ScanJobStatusDto> {
  if (activeScan?.jobId === jobId) {
    activeScan = { ...activeScan, status: 'cancelled', finishedAtEpochMs: Date.now() }
    return activeScan
  }
  throw new Error('Unknown job')
}

export async function e2eGetManifestPage(
  jobId: string,
  page: number,
  pageSize: number,
): Promise<ManifestPageDto> {
  return {
    jobId,
    page,
    pageSize,
    totalEntries: 0,
    totalPages: 0,
    entries: [],
  }
}

export async function e2eGetAnalysisSummary(jobId: string): Promise<AnalysisSummaryDto | null> {
  if (activeScan?.jobId === jobId) {
    return mockAnalysisSummary(jobId)
  }
  return null
}

export async function e2eBuildPlan(request: BuildPlanRequest): Promise<PlanDto> {
  const dest = destinationRoot()
  const plan: PlanDto = {
    planId: 'e2e-plan-1',
    jobId: request.jobId,
    presetId: request.presetId,
    presetName: 'E2E mock preset',
    destinationRoot: dest,
    planOptions: mockPreset().planOptions,
    summary: {
      totalActions: 1,
      moveActions: 1,
      reviewActions: 0,
      blockedActions: 0,
      skippedActions: 0,
    },
    duplicateGroups: [],
    actions: [
      {
        actionId: 'e2e-action-1',
        sourceEntryId: 'e2e-entry-1',
        sourcePath: '/e2e/source/example.txt',
        destinationPath: `${dest}/example.txt`,
        duplicateGroupId: null,
        actionKind: 'move',
        reviewState: 'pending',
        explanation: makeExplanation(),
      },
    ],
  }
  storedPlan = plan
  return plan
}

export async function e2eGetPlan(planId: string): Promise<PlanDto | null> {
  if (storedPlan?.planId === planId) {
    return storedPlan
  }
  return null
}

export async function e2eUpdateReviewState(request: UpdateReviewStateRequest): Promise<PlanDto> {
  if (!storedPlan || storedPlan.planId !== request.planId) {
    throw new Error('No plan')
  }
  const nextActions = storedPlan.actions.map((action) => {
    if (!request.actionIds.includes(action.actionId)) {
      return action
    }
    const nextState: ReviewState =
      request.decision === 'approve'
        ? 'approved'
        : request.decision === 'reject'
          ? 'rejected'
          : 'pending'
    return { ...action, reviewState: nextState }
  })
  const nextPlan: PlanDto = { ...storedPlan, actions: nextActions }
  storedPlan = nextPlan
  return nextPlan
}

export async function e2eSetDuplicateKeeper(request: SetDuplicateKeeperRequest): Promise<PlanDto> {
  if (!storedPlan || storedPlan.planId !== request.planId) {
    throw new Error('No plan')
  }
  return storedPlan
}

export async function e2eGetDuplicateReviewGroupDetails(
  _planId: string,
  groupId: string,
): Promise<DuplicateReviewGroupDetailsDto> {
  return {
    groupId,
    representativeName: 'E2E group',
    certainty: 'likely',
    itemCount: 0,
    selectedKeeperEntryId: null,
    recommendedKeeperEntryId: null,
    recommendedKeeperReason: null,
    recommendedKeeperConfidence: null,
    recommendedKeeperReasonTags: [],
    members: [],
  }
}

export async function e2eGetExecutionPreflight(_planId: string): Promise<PreflightIssueDto[]> {
  if (typeof window !== 'undefined') {
    const win = window as Window & { __SP_E2E_PREFLIGHT_ERROR__?: boolean }
    if (win.__SP_E2E_PREFLIGHT_ERROR__) {
      return [
        {
          actionId: 'e2e-action-1',
          severity: 'error',
          message: 'Mock preflight error for E2E.',
        },
      ]
    }
  }
  return []
}

export async function e2eExecutePlan(_request: ExecutePlanRequest): Promise<ExecutionSessionDto> {
  const now = Date.now()
  const sessionId = nextE2eId('e2e-session')
  const planId = storedPlan?.planId ?? 'e2e-plan-1'
  const action = storedPlan?.actions[0]
  const recordId = action ? nextE2eId('e2e-record') : null

  const record: ActionRecordDto | null = action && recordId
    ? {
        recordId,
        sessionId,
        operationKind: 'execute',
        relatedRecordId: null,
        actionId: action.actionId,
        sourcePath: action.sourcePath,
        destinationPath: action.destinationPath,
        strategy: 'sameVolumeMove',
        status: 'completed',
        message: null,
        rollbackSafe: true,
        startedAtEpochMs: now,
        finishedAtEpochMs: now,
      }
    : null

  const session: ExecutionSessionDto = {
    sessionId,
    planId,
    operationKind: 'execute',
    relatedSessionId: null,
    status: 'completed',
    startedAtEpochMs: now,
    finishedAtEpochMs: now,
    approvedActionCount: action ? 1 : 0,
    completedActionCount: action ? 1 : 0,
    failedActionCount: 0,
    skippedActionCount: 0,
    preflightIssues: [],
    records: record ? [record] : [],
  }
  executionSessionsById.set(sessionId, session)

  if (action && record && recordId) {
    historyEntries.push({
      recordId,
      sessionId,
      operationKind: 'execute',
      actionId: action.actionId,
      sourcePath: action.sourcePath,
      destinationPath: action.destinationPath,
      strategy: 'sameVolumeMove',
      status: 'completed',
      message: null,
      rollbackSafe: true,
      startedAtEpochMs: now,
      finishedAtEpochMs: now,
      undoEligible: true,
      undoBlockedReason: null,
      session: buildHistorySessionSummary(session),
    })
  }

  return session
}

export async function e2eGetExecutionStatus(
  sessionId: string,
): Promise<ExecutionSessionDto | null> {
  return executionSessionsById.get(sessionId) ?? null
}

export async function e2eRevealPathInFileManager(_path: string): Promise<void> {}

export async function e2eGetHistoryPage(page: number, pageSize: number): Promise<HistoryPageDto> {
  const totalEntries = historyEntries.length
  const totalPages = totalEntries === 0 ? 0 : Math.ceil(totalEntries / pageSize)
  const start = page * pageSize
  const entries = historyEntries.slice(start, start + pageSize)
  return {
    page,
    pageSize,
    totalEntries,
    totalPages,
    entries,
  }
}

export async function e2eGetLearnerObservations(_limit: number): Promise<LearnerObservationDto[]> {
  return []
}

export async function e2eGetLearnerSuggestions(
  _observationLimit: number,
  _suggestionLimit: number,
): Promise<LearnerSuggestionDto[]> {
  return []
}

export async function e2eGetLearnerDraftPreviews(
  _observationLimit: number,
  _suggestionLimit: number,
): Promise<LearnerDraftPreviewDto[]> {
  return []
}

export async function e2eGetAiEvaluationSnapshot(
  _observationLimit: number,
): Promise<AiEvaluationSnapshotDto> {
  return {
    generatedAtEpochMs: Date.now(),
    totalObservationCount: 0,
    tasks: [],
    notes: [],
  }
}

export async function e2eSaveLearnerDraftAsPreset(
  _request: SaveLearnerDraftPreviewRequest,
): Promise<PresetDefinitionDto> {
  return mockPreset()
}

export async function e2eRecordLearnerSuggestionFeedback(
  _request: RecordLearnerSuggestionFeedbackRequest,
): Promise<void> {}

export async function e2eRunExpensiveAnalysis(_jobId: string): Promise<void> {}

export async function e2eSetProtectionOverride(
  path: string,
  overrideKind: ProtectionOverrideKind,
): Promise<ProtectionOverrideDto> {
  return { path, overrideKind }
}

export async function e2eGenerateSyntheticDataset(
  _request: GenerateSyntheticDatasetRequest,
): Promise<GenerateSyntheticDatasetResultDto> {
  throw new Error('Synthetic dataset generation is not mocked in E2E.')
}

export async function e2eUndoRecord(request: UndoRecordRequest): Promise<ExecutionSessionDto> {
  const idx = historyEntries.findIndex((e) => e.recordId === request.recordId)
  if (idx < 0) {
    throw new Error('Unknown history record')
  }
  const entry = historyEntries[idx]
  if (entry.operationKind === 'undo') {
    throw new Error('Cannot undo an undo record in E2E mock')
  }
  if (!entry.undoEligible) {
    throw new Error('Record is not eligible for undo in E2E mock')
  }

  const now = Date.now()
  const undoSessionId = nextE2eId('e2e-undo-session')
  const undoRecordId = nextE2eId('e2e-undo-record')
  const planId = entry.session.planId

  const undoActionRecord: ActionRecordDto = {
    recordId: undoRecordId,
    sessionId: undoSessionId,
    operationKind: 'undo',
    relatedRecordId: request.recordId,
    actionId: entry.actionId,
    sourcePath: entry.destinationPath ?? entry.sourcePath,
    destinationPath: entry.sourcePath,
    strategy: entry.strategy,
    status: 'completed',
    message: null,
    rollbackSafe: false,
    startedAtEpochMs: now,
    finishedAtEpochMs: now,
  }

  const undoSession: ExecutionSessionDto = {
    sessionId: undoSessionId,
    planId,
    operationKind: 'undo',
    relatedSessionId: entry.sessionId,
    status: 'completed',
    startedAtEpochMs: now,
    finishedAtEpochMs: now,
    approvedActionCount: 1,
    completedActionCount: 1,
    failedActionCount: 0,
    skippedActionCount: 0,
    preflightIssues: [],
    records: [undoActionRecord],
  }
  executionSessionsById.set(undoSessionId, undoSession)

  historyEntries[idx] = {
    ...entry,
    undoEligible: false,
    undoBlockedReason: 'Undone (E2E mock).',
  }

  historyEntries.push({
    recordId: undoRecordId,
    sessionId: undoSessionId,
    operationKind: 'undo',
    actionId: entry.actionId,
    sourcePath: entry.destinationPath ?? entry.sourcePath,
    destinationPath: entry.sourcePath,
    strategy: entry.strategy,
    status: 'completed',
    message: null,
    rollbackSafe: false,
    startedAtEpochMs: now,
    finishedAtEpochMs: now,
    undoEligible: false,
    undoBlockedReason: null,
    session: buildHistorySessionSummary(undoSession),
  })

  return undoSession
}

export async function e2eUndoSession(request: UndoSessionRequest): Promise<ExecutionSessionDto> {
  const sessId = request.sessionId
  const executeTargets = historyEntries.filter(
    (e) => e.sessionId === sessId && e.operationKind === 'execute',
  )
  if (executeTargets.length === 0) {
    throw new Error('No execute records found for session in E2E mock')
  }

  const now = Date.now()
  const undoSessionId = nextE2eId('e2e-undo-session')
  const planId = executeTargets[0].session.planId

  const undoRecords: ActionRecordDto[] = executeTargets.map((entry) => {
    const urid = nextE2eId('e2e-undo-record')
    return {
      recordId: urid,
      sessionId: undoSessionId,
      operationKind: 'undo',
      relatedRecordId: entry.recordId,
      actionId: entry.actionId,
      sourcePath: entry.destinationPath ?? entry.sourcePath,
      destinationPath: entry.sourcePath,
      strategy: entry.strategy,
      status: 'completed',
      message: null,
      rollbackSafe: false,
      startedAtEpochMs: now,
      finishedAtEpochMs: now,
    }
  })

  const undoSession: ExecutionSessionDto = {
    sessionId: undoSessionId,
    planId,
    operationKind: 'undo',
    relatedSessionId: sessId,
    status: 'completed',
    startedAtEpochMs: now,
    finishedAtEpochMs: now,
    approvedActionCount: undoRecords.length,
    completedActionCount: undoRecords.length,
    failedActionCount: 0,
    skippedActionCount: 0,
    preflightIssues: [],
    records: undoRecords,
  }
  executionSessionsById.set(undoSessionId, undoSession)

  for (const target of executeTargets) {
    const i = historyEntries.findIndex((e) => e.recordId === target.recordId)
    if (i >= 0) {
      historyEntries[i] = {
        ...historyEntries[i],
        undoEligible: false,
        undoBlockedReason: 'Session undone (E2E mock).',
      }
    }
  }

  for (let i = 0; i < executeTargets.length; i += 1) {
    const entry = executeTargets[i]
    const ar = undoRecords[i]
    historyEntries.push({
      recordId: ar.recordId,
      sessionId: undoSessionId,
      operationKind: 'undo',
      actionId: entry.actionId,
      sourcePath: entry.destinationPath ?? entry.sourcePath,
      destinationPath: entry.sourcePath,
      strategy: entry.strategy,
      status: 'completed',
      message: null,
      rollbackSafe: false,
      startedAtEpochMs: now,
      finishedAtEpochMs: now,
      undoEligible: false,
      undoBlockedReason: null,
      session: buildHistorySessionSummary(undoSession),
    })
  }

  return undoSession
}
