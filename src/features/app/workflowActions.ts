import type { MutableRefObject } from 'react'
import type { Dispatch, SetStateAction } from 'react'

import {
  buildPlan,
  cancelScan,
  executePlan,
  generateSyntheticDataset,
  getAiEvaluationSnapshot,
  getAnalysisSummary,
  getAppStatus,
  getExecutionStatus,
  getHistoryPage,
  getLearnerDraftPreviews,
  getLearnerObservations,
  getLearnerSuggestions,
  getPlan,
  getPresets,
  messageFromInvokeError,
  pickFolder,
  recordLearnerSuggestionFeedback,
  revealPathInFileManager,
  runExpensiveAnalysis,
  saveLearnerDraftAsPreset,
  selectDestinations,
  selectSources,
  exportDuplicateWorkflowReportWithDialog,
  setDuplicateKeeper,
  setProtectionOverride,
  startScan,
  undoRecord,
  undoSession,
  updateReviewState,
} from '../../lib/tauri'
import type { AppNavId } from '../../shell/AppLayout'
import type {
  AnalysisSummaryDto,
  AiEvaluationSnapshotDto,
  AppStatusDto,
  ExecutionSessionDto,
  GenerateSyntheticDatasetResultDto,
  HistoryEntryDto,
  HistoryPageDto,
  LearnerDraftPreviewDto,
  ManifestPageDto,
  LearnerObservationDto,
  LearnerSuggestionDto,
  LearnerSuggestionFeedbackKind,
  PlannedActionDto,
  PlanDuplicateGroupDto,
  DuplicateConfig,
  PlanDto,
  PreflightIssueDto,
  PresetDefinitionDto,
  ProtectionOverrideKind,
  ReviewDecision,
  ScanJobStatusDto,
  ScanProgressEvent,
  SyntheticDatasetCategory,
} from '../../types/app'
import { HISTORY_PAGE_SIZE, paginateItems, REVIEW_ACTION_PAGE_SIZE } from './shared'

