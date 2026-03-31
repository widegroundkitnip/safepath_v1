import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

import type {
  AnalysisSummaryDto,
  AppStatusDto,
  BuildPlanRequest,
  ExecutePlanRequest,
  ExecutionCompletedEvent,
  ExecutionProgressEvent,
  ExecutionSessionDto,
  GenerateSyntheticDatasetRequest,
  GenerateSyntheticDatasetResultDto,
  HistoryPageDto,
  LearnerDraftPreviewDto,
  LearnerObservationDto,
  LearnerSuggestionDto,
  ManifestPageDto,
  PlanDto,
  PresetDefinitionDto,
  ProtectionOverrideDto,
  ProtectionOverrideKind,
  RecordLearnerSuggestionFeedbackRequest,
  SaveLearnerDraftPreviewRequest,
  SetDuplicateKeeperRequest,
  ScanJobStatusDto,
  ScanProgressEvent,
  StartScanRequest,
  UndoRecordRequest,
  UndoSessionRequest,
  UpdateReviewStateRequest,
} from '../types/app'

function hasTauriRuntime() {
  return (
    typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
  )
}

export function isDesktopRuntimeAvailable() {
  return hasTauriRuntime()
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
  return invokeDesktop<ScanJobStatusDto>('start_scan', { request })
}

export async function generateSyntheticDataset(
  request: GenerateSyntheticDatasetRequest,
): Promise<GenerateSyntheticDatasetResultDto> {
  return invokeDesktop<GenerateSyntheticDatasetResultDto>('generate_synthetic_dataset', { request })
}

export async function getPresets(): Promise<PresetDefinitionDto[]> {
  return invokeDesktop<PresetDefinitionDto[]>('get_presets')
}

export async function buildPlan(request: BuildPlanRequest): Promise<PlanDto> {
  return invokeDesktop<PlanDto>('build_plan', { request })
}

export async function getPlan(planId: string): Promise<PlanDto | null> {
  return invokeDesktop<PlanDto | null>('get_plan', { planId })
}

export async function updateReviewState(request: UpdateReviewStateRequest): Promise<PlanDto> {
  return invokeDesktop<PlanDto>('update_review_state', { request })
}

export async function setDuplicateKeeper(request: SetDuplicateKeeperRequest): Promise<PlanDto> {
  return invokeDesktop<PlanDto>('set_duplicate_keeper', { request })
}

export async function executePlan(request: ExecutePlanRequest): Promise<ExecutionSessionDto> {
  return invokeDesktop<ExecutionSessionDto>('execute_plan', { request })
}

export async function getExecutionStatus(
  sessionId: string,
): Promise<ExecutionSessionDto | null> {
  return invokeDesktop<ExecutionSessionDto | null>('get_execution_status', { sessionId })
}

export async function undoRecord(request: UndoRecordRequest): Promise<ExecutionSessionDto> {
  return invokeDesktop<ExecutionSessionDto>('undo_record', { request })
}

export async function undoSession(request: UndoSessionRequest): Promise<ExecutionSessionDto> {
  return invokeDesktop<ExecutionSessionDto>('undo_session', { request })
}

export async function selectSources(paths: string[]): Promise<AppStatusDto> {
  return invokeDesktop<AppStatusDto>('select_sources', { paths })
}

export async function selectDestinations(paths: string[]): Promise<AppStatusDto> {
  return invokeDesktop<AppStatusDto>('select_destinations', { paths })
}

export async function getScanStatus(jobId: string): Promise<ScanJobStatusDto | null> {
  return invokeDesktop<ScanJobStatusDto | null>('get_scan_status', { jobId })
}

export async function getManifestPage(
  jobId: string,
  page: number,
  pageSize: number,
): Promise<ManifestPageDto> {
  return invokeDesktop<ManifestPageDto>('get_manifest_page', { jobId, page, pageSize })
}

export async function getHistoryPage(page: number, pageSize: number): Promise<HistoryPageDto> {
  return invokeDesktop<HistoryPageDto>('get_history_page', { page, pageSize })
}

export async function getLearnerObservations(limit: number): Promise<LearnerObservationDto[]> {
  return invokeDesktop<LearnerObservationDto[]>('get_learner_observations', { limit })
}

export async function getLearnerSuggestions(
  observationLimit: number,
  suggestionLimit: number,
): Promise<LearnerSuggestionDto[]> {
  return invokeDesktop<LearnerSuggestionDto[]>('get_learner_suggestions', {
    observationLimit,
    suggestionLimit,
  })
}

export async function getLearnerDraftPreviews(
  observationLimit: number,
  suggestionLimit: number,
): Promise<LearnerDraftPreviewDto[]> {
  return invokeDesktop<LearnerDraftPreviewDto[]>('get_learner_draft_previews', {
    observationLimit,
    suggestionLimit,
  })
}

export async function saveLearnerDraftAsPreset(
  request: SaveLearnerDraftPreviewRequest,
): Promise<PresetDefinitionDto> {
  return invokeDesktop<PresetDefinitionDto>('save_learner_draft_as_preset', { request })
}

export async function recordLearnerSuggestionFeedback(
  request: RecordLearnerSuggestionFeedbackRequest,
): Promise<void> {
  return invokeDesktop<void>('record_learner_suggestion_feedback', { request })
}

export async function cancelScan(jobId: string): Promise<ScanJobStatusDto> {
  return invokeDesktop<ScanJobStatusDto>('cancel_scan', { jobId })
}

export async function getAnalysisSummary(jobId: string): Promise<AnalysisSummaryDto | null> {
  return invokeDesktop<AnalysisSummaryDto | null>('get_analysis_summary', { jobId })
}

export async function setProtectionOverride(
  path: string,
  overrideKind: ProtectionOverrideKind,
): Promise<ProtectionOverrideDto> {
  return invokeDesktop<ProtectionOverrideDto>('set_protection_override', { path, overrideKind })
}

export async function runExpensiveAnalysis(jobId: string): Promise<AnalysisSummaryDto> {
  return invokeDesktop<AnalysisSummaryDto>('run_expensive_analysis', { jobId })
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
