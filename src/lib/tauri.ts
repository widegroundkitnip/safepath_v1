import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { open, save } from '@tauri-apps/plugin-dialog'

import type {
  AnalysisProgressEvent,
  AnalysisSummaryDto,
  AiEvaluationSnapshotDto,
  AppStatusDto,
  DuplicateReviewGroupDetailsDto,
  BuildPlanRequest,
  ExecutePlanRequest,
  ExecutionCompletedEvent,
  ExecutionProgressEvent,
  ExecutionSessionDto,
  GenerateSyntheticDatasetRequest,
  GenerateSyntheticDatasetResultDto,
  HistoryPageDto,
  JobFailedEvent,
  LearnerDraftPreviewDto,
  LearnerObservationDto,
  LearnerSuggestionDto,
  ManifestPageDto,
  PlanDto,
  PlanReadyEvent,
  PreflightIssueDto,
  PresetDefinitionDto,
  ProtectionOverrideDto,
  ProtectionOverrideKind,
  ScanPageReadyEvent,
  ScanStartedEvent,
  RecordLearnerSuggestionFeedbackRequest,
  SaveLearnerDraftPreviewRequest,
  SetDuplicateKeeperRequest,
  DuplicateRunProgressEvent,
  ScanJobStatusDto,
  ScanProgressEvent,
  StartScanRequest,
  UndoRecordRequest,
  UndoSessionRequest,
  UpdateReviewStateRequest,
} from '../types/app'

import * as E2E from './tauriE2eMock'

function hasTauriRuntime() {
  return (
    typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
  )
}

export function isDesktopRuntimeAvailable() {
  if (E2E.isE2eMockEnabled()) {
    return true
  }
  return hasTauriRuntime()
}

/** Tauri `invoke` rejects with a string for `Result::Err` from Rust, not always `Error`. */
export function messageFromInvokeError(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message || fallback
  }
  if (typeof error === 'string' && error.trim().length > 0) {
    return error
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = (error as { message: unknown }).message
    if (typeof msg === 'string' && msg.trim().length > 0) {
      return msg
    }
  }
  return fallback
}

function desktopOnlyError(commandName: string) {
  return new Error(
    `Safepath desktop command "${commandName}" is unavailable in the browser fallback. Launch the Tauri desktop app to scan, review, execute, undo, and persist file-organizing work.`,
  )
}

async function invokeDesktop<T>(commandName: string, args?: Record<string, unknown>): Promise<T> {
  if (!hasTauriRuntime()) {
    throw desktopOnlyError(commandName)
  }

  return invoke<T>(commandName, args)
}

const browserFallback: AppStatusDto = {
  appName: 'Safepath',
  appVersion: '0.1.0',
  platform: 'browser',
  workflowPhase: 'idle',
  permissionsReadiness: {
    state: 'unknown',
    summary: 'Desktop shell not detected. Safepath is showing a browser fallback.',
    details: [
      'Filesystem scanning, plan execution, undo, and learner actions require the Tauri desktop runtime.',
      'Launch the desktop app to use real commands, persisted state, and progress events.',
    ],
  },
  hasSources: false,
  hasDestinations: false,
  sourcePaths: [],
  destinationPaths: [],
}

export async function getAppStatus(): Promise<AppStatusDto> {
  if (E2E.isE2eMockEnabled()) {
    return E2E.e2eGetAppStatus()
  }
  if (!hasTauriRuntime()) {
    return browserFallback
  }

  try {
    return await invoke<AppStatusDto>('get_app_status')
  } catch (error) {
    console.warn('Failed to load Tauri app status, using browser fallback.', error)
    return browserFallback
  }
}

export async function startScan(request: StartScanRequest): Promise<ScanJobStatusDto> {
  if (E2E.isE2eMockEnabled()) {
    return E2E.e2eStartScan(request)
  }
  return invokeDesktop<ScanJobStatusDto>('start_scan', { request })
}

export async function generateSyntheticDataset(
  request: GenerateSyntheticDatasetRequest,
): Promise<GenerateSyntheticDatasetResultDto> {
  if (E2E.isE2eMockEnabled()) {
    return E2E.e2eGenerateSyntheticDataset(request)
  }
  return invokeDesktop<GenerateSyntheticDatasetResultDto>('generate_synthetic_dataset', { request })
}