export interface WorkflowActionDeps {
  draftSourcePaths: string[]
  draftDestinationPaths: string[]
  setStatus: Dispatch<SetStateAction<AppStatusDto | null>>
  setError: Dispatch<SetStateAction<string | null>>
  setSourceInput: Dispatch<SetStateAction<string>>
  setDestinationInput: Dispatch<SetStateAction<string>>
  setSyntheticOutputRoot: Dispatch<SetStateAction<string>>
  setSyntheticCategories: Dispatch<SetStateAction<SyntheticDatasetCategory[]>>
  setActiveNav: Dispatch<SetStateAction<AppNavId>>
  setIsBrowsingSource: Dispatch<SetStateAction<boolean>>
  setIsBrowsingDestination: Dispatch<SetStateAction<boolean>>
  setIsStartingScan: Dispatch<SetStateAction<boolean>>
  setScanProgress: Dispatch<SetStateAction<ScanProgressEvent | null>>
  setAnalysisSummary: Dispatch<SetStateAction<AnalysisSummaryDto | null>>
  setPlan: Dispatch<SetStateAction<PlanDto | null>>
  setExecutionSession: Dispatch<SetStateAction<ExecutionSessionDto | null>>
  setManifestPageIndex: Dispatch<SetStateAction<number>>
  setReviewPageIndex: Dispatch<SetStateAction<number>>
  setReviewGroupPageIndex: Dispatch<SetStateAction<number>>
  setAnalysisDuplicatePageIndex: Dispatch<SetStateAction<number>>
  setProtectionPageIndex: Dispatch<SetStateAction<number>>
  setScanStatus: Dispatch<SetStateAction<ScanJobStatusDto | null>>
  setWorkflowStep: Dispatch<
    SetStateAction<'setup' | 'scanning' | 'results' | 'workspace' | 'complete'>
  >
  setIsRunningExpensiveAnalysis: Dispatch<SetStateAction<boolean>>
  setActiveAnalysisJobId: Dispatch<SetStateAction<string | null>>
  setIsBuildingPlan: Dispatch<SetStateAction<boolean>>
  setActiveReviewBucket: Dispatch<SetStateAction<import('./shared').ReviewBucket>>
  setSelectedActionId: Dispatch<SetStateAction<string | null>>
  setIsUpdatingReview: Dispatch<SetStateAction<boolean>>
  setIsExecutingPlan: Dispatch<SetStateAction<boolean>>
  setExecutionRecordPageIndex: Dispatch<SetStateAction<number>>
  setIsGeneratingSyntheticData: Dispatch<SetStateAction<boolean>>
  setIsSyntheticSourcePending: Dispatch<SetStateAction<boolean>>
  setSyntheticDatasetResult: Dispatch<SetStateAction<GenerateSyntheticDatasetResultDto | null>>
  setIsUndoingHistory: Dispatch<SetStateAction<boolean>>
  setHistoryPage: Dispatch<SetStateAction<HistoryPageDto | null>>
  setHistoryPageIndex: Dispatch<SetStateAction<number>>
  setSelectedHistoryRecordId: Dispatch<SetStateAction<string | null>>
  setSelectedHistorySessionId: Dispatch<SetStateAction<string | null>>
  setSelectedHistorySession: Dispatch<SetStateAction<ExecutionSessionDto | null>>
  setPresets: Dispatch<SetStateAction<PresetDefinitionDto[]>>
  setSelectedPresetId: Dispatch<SetStateAction<string>>
  setLearnerObservations: Dispatch<SetStateAction<LearnerObservationDto[]>>
  setLearnerSuggestions: Dispatch<SetStateAction<LearnerSuggestionDto[]>>
  setLearnerDraftPreviews: Dispatch<SetStateAction<LearnerDraftPreviewDto[]>>
  setAiEvaluationSnapshot: Dispatch<SetStateAction<AiEvaluationSnapshotDto | null>>
  setActiveLearnerSuggestionId: Dispatch<SetStateAction<string | null>>
  setActiveLearnerDraftId: Dispatch<SetStateAction<string | null>>
  setManifestPage: Dispatch<SetStateAction<ManifestPageDto | null>>
  setExecutionPreflightIssues: Dispatch<SetStateAction<PreflightIssueDto[]>>
  scanStatus: ScanJobStatusDto | null
  selectedPresetId: string
  plan: PlanDto | null
  syntheticOutputRoot: string
  syntheticDatasetName: string
  syntheticCategories: SyntheticDatasetCategory[]
  syntheticMaxDepth: number
  syntheticMessinessLevel: number
  syntheticDuplicateRatePercent: number
  syntheticIncludeHiddenFiles: boolean
  syntheticIncludeEmptyFolders: boolean
  syntheticTargetApparentSizeBytes: number
  selectedHistoryRecord: HistoryEntryDto | null
  selectedHistorySession: ExecutionSessionDto | null
  filteredPlanActions: PlannedActionDto[]
  analysisSummary: AnalysisSummaryDto | null
  wasExecutingPlanRef: MutableRefObject<boolean>
  loadExecutionPreflight: (planId: string, surfaceErrors?: boolean) => Promise<PreflightIssueDto[] | null>
  duplicateConfigForNextScan: DuplicateConfig
}

export async function syncSelections(
  d: Pick<
    WorkflowActionDeps,
    'draftSourcePaths' | 'draftDestinationPaths' | 'setStatus'
  >,
  nextSourcePaths: string[] = d.draftSourcePaths,
  nextDestinationPaths: string[] = d.draftDestinationPaths,
) {
  const nextSourceStatus = await selectSources(nextSourcePaths)
  const nextStatus = await selectDestinations(nextDestinationPaths)
  d.setStatus(nextStatus)

  if (!nextSourceStatus.sourcePaths.every((path, index) => path === nextStatus.sourcePaths[index])) {
    d.setStatus(await getAppStatus())
  }

  return nextStatus
}

export async function loadLearnerInsights(
  d: Pick<
    WorkflowActionDeps,
    | 'setLearnerObservations'
    | 'setLearnerSuggestions'
    | 'setLearnerDraftPreviews'
    | 'setAiEvaluationSnapshot'
  >,
) {
  const [observations, suggestions, drafts, evaluationSnapshot] = await Promise.all([
    getLearnerObservations(16),
    getLearnerSuggestions(200, 8),
    getLearnerDraftPreviews(200, 8),
    getAiEvaluationSnapshot(5000),
  ])
  d.setLearnerObservations(observations)
  d.setLearnerSuggestions(suggestions)
  d.setLearnerDraftPreviews(drafts)
  d.setAiEvaluationSnapshot(evaluationSnapshot)
}

export function toggleSyntheticCategory(
  d: Pick<WorkflowActionDeps, 'setSyntheticCategories'>,
  category: SyntheticDatasetCategory,
) {
  d.setSyntheticCategories((current) => {
    if (current.includes(category)) {
      return current.filter((item) => item !== category)
    }
    return [...current, category]
  })
}

export async function handleBrowseSourceFolder(d: WorkflowActionDeps) {
  d.setError(null)
  d.setIsBrowsingSource(true)
  try {
    const selected = await pickFolder()
    if (!selected) {
      return
    }
    const nextSourcePaths = Array.from(new Set([...d.draftSourcePaths, selected]))
    d.setSourceInput(nextSourcePaths.join('\n'))
    const nextStatus = await syncSelections(
      { ...d, draftSourcePaths: nextSourcePaths },
      nextSourcePaths,
      d.draftDestinationPaths,
    )
    d.setStatus(nextStatus)
  } catch (nextError) {
    d.setError(nextError instanceof Error ? nextError.message : 'Failed to select source folder.')
  } finally {
    d.setIsBrowsingSource(false)
  }
}

export async function handleBrowseDestinationFolder(d: WorkflowActionDeps) {
  d.setError(null)
  d.setIsBrowsingDestination(true)
  try {
    const selected = await pickFolder()
    if (!selected) {
      return
    }
    d.setDestinationInput(selected)
    const nextStatus = await syncSelections(d, d.draftSourcePaths, [selected])
    d.setStatus(nextStatus)
  } catch (nextError) {
    d.setError(nextError instanceof Error ? nextError.message : 'Failed to select destination folder.')
  } finally {
    d.setIsBrowsingDestination(false)
  }
}

export async function handleBrowseSyntheticOutputFolder(d: WorkflowActionDeps) {
  d.setError(null)
  try {
    const selected = await pickFolder()
    if (selected) {
      d.setSyntheticOutputRoot(selected)
    }
  } catch (nextError) {
    d.setError(
      nextError instanceof Error ? nextError.message : 'Failed to select synthetic output folder.',
    )
  }
}

export async function startScanFlow(
  d: WorkflowActionDeps,
  nextSourcePaths: string[] = d.draftSourcePaths,
  nextDestinationPaths: string[] = d.draftDestinationPaths,
) {
  if (nextSourcePaths.length === 0) {
    d.setError('Enter at least one source path to scan.')
    return
  }

  if (nextDestinationPaths.length === 0) {
    d.setError('Enter a destination folder before scanning.')
    return
  }

  d.setError(null)
  d.setIsStartingScan(true)
  d.setScanProgress(null)
  d.setAnalysisSummary(null)
  d.setPlan(null)
  d.setExecutionSession(null)
  d.setManifestPageIndex(0)
  d.setReviewPageIndex(0)
  d.setReviewGroupPageIndex(0)
  d.setAnalysisDuplicatePageIndex(0)
  d.setProtectionPageIndex(0)

  try {
    const nextStatus = await syncSelections({ ...d, draftSourcePaths: nextSourcePaths, draftDestinationPaths: nextDestinationPaths }, nextSourcePaths, nextDestinationPaths)
    if (nextStatus.permissionsReadiness.state !== 'ready') {
      d.setError(nextStatus.permissionsReadiness.summary)
      return
    }

    const nextScanStatus = await startScan({
      sourcePaths: nextSourcePaths,
      duplicateConfig: d.duplicateConfigForNextScan,
    })
    d.setScanStatus(nextScanStatus)
    d.setWorkflowStep('scanning')
    d.setStatus(await getAppStatus())
  } catch (nextError) {
    d.setError(nextError instanceof Error ? nextError.message : 'Failed to start scan.')
  } finally {
    d.setIsStartingScan(false)
  }
}

export async function applySyntheticDatasetAsSource(d: WorkflowActionDeps, rootPath: string) {
  d.setError(null)
  d.setIsSyntheticSourcePending(true)

  try {
    d.setSourceInput(rootPath)
    const nextStatus = await selectSources([rootPath])
    d.setStatus(nextStatus)
    d.setActiveNav('workflow')
  } catch (nextError) {
    d.setError(
      nextError instanceof Error ? nextError.message : 'Failed to apply synthetic dataset source.',
    )
  } finally {
    d.setIsSyntheticSourcePending(false)
  }
}