export async function getPresets(): Promise<PresetDefinitionDto[]> {
  if (E2E.isE2eMockEnabled()) {
    return E2E.e2eGetPresets()
  }
  return invokeDesktop<PresetDefinitionDto[]>('get_presets')
}

export async function buildPlan(request: BuildPlanRequest): Promise<PlanDto> {
  if (E2E.isE2eMockEnabled()) {
    return E2E.e2eBuildPlan(request)
  }
  return invokeDesktop<PlanDto>('build_plan', { request })
}

export async function getPlan(planId: string): Promise<PlanDto | null> {
  if (E2E.isE2eMockEnabled()) {
    return E2E.e2eGetPlan(planId)
  }
  return invokeDesktop<PlanDto | null>('get_plan', { planId })
}

export async function updateReviewState(request: UpdateReviewStateRequest): Promise<PlanDto> {
  if (E2E.isE2eMockEnabled()) {
    return E2E.e2eUpdateReviewState(request)
  }
  return invokeDesktop<PlanDto>('update_review_state', { request })
}

export async function setDuplicateKeeper(request: SetDuplicateKeeperRequest): Promise<PlanDto> {
  if (E2E.isE2eMockEnabled()) {
    return E2E.e2eSetDuplicateKeeper(request)
  }
  return invokeDesktop<PlanDto>('set_duplicate_keeper', { request })
}

export async function getDuplicateReviewGroupDetails(
  planId: string,
  groupId: string,
): Promise<DuplicateReviewGroupDetailsDto> {
  if (E2E.isE2eMockEnabled()) {
    return E2E.e2eGetDuplicateReviewGroupDetails(planId, groupId)
  }
  return invokeDesktop<DuplicateReviewGroupDetailsDto>('get_duplicate_review_group_details', {
    planId,
    groupId,
  })
}

export async function revealPathInFileManager(path: string): Promise<void> {
  if (E2E.isE2eMockEnabled()) {
    return E2E.e2eRevealPathInFileManager(path)
  }
  return invokeDesktop<void>('reveal_path_in_file_manager', { path })
}

export async function executePlan(request: ExecutePlanRequest): Promise<ExecutionSessionDto> {
  if (E2E.isE2eMockEnabled()) {
    return E2E.e2eExecutePlan(request)
  }
  return invokeDesktop<ExecutionSessionDto>('execute_plan', { request })
}

export async function getExecutionPreflight(planId: string): Promise<PreflightIssueDto[]> {
  if (E2E.isE2eMockEnabled()) {
    return E2E.e2eGetExecutionPreflight(planId)
  }
  return invokeDesktop<PreflightIssueDto[]>('get_execution_preflight', { planId })
}

export async function exportDuplicateWorkflowReport(
  planId: string,
  outputPath: string,
): Promise<void> {
  if (E2E.isE2eMockEnabled()) {
    return E2E.e2eExportDuplicateWorkflowReport(planId, outputPath)
  }
  return invokeDesktop<void>('export_duplicate_workflow_report', { planId, outputPath })
}