export async function handleGenerateSyntheticDataset(d: WorkflowActionDeps) {
  if (d.syntheticOutputRoot.trim().length === 0) {
    d.setError('Enter an output root folder for the synthetic dataset.')
    return
  }

  if (d.syntheticCategories.length === 0) {
    d.setError('Select at least one category for the synthetic dataset.')
    return
  }

  d.setError(null)
  d.setIsGeneratingSyntheticData(true)

  try {
    const result = await generateSyntheticDataset({
      outputRoot: d.syntheticOutputRoot.trim(),
      datasetName: d.syntheticDatasetName.trim() || 'Safepath Synthetic Dataset',
      categories: d.syntheticCategories,
      maxDepth: d.syntheticMaxDepth,
      messinessLevel: d.syntheticMessinessLevel,
      duplicateRatePercent: d.syntheticDuplicateRatePercent,
      includeHiddenFiles: d.syntheticIncludeHiddenFiles,
      includeEmptyFolders: d.syntheticIncludeEmptyFolders,
      targetApparentSizeBytes: d.syntheticTargetApparentSizeBytes,
    })
    d.setSyntheticDatasetResult(result)
  } catch (nextError) {
    d.setError(messageFromInvokeError(nextError, 'Failed to generate synthetic data.'))
  } finally {
    d.setIsGeneratingSyntheticData(false)
  }
}

export async function handleGenerateAndScanSyntheticDataset(d: WorkflowActionDeps) {
  if (d.draftDestinationPaths.length === 0) {
    d.setError('Enter a destination folder before generating and scanning synthetic data.')
    return
  }

  d.setError(null)
  d.setIsGeneratingSyntheticData(true)

  try {
    const result = await generateSyntheticDataset({
      outputRoot: d.syntheticOutputRoot.trim(),
      datasetName: d.syntheticDatasetName.trim() || 'Safepath Synthetic Dataset',
      categories: d.syntheticCategories,
      maxDepth: d.syntheticMaxDepth,
      messinessLevel: d.syntheticMessinessLevel,
      duplicateRatePercent: d.syntheticDuplicateRatePercent,
      includeHiddenFiles: d.syntheticIncludeHiddenFiles,
      includeEmptyFolders: d.syntheticIncludeEmptyFolders,
      targetApparentSizeBytes: d.syntheticTargetApparentSizeBytes,
    })
    d.setSyntheticDatasetResult(result)
    d.setSourceInput(result.rootPath)
    d.setActiveNav('workflow')
    await startScanFlow(
      { ...d, draftSourcePaths: [result.rootPath], draftDestinationPaths: d.draftDestinationPaths },
      [result.rootPath],
      d.draftDestinationPaths,
    )
  } catch (nextError) {
    d.setError(messageFromInvokeError(nextError, 'Failed to generate and scan synthetic data.'))
  } finally {
    d.setIsGeneratingSyntheticData(false)
  }
}

export async function handleCancelScan(d: WorkflowActionDeps) {
  if (!d.scanStatus?.jobId) {
    return
  }

  try {
    const nextStatus = await cancelScan(d.scanStatus.jobId)
    d.setScanStatus(nextStatus)
    d.setStatus(await getAppStatus())
  } catch (nextError) {
    d.setError(nextError instanceof Error ? nextError.message : 'Failed to cancel scan.')
  }
}

export async function handleRunExpensiveAnalysis(d: WorkflowActionDeps) {
  if (!d.scanStatus?.jobId) {
    return
  }

  d.setError(null)
  d.setIsRunningExpensiveAnalysis(true)
  try {
    d.setActiveAnalysisJobId(d.scanStatus.jobId)
    await runExpensiveAnalysis(d.scanStatus.jobId)
  } catch (nextError) {
    d.setActiveAnalysisJobId(null)
    d.setError(nextError instanceof Error ? nextError.message : 'Failed to run expensive analysis.')
    d.setIsRunningExpensiveAnalysis(false)
  }
}

export async function handleBuildPlan(d: WorkflowActionDeps) {
  if (!d.scanStatus?.jobId || !d.selectedPresetId) {
    return
  }

  d.setError(null)
  d.setIsBuildingPlan(true)
  try {
    const nextPlan = await buildPlan({
      jobId: d.scanStatus.jobId,
      presetId: d.selectedPresetId,
    })
    d.setPlan(nextPlan)
    d.setWorkflowStep('workspace')
    d.setActiveReviewBucket('all')
    d.setReviewPageIndex(0)
    d.setReviewGroupPageIndex(0)
    d.setSelectedActionId(nextPlan.actions[0]?.actionId ?? null)
    d.setExecutionSession(null)
    d.setStatus(await getAppStatus())
  } catch (nextError) {
    d.setError(nextError instanceof Error ? nextError.message : 'Failed to build plan.')
  } finally {
    d.setIsBuildingPlan(false)
  }
}

export async function applyProtectionOverride(
  d: Pick<WorkflowActionDeps, 'setError' | 'setAnalysisSummary' | 'scanStatus'>,
  path: string,
  overrideKind: ProtectionOverrideKind,
) {
  try {
    await setProtectionOverride(path, overrideKind)
    if (d.scanStatus?.jobId) {
      const summary = await getAnalysisSummary(d.scanStatus.jobId)
      d.setAnalysisSummary(summary)
    }
  } catch (nextError) {
    d.setError(nextError instanceof Error ? nextError.message : 'Failed to persist protection override.')
  }
}

export async function handleProtectPath(d: WorkflowActionDeps, path: string) {
  await applyProtectionOverride(d, path, 'userProtected')
}

export async function handleApplyStructureProtection(
  d: WorkflowActionDeps,
  path: string,
  overrideKind: ProtectionOverrideKind,
) {
  await applyProtectionOverride(d, path, overrideKind)
}

export function isPathOverridden(
  d: Pick<WorkflowActionDeps, 'analysisSummary'>,
  path: string,
): boolean {
  return d.analysisSummary?.protectionOverrides.some((item) => item.path === path) ?? false
}

export async function handleRefreshPlan(d: Pick<WorkflowActionDeps, 'plan' | 'setPlan'>) {
  if (!d.plan?.planId) {
    return
  }

  const nextPlan = await getPlan(d.plan.planId)
  if (nextPlan) {
    d.setPlan(nextPlan)
  }
}

export async function handleReviewDecision(
  d: WorkflowActionDeps,
  actionIds: string[],
  decision: ReviewDecision,
) {
  if (!d.plan?.planId || actionIds.length === 0) {
    return
  }

  d.setError(null)
  d.setIsUpdatingReview(true)
  try {
    const nextPlan = await updateReviewState({
      planId: d.plan.planId,
      actionIds,
      decision,
    })
    d.setPlan(nextPlan)
    d.setExecutionSession(null)
  } catch (nextError) {
    d.setError(nextError instanceof Error ? nextError.message : 'Failed to update review state.')
    await handleRefreshPlan(d)
  } finally {
    d.setIsUpdatingReview(false)
  }
}

export async function handleExportDuplicateWorkflowReport(
  d: Pick<WorkflowActionDeps, 'plan' | 'setError'>,
) {
  if (!d.plan?.planId) {
    return
  }

  d.setError(null)
  try {
    await exportDuplicateWorkflowReportWithDialog(d.plan.planId)
  } catch (nextError) {
    d.setError(
      messageFromInvokeError(nextError, 'Failed to export duplicate workflow report.'),
    )
  }
}

export async function handleApplyRecommendedDuplicateKeepers(d: WorkflowActionDeps) {
  if (!d.plan?.planId) {
    return
  }

  const targets = d.plan.duplicateGroups.filter(
    (group) => !group.selectedKeeperEntryId && group.recommendedKeeperEntryId,
  )
  if (targets.length === 0) {
    return
  }

  d.setError(null)
  d.setIsUpdatingReview(true)
  try {
    let current = d.plan
    for (const group of targets) {
      const keeperEntryId = group.recommendedKeeperEntryId as string
      current = await setDuplicateKeeper({
        planId: current.planId,
        groupId: group.groupId,
        keeperEntryId,
      })
    }
    d.setPlan(current)
    await loadLearnerInsights(d)
    d.setExecutionSession(null)
    await d.loadExecutionPreflight(current.planId, false)
  } catch (nextError) {
    d.setError(
      nextError instanceof Error ? nextError.message : 'Failed to apply recommended duplicate keepers.',
    )
    await handleRefreshPlan(d)
  } finally {
    d.setIsUpdatingReview(false)
  }
}