/** Pick path then export (desktop only). */
export async function exportDuplicateWorkflowReportWithDialog(planId: string): Promise<void> {
  if (!hasTauriRuntime()) {
    throw desktopOnlyError('export_duplicate_workflow_report')
  }
  const path = await save({
    defaultPath: `safepath-duplicate-report-${planId}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (path == null) {
    return
  }
  await exportDuplicateWorkflowReport(planId, path)
}

export async function getExecutionStatus(
  sessionId: string,
): Promise<ExecutionSessionDto | null> {
  if (E2E.isE2eMockEnabled()) {
    return E2E.e2eGetExecutionStatus(sessionId)
  }
  return invokeDesktop<ExecutionSessionDto | null>('get_execution_status', { sessionId })
}

export async function undoRecord(request: UndoRecordRequest): Promise<ExecutionSessionDto> {
  if (E2E.isE2eMockEnabled()) {
    return E2E.e2eUndoRecord(request)
  }
  return invokeDesktop<ExecutionSessionDto>('undo_record', { request })
}

export async function undoSession(request: UndoSessionRequest): Promise<ExecutionSessionDto> {
  if (E2E.isE2eMockEnabled()) {
    return E2E.e2eUndoSession(request)
  }
  return invokeDesktop<ExecutionSessionDto>('undo_session', { request })
}

export async function selectSources(paths: string[]): Promise<AppStatusDto> {
  if (E2E.isE2eMockEnabled()) {
    return E2E.e2eSelectSources(paths)
  }
  return invokeDesktop<AppStatusDto>('select_sources', { paths })
}

export async function selectDestinations(paths: string[]): Promise<AppStatusDto> {
  if (E2E.isE2eMockEnabled()) {
    return E2E.e2eSelectDestinations(paths)
  }
  return invokeDesktop<AppStatusDto>('select_destinations', { paths })
}

export async function pickFolder(): Promise<string | null> {
  if (E2E.isE2eMockEnabled()) {
    return null
  }
  if (!hasTauriRuntime()) {
    return null
  }
  const selected = await open({
    directory: true,
    multiple: false,
    title: 'Select folder',
  })
  return typeof selected === 'string' ? selected : null
}

export async function getScanStatus(jobId: string): Promise<ScanJobStatusDto | null> {
  if (E2E.isE2eMockEnabled()) {
    return E2E.e2eGetScanStatus(jobId)
  }
  return invokeDesktop<ScanJobStatusDto | null>('get_scan_status', { jobId })
}

export async function getDuplicateRunStatus(runId: string): Promise<ScanJobStatusDto | null> {
  if (E2E.isE2eMockEnabled()) {
    return E2E.e2eGetScanStatus(runId)
  }
  return invokeDesktop<ScanJobStatusDto | null>('get_duplicate_run_status', { runId })
}

export async function cancelDuplicateRun(runId: string): Promise<ScanJobStatusDto> {
  if (E2E.isE2eMockEnabled()) {
    return E2E.e2eCancelScan(runId)
  }
  return invokeDesktop<ScanJobStatusDto>('cancel_duplicate_run', { runId })
}

export async function getManifestPage(
  jobId: string,
  page: number,
  pageSize: number,
): Promise<ManifestPageDto> {
  if (E2E.isE2eMockEnabled()) {
    return E2E.e2eGetManifestPage(jobId, page, pageSize)
  }
  return invokeDesktop<ManifestPageDto>('get_manifest_page', { jobId, page, pageSize })
}

export async function getHistoryPage(page: number, pageSize: number): Promise<HistoryPageDto> {
  if (E2E.isE2eMockEnabled()) {
    return E2E.e2eGetHistoryPage(page, pageSize)
  }
  return invokeDesktop<HistoryPageDto>('get_history_page', { page, pageSize })
}

export async function getLearnerObservations(limit: number): Promise<LearnerObservationDto[]> {
  if (E2E.isE2eMockEnabled()) {
    return E2E.e2eGetLearnerObservations(limit)
  }
  return invokeDesktop<LearnerObservationDto[]>('get_learner_observations', { limit })
}

export async function getLearnerSuggestions(
  observationLimit: number,
  suggestionLimit: number,
): Promise<LearnerSuggestionDto[]> {
  if (E2E.isE2eMockEnabled()) {
    return E2E.e2eGetLearnerSuggestions(observationLimit, suggestionLimit)
  }
  return invokeDesktop<LearnerSuggestionDto[]>('get_learner_suggestions', {
    observationLimit,
    suggestionLimit,
  })
}

export async function getLearnerDraftPreviews(
  observationLimit: number,
  suggestionLimit: number,
): Promise<LearnerDraftPreviewDto[]> {
  if (E2E.isE2eMockEnabled()) {
    return E2E.e2eGetLearnerDraftPreviews(observationLimit, suggestionLimit)
  }
  return invokeDesktop<LearnerDraftPreviewDto[]>('get_learner_draft_previews', {
    observationLimit,
    suggestionLimit,
  })
}

export async function getAiEvaluationSnapshot(
  observationLimit: number,
): Promise<AiEvaluationSnapshotDto> {
  if (E2E.isE2eMockEnabled()) {
    return E2E.e2eGetAiEvaluationSnapshot(observationLimit)
  }
  return invokeDesktop<AiEvaluationSnapshotDto>('get_ai_evaluation_snapshot', {
    observationLimit,
  })
}

export async function saveLearnerDraftAsPreset(
  request: SaveLearnerDraftPreviewRequest,
): Promise<PresetDefinitionDto> {
  if (E2E.isE2eMockEnabled()) {
    return E2E.e2eSaveLearnerDraftAsPreset(request)
  }
  return invokeDesktop<PresetDefinitionDto>('save_learner_draft_as_preset', { request })
}

export async function recordLearnerSuggestionFeedback(
  request: RecordLearnerSuggestionFeedbackRequest,
): Promise<void> {
  if (E2E.isE2eMockEnabled()) {
    return E2E.e2eRecordLearnerSuggestionFeedback(request)
  }
  return invokeDesktop<void>('record_learner_suggestion_feedback', { request })
}

export async function cancelScan(jobId: string): Promise<ScanJobStatusDto> {
  if (E2E.isE2eMockEnabled()) {
    return E2E.e2eCancelScan(jobId)
  }
  return invokeDesktop<ScanJobStatusDto>('cancel_scan', { jobId })
}

export async function getAnalysisSummary(jobId: string): Promise<AnalysisSummaryDto | null> {
  if (E2E.isE2eMockEnabled()) {
    return E2E.e2eGetAnalysisSummary(jobId)
  }
  return invokeDesktop<AnalysisSummaryDto | null>('get_analysis_summary', { jobId })
}

export async function setProtectionOverride(
  path: string,
  overrideKind: ProtectionOverrideKind,
): Promise<ProtectionOverrideDto> {
  if (E2E.isE2eMockEnabled()) {
    return E2E.e2eSetProtectionOverride(path, overrideKind)
  }
  return invokeDesktop<ProtectionOverrideDto>('set_protection_override', { path, overrideKind })
}

export async function runExpensiveAnalysis(jobId: string): Promise<void> {
  if (E2E.isE2eMockEnabled()) {
    return E2E.e2eRunExpensiveAnalysis(jobId)
  }
  return invokeDesktop<void>('run_expensive_analysis', { jobId })
}

export async function onScanProgress(
  handler: (payload: ScanProgressEvent) => void,
): Promise<UnlistenFn> {
  if (!hasTauriRuntime()) {
    return () => {}
  }

  return listen<ScanProgressEvent>('scan_progress', (event) => {
    handler(event.payload)
  })
}

export async function onDuplicateRunProgress(
  handler: (payload: DuplicateRunProgressEvent) => void,
): Promise<UnlistenFn> {
  if (!hasTauriRuntime()) {
    return () => {}
  }

  return listen<DuplicateRunProgressEvent>('duplicate_run_progress', (event) => {
    handler(event.payload)
  })
}

export async function onScanStarted(
  handler: (payload: ScanStartedEvent) => void,
): Promise<UnlistenFn> {
  if (!hasTauriRuntime()) {
    return () => {}
  }

  return listen<ScanStartedEvent>('scan_started', (event) => {
    handler(event.payload)
  })
}

export async function onScanPageReady(
  handler: (payload: ScanPageReadyEvent) => void,
): Promise<UnlistenFn> {
  if (!hasTauriRuntime()) {
    return () => {}
  }

  return listen<ScanPageReadyEvent>('scan_page_ready', (event) => {
    handler(event.payload)
  })
}

export async function onAnalysisProgress(
  handler: (payload: AnalysisProgressEvent) => void,
): Promise<UnlistenFn> {
  if (!hasTauriRuntime()) {
    return () => {}
  }

  return listen<AnalysisProgressEvent>('analysis_progress', (event) => {
    handler(event.payload)
  })
}

export async function onPlanReady(handler: (payload: PlanReadyEvent) => void): Promise<UnlistenFn> {
  if (!hasTauriRuntime()) {
    return () => {}
  }

  return listen<PlanReadyEvent>('plan_ready', (event) => {
    handler(event.payload)
  })
}

export async function onJobFailed(handler: (payload: JobFailedEvent) => void): Promise<UnlistenFn> {
  if (!hasTauriRuntime()) {
    return () => {}
  }

  return listen<JobFailedEvent>('job_failed', (event) => {
    handler(event.payload)
  })
}

export async function onExecutionProgress(
  handler: (payload: ExecutionProgressEvent) => void,
): Promise<UnlistenFn> {
  if (!hasTauriRuntime()) {
    return () => {}
  }

  return listen<ExecutionProgressEvent>('execution_progress', (event) => {
    handler(event.payload)
  })
}

export async function onExecutionCompleted(
  handler: (payload: ExecutionCompletedEvent) => void,
): Promise<UnlistenFn> {
  if (!hasTauriRuntime()) {
    return () => {}
  }

  return listen<ExecutionCompletedEvent>('execution_completed', (event) => {
    handler(event.payload)
  })
}