export async function handleSetDuplicateKeeper(
  d: WorkflowActionDeps,
  group: PlanDuplicateGroupDto,
  keeperEntryId: string,
) {
  if (!d.plan?.planId) {
    return
  }

  d.setError(null)
  d.setIsUpdatingReview(true)
  try {
    const nextPlan = await setDuplicateKeeper({
      planId: d.plan.planId,
      groupId: group.groupId,
      keeperEntryId,
    })
    d.setPlan(nextPlan)
    await loadLearnerInsights(d)
    d.setExecutionSession(null)
  } catch (nextError) {
    d.setError(nextError instanceof Error ? nextError.message : 'Failed to update duplicate keeper.')
    await handleRefreshPlan(d)
  } finally {
    d.setIsUpdatingReview(false)
  }
}

export async function handleRevealPath(d: Pick<WorkflowActionDeps, 'setError'>, path: string) {
  d.setError(null)
  try {
    await revealPathInFileManager(path)
  } catch (nextError) {
    d.setError(messageFromInvokeError(nextError, 'Failed to reveal the selected path.'))
  }
}

export async function handleLearnerSuggestionFeedback(
  d: WorkflowActionDeps,
  suggestion: LearnerSuggestionDto,
  feedback: LearnerSuggestionFeedbackKind,
) {
  d.setError(null)
  d.setActiveLearnerSuggestionId(suggestion.suggestionId)
  try {
    await recordLearnerSuggestionFeedback({
      suggestionId: suggestion.suggestionId,
      presetId: suggestion.presetId,
      feedback,
    })
    await loadLearnerInsights(d)
  } catch (nextError) {
    d.setError(nextError instanceof Error ? nextError.message : 'Failed to record learner feedback.')
  } finally {
    d.setActiveLearnerSuggestionId(null)
  }
}

export async function handleSaveLearnerDraftPreview(d: WorkflowActionDeps, draft: LearnerDraftPreviewDto) {
  d.setError(null)
  d.setActiveLearnerDraftId(draft.draftId)
  try {
    const savedPreset = await saveLearnerDraftAsPreset({ draftId: draft.draftId })
    const nextPresets = await getPresets()
    d.setPresets(nextPresets)
    d.setSelectedPresetId(savedPreset.presetId)
    await loadLearnerInsights(d)
  } catch (nextError) {
    d.setError(nextError instanceof Error ? nextError.message : 'Failed to save learner draft.')
  } finally {
    d.setActiveLearnerDraftId(null)
  }
}

export async function handleExecutePlan(d: WorkflowActionDeps) {
  if (!d.plan?.planId) {
    return
  }

  d.setError(null)
  d.setIsExecutingPlan(true)
  d.setExecutionRecordPageIndex(0)
  try {
    const latestPreflightIssues = await d.loadExecutionPreflight(d.plan.planId)
    if (!latestPreflightIssues) {
      d.wasExecutingPlanRef.current = false
      d.setIsExecutingPlan(false)
      return
    }
    if (latestPreflightIssues.some((issue) => issue.severity === 'error')) {
      d.wasExecutingPlanRef.current = false
      d.setIsExecutingPlan(false)
      return
    }

    const session = await executePlan({ planId: d.plan.planId })
    d.setExecutionSession(session)
    if (session.status !== 'pending' && session.status !== 'running') {
      const persistedSession = await getExecutionStatus(session.sessionId)
      d.setExecutionSession(persistedSession ?? session)
      await handleRefreshPlan(d)
      d.setStatus(await getAppStatus())
      d.setIsExecutingPlan(false)
    }
  } catch (nextError) {
    d.setError(nextError instanceof Error ? nextError.message : 'Failed to execute plan.')
    d.wasExecutingPlanRef.current = false
    d.setIsExecutingPlan(false)
  }
}

export function handleSelectHistoryEntry(
  d: Pick<WorkflowActionDeps, 'setSelectedHistoryRecordId' | 'setSelectedHistorySessionId'>,
  entry: HistoryEntryDto,
) {
  d.setSelectedHistoryRecordId(entry.recordId)
  d.setSelectedHistorySessionId(entry.sessionId)
}

export function handleChangeReviewPage(
  d: Pick<WorkflowActionDeps, 'filteredPlanActions' | 'setReviewPageIndex' | 'setSelectedActionId'>,
  nextPage: number,
) {
  const nextSlice = paginateItems(d.filteredPlanActions, nextPage, REVIEW_ACTION_PAGE_SIZE)
  d.setReviewPageIndex(nextSlice.page)
  d.setSelectedActionId(nextSlice.items[0]?.actionId ?? null)
}

export async function refreshHistorySelection(
  d: Pick<
    WorkflowActionDeps,
    | 'setHistoryPage'
    | 'setHistoryPageIndex'
    | 'setSelectedHistoryRecordId'
    | 'setSelectedHistorySessionId'
    | 'setSelectedHistorySession'
  >,
  nextRecordId: string | null,
  nextSessionId: string | null,
  nextPageIndex = 0,
) {
  const page = await getHistoryPage(nextPageIndex, HISTORY_PAGE_SIZE)
  d.setHistoryPage(page)
  d.setHistoryPageIndex(nextPageIndex)
  d.setSelectedHistoryRecordId(nextRecordId)
  d.setSelectedHistorySessionId(nextSessionId)

  if (nextSessionId) {
    d.setSelectedHistorySession(await getExecutionStatus(nextSessionId))
  } else {
    d.setSelectedHistorySession(null)
  }
}

export async function handleUndoSelectedRecord(d: WorkflowActionDeps) {
  if (!d.selectedHistoryRecord) {
    return
  }

  d.setError(null)
  d.setIsUndoingHistory(true)
  try {
    const undoRun = await undoRecord({ recordId: d.selectedHistoryRecord.recordId })
    const undoRecordId = undoRun.records[0]?.recordId ?? null
    d.setExecutionSession(undoRun)
    await refreshHistorySelection(d, undoRecordId, undoRun.sessionId, 0)
    const nextPlan = await getPlan(undoRun.planId)
    if (nextPlan) {
      d.setPlan(nextPlan)
      d.setWorkflowStep('workspace')
    }
    d.setStatus(await getAppStatus())
  } catch (nextError) {
    d.setError(nextError instanceof Error ? nextError.message : 'Failed to undo action record.')
  } finally {
    d.setIsUndoingHistory(false)
  }
}

export async function handleUndoSelectedSession(d: WorkflowActionDeps) {
  if (!d.selectedHistorySession) {
    return
  }

  d.setError(null)
  d.setIsUndoingHistory(true)
  try {
    const undoRun = await undoSession({ sessionId: d.selectedHistorySession.sessionId })
    const lastUndoRecord = undoRun.records[undoRun.records.length - 1] ?? null
    d.setExecutionSession(undoRun)
    await refreshHistorySelection(d, lastUndoRecord?.recordId ?? null, undoRun.sessionId, 0)
    const nextPlan = await getPlan(undoRun.planId)
    if (nextPlan) {
      d.setPlan(nextPlan)
      d.setWorkflowStep('workspace')
    }
    d.setStatus(await getAppStatus())
  } catch (nextError) {
    d.setError(nextError instanceof Error ? nextError.message : 'Failed to undo session.')
  } finally {
    d.setIsUndoingHistory(false)
  }
}

export async function handleStartOver(d: WorkflowActionDeps) {
  d.setError(null)
  try {
    if (d.scanStatus?.jobId && d.scanStatus.status === 'running') {
      await cancelScan(d.scanStatus.jobId)
    }
  } catch (nextError) {
    d.setError(nextError instanceof Error ? nextError.message : 'Failed to cancel scan.')
  }
  d.setWorkflowStep('setup')
  d.setPlan(null)
  d.setExecutionSession(null)
  d.setAnalysisSummary(null)
  d.setScanStatus(null)
  d.setScanProgress(null)
  d.setManifestPage(null)
  d.setExecutionPreflightIssues([])
  d.setManifestPageIndex(0)
  d.wasExecutingPlanRef.current = false
  try {
    const next = await getAppStatus()
    d.setStatus(next)
    d.setSourceInput(next.sourcePaths.join('\n'))
    d.setDestinationInput(next.destinationPaths[0] ?? '')
  } catch {
    /* ignore */
  }
  d.setActiveNav('workflow')
}
