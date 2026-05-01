import { useCallback, useMemo, useRef, useState } from 'react'

import '../../App.css'
import { AppLayout, type AppNavId } from '../../shell/AppLayout'
import { getWorkflowPhaseLabel, getWorkflowStepperActiveIndex } from '../../shell/getWorkflowPhaseLabel'
import { getExecutionPreflight, isDesktopRuntimeAvailable } from '../../lib/tauri'
import type {
  AnalysisSummaryDto,
  AiEvaluationSnapshotDto,
  AppStatusDto,
  DuplicateReviewGroupDetailsDto,
  ExecutionSessionDto,
  GenerateSyntheticDatasetResultDto,
  HistoryPageDto,
  LearnerDraftPreviewDto,
  LearnerObservationDto,
  LearnerSuggestionDto,
  ManifestPageDto,
  PlanDto,
  PreflightIssueDto,
  PresetDefinitionDto,
  ScanJobStatusDto,
  ScanProgressEvent,
  SyntheticDatasetCategory,
} from '../../types/app'
import {
  duplicateConfigFromAdvancedForm,
  duplicateConfigFromSimple,
  type DuplicateGroupScope,
  type ExecutionSafetyTier,
  type KeeperPreference,
  type MatchingStrategy,
  type SimpleDuplicateMode,
  type SimpleStrictness,
} from '../../types/duplicateConfig'
import {
  actionMatchesBucket,
  ANALYSIS_DUPLICATE_PAGE_SIZE,
  buildDestinationImpactPreview,
  EXECUTION_RECORD_PAGE_SIZE,
  type DestinationFolderPreview,
  HISTORY_SESSION_RECORD_PAGE_SIZE,
  isDuplicateKeeperObservation,
  isPlannedActionReviewDecisionObservation,
  isSuggestionFeedbackObservation,
  paginateItems,
  parsePaths,
  PROTECTION_PAGE_SIZE,
  REVIEW_ACTION_PAGE_SIZE,
  REVIEW_GROUP_PAGE_SIZE,
  type ReviewBucket,
} from './shared'
import { useAppBootstrap } from './hooks/useAppBootstrap'
import { useExecutionSessionSync } from './hooks/useExecutionSessionSync'
import { useHistoryTabEffects } from './hooks/useHistoryTabEffects'
import { usePaginationResets } from './hooks/usePaginationResets'
import { usePlanReviewEffects } from './hooks/usePlanReviewEffects'
import { useScanWorkflowEffects } from './hooks/useScanWorkflowEffects'
import { useWorkflowStepEffects } from './hooks/useWorkflowStepEffects'
import { WorkflowAppLayoutContent, type WorkflowAppLayoutContentProps } from './WorkflowAppLayoutContent'
import * as workflowActions from './workflowActions'

export function WorkflowApp() {
  const [activeNav, setActiveNav] = useState<AppNavId>('workflow')
  const [workflowStep, setWorkflowStep] = useState<
    'setup' | 'scanning' | 'results' | 'workspace' | 'complete'
  >('setup')
  const [uiMode, setUiMode] = useState<'simple' | 'advanced'>('simple')
  const [status, setStatus] = useState<AppStatusDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sourceInput, setSourceInput] = useState('')
  const [destinationInput, setDestinationInput] = useState('')
  const [scanStatus, setScanStatus] = useState<ScanJobStatusDto | null>(null)
  const [scanProgress, setScanProgress] = useState<ScanProgressEvent | null>(null)
  const [manifestPage, setManifestPage] = useState<ManifestPageDto | null>(null)
  const [manifestPageIndex, setManifestPageIndex] = useState(0)
  const [analysisSummary, setAnalysisSummary] = useState<AnalysisSummaryDto | null>(null)
  const [presets, setPresets] = useState<PresetDefinitionDto[]>([])
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const [plan, setPlan] = useState<PlanDto | null>(null)
  const [executionSession, setExecutionSession] = useState<ExecutionSessionDto | null>(null)
  const [executionPreflightIssues, setExecutionPreflightIssues] = useState<PreflightIssueDto[]>([])
  const [reviewPageIndex, setReviewPageIndex] = useState(0)
  const [reviewGroupPageIndex, setReviewGroupPageIndex] = useState(0)
  const [selectedDuplicateGroupId, setSelectedDuplicateGroupId] = useState<string | null>(null)
  const [duplicateGroupDetails, setDuplicateGroupDetails] =
    useState<DuplicateReviewGroupDetailsDto | null>(null)
  const [showAllDestinationPreviewFolders, setShowAllDestinationPreviewFolders] = useState(false)
  const [analysisDuplicatePageIndex, setAnalysisDuplicatePageIndex] = useState(0)
  const [protectionPageIndex, setProtectionPageIndex] = useState(0)
  const [executionRecordPageIndex, setExecutionRecordPageIndex] = useState(0)
  const [historyPage, setHistoryPage] = useState<HistoryPageDto | null>(null)
  const [learnerDraftPreviews, setLearnerDraftPreviews] = useState<LearnerDraftPreviewDto[]>([])
  const [learnerObservations, setLearnerObservations] = useState<LearnerObservationDto[]>([])
  const [learnerSuggestions, setLearnerSuggestions] = useState<LearnerSuggestionDto[]>([])
  const [aiEvaluationSnapshot, setAiEvaluationSnapshot] = useState<AiEvaluationSnapshotDto | null>(null)
  const [historyPageIndex, setHistoryPageIndex] = useState(0)
  const [selectedHistoryRecordId, setSelectedHistoryRecordId] = useState<string | null>(null)
  const [selectedHistorySessionId, setSelectedHistorySessionId] = useState<string | null>(null)
  const [selectedHistorySession, setSelectedHistorySession] = useState<ExecutionSessionDto | null>(null)
  const [historySessionRecordPageIndex, setHistorySessionRecordPageIndex] = useState(0)
  const [activeReviewBucket, setActiveReviewBucket] = useState<ReviewBucket>('all')
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null)
  const [isStartingScan, setIsStartingScan] = useState(false)
  const [isBrowsingSource, setIsBrowsingSource] = useState(false)
  const [isBrowsingDestination, setIsBrowsingDestination] = useState(false)
  const [isRunningExpensiveAnalysis, setIsRunningExpensiveAnalysis] = useState(false)
  const [activeAnalysisJobId, setActiveAnalysisJobId] = useState<string | null>(null)
  const [isBuildingPlan, setIsBuildingPlan] = useState(false)
  const [isUpdatingReview, setIsUpdatingReview] = useState(false)
  const [isExecutingPlan, setIsExecutingPlan] = useState(false)
  const wasExecutingPlanRef = useRef(false)
  const [isLoadingExecutionPreflight, setIsLoadingExecutionPreflight] = useState(false)
  const [isLoadingDuplicateGroupDetails, setIsLoadingDuplicateGroupDetails] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [isUndoingHistory, setIsUndoingHistory] = useState(false)
  const [activeLearnerSuggestionId, setActiveLearnerSuggestionId] = useState<string | null>(null)
  const [activeLearnerDraftId, setActiveLearnerDraftId] = useState<string | null>(null)
  const [syntheticOutputRoot, setSyntheticOutputRoot] = useState('')
  const [syntheticDatasetName, setSyntheticDatasetName] = useState('Safepath Synthetic Dataset')
  const [syntheticCategories, setSyntheticCategories] = useState<SyntheticDatasetCategory[]>([
    'documents',
    'pdfs',
    'images',
    'rawImages',
    'videos',
    'archives',
    'audio',
    'codeProjects',
    'mixedClutter',
  ])
  const [syntheticMaxDepth, setSyntheticMaxDepth] = useState(4)
  const [syntheticMessinessLevel, setSyntheticMessinessLevel] = useState(4)
  const [syntheticDuplicateRatePercent, setSyntheticDuplicateRatePercent] = useState(18)
  const [syntheticIncludeHiddenFiles, setSyntheticIncludeHiddenFiles] = useState(true)
  const [syntheticIncludeEmptyFolders, setSyntheticIncludeEmptyFolders] = useState(true)
  const [syntheticTargetApparentSizeBytes, setSyntheticTargetApparentSizeBytes] = useState(
    1024 ** 4,
  )
  const [isGeneratingSyntheticData, setIsGeneratingSyntheticData] = useState(false)
  const [isSyntheticSourcePending, setIsSyntheticSourcePending] = useState(false)
  const [syntheticDatasetResult, setSyntheticDatasetResult] =
    useState<GenerateSyntheticDatasetResultDto | null>(null)
  const [dupSimpleMode, setDupSimpleMode] = useState<SimpleDuplicateMode>('exactDuplicates')
  const [dupSimpleStrictness, setDupSimpleStrictness] = useState<SimpleStrictness>('balanced')
  const [dupKeeperPreference, setDupKeeperPreference] = useState<KeeperPreference>('newest')
  const [dupIgnoreSmallFiles, setDupIgnoreSmallFiles] = useState(false)
  const [dupIgnoreHiddenSystem, setDupIgnoreHiddenSystem] = useState(true)
  const [dupGroupByFolder, setDupGroupByFolder] = useState(false)
  const [advancedDupStrategy, setAdvancedDupStrategy] = useState<MatchingStrategy>('hybrid')
  const [advancedDupKeeper, setAdvancedDupKeeper] = useState<KeeperPreference>('newest')
  const [advancedDupIncludeHidden, setAdvancedDupIncludeHidden] = useState(true)
  const [advancedDupIgnoreJunk, setAdvancedDupIgnoreJunk] = useState(true)
  const [advancedDupGroupByFolder, setAdvancedDupGroupByFolder] = useState(false)
  const [advancedDupScope, setAdvancedDupScope] = useState<DuplicateGroupScope>('external')
  const [advancedDupImages, setAdvancedDupImages] = useState(false)
  const [advancedDupSafetyTier, setAdvancedDupSafetyTier] =
    useState<ExecutionSafetyTier>('safeHold')
  const [advancedDupMaxSimilarFiles, setAdvancedDupMaxSimilarFiles] = useState(5000)
  const [advancedDupMaxPairwise, setAdvancedDupMaxPairwise] = useState(50000)
  const [advancedDupTimeoutMsRaw, setAdvancedDupTimeoutMsRaw] = useState('')

  const draftSourcePaths = useMemo(() => parsePaths(sourceInput), [sourceInput])
  const draftDestinationPath = useMemo(() => parsePaths(destinationInput)[0] ?? '', [destinationInput])
  const draftDestinationPaths = useMemo(
    () => (draftDestinationPath ? [draftDestinationPath] : []),
    [draftDestinationPath],
  )
  const canAttemptScan = draftSourcePaths.length > 0 && draftDestinationPaths.length > 0
  const filteredPlanActions = useMemo(() => {
    if (!plan) {
      return []
    }

    return plan.actions.filter((action) => actionMatchesBucket(action, activeReviewBucket))
  }, [plan, activeReviewBucket])
  const reviewActionPage = useMemo(
    () => paginateItems(filteredPlanActions, reviewPageIndex, REVIEW_ACTION_PAGE_SIZE),
    [filteredPlanActions, reviewPageIndex],
  )
  const reviewGroupPage = useMemo(
    () => paginateItems(plan?.duplicateGroups ?? [], reviewGroupPageIndex, REVIEW_GROUP_PAGE_SIZE),
    [plan?.duplicateGroups, reviewGroupPageIndex],
  )
  const destinationImpactPreview = useMemo(
    () => (plan ? buildDestinationImpactPreview(plan) : null),
    [plan],
  )
  const visibleDestinationPreviewFolders = useMemo(() => {
    if (!destinationImpactPreview) {
      return [] as DestinationFolderPreview[]
    }
    return showAllDestinationPreviewFolders
      ? destinationImpactPreview.folders
      : destinationImpactPreview.folders.slice(0, 5)
  }, [destinationImpactPreview, showAllDestinationPreviewFolders])
  const analysisDuplicatePage = useMemo(
    () =>
      paginateItems(
        analysisSummary?.likelyDuplicateGroups ?? [],
        analysisDuplicatePageIndex,
        ANALYSIS_DUPLICATE_PAGE_SIZE,
      ),
    [analysisSummary?.likelyDuplicateGroups, analysisDuplicatePageIndex],
  )
  const protectionPage = useMemo(
    () =>
      paginateItems(
        analysisSummary?.detectedProtections ?? [],
        protectionPageIndex,
        PROTECTION_PAGE_SIZE,
      ),
    [analysisSummary?.detectedProtections, protectionPageIndex],
  )
  const executionRecordPage = useMemo(
    () =>
      paginateItems(
        executionSession?.records ?? [],
        executionRecordPageIndex,
        EXECUTION_RECORD_PAGE_SIZE,
      ),
    [executionSession?.records, executionRecordPageIndex],
  )
  const historySessionRecordPage = useMemo(
    () =>
      paginateItems(
        selectedHistorySession?.records ?? [],
        historySessionRecordPageIndex,
        HISTORY_SESSION_RECORD_PAGE_SIZE,
      ),
    [selectedHistorySession?.records, historySessionRecordPageIndex],
  )
  const selectedAction =
    filteredPlanActions.find((action) => action.actionId === selectedActionId) ??
    filteredPlanActions[0] ??
    null
  const selectedDuplicateGroup =
    plan?.duplicateGroups.find((group) => group.groupId === selectedDuplicateGroupId) ??
    reviewGroupPage.items[0] ??
    null
  const approvedActionCount =
    plan?.actions.filter((action) => action.reviewState === 'approved').length ?? 0
  const executionPreflightErrors = useMemo(
    () => executionPreflightIssues.filter((issue) => issue.severity === 'error'),
    [executionPreflightIssues],
  )
  const executionPreflightWarnings = useMemo(
    () => executionPreflightIssues.filter((issue) => issue.severity === 'warning'),
    [executionPreflightIssues],
  )
  const hasExecutionPreflightErrors = executionPreflightErrors.length > 0
  const executionIsActive =
    isExecutingPlan ||
    executionSession?.status === 'pending' ||
    executionSession?.status === 'running'

  const loadExecutionPreflight = useCallback(async (planId: string, surfaceErrors = true) => {
    setIsLoadingExecutionPreflight(true)
    try {
      const issues = await getExecutionPreflight(planId)
      setExecutionPreflightIssues(issues)
      return issues
    } catch (nextError) {
      if (surfaceErrors) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : 'Failed to load execution readiness checks.',
        )
      }
      return null
    } finally {
      setIsLoadingExecutionPreflight(false)
    }
  }, [])

  useAppBootstrap({
    setStatus,
    setError,
    setSourceInput,
    setDestinationInput,
    setPresets,
    setSelectedPresetId,
    setLearnerObservations,
    setLearnerSuggestions,
    setLearnerDraftPreviews,
    setAiEvaluationSnapshot,
  })

  useScanWorkflowEffects({
    scanStatus,
    setScanStatus,
    setScanProgress,
    setError,
    manifestPageIndex,
    setManifestPage,
    setManifestPageIndex,
    setAnalysisSummary,
    setStatus,
    activeAnalysisJobId,
    setActiveAnalysisJobId,
    setIsRunningExpensiveAnalysis,
  })

  usePlanReviewEffects({
    plan,
    filteredPlanActions,
    selectedActionId,
    setSelectedActionId,
    setExecutionPreflightIssues,
    setSelectedDuplicateGroupId,
    setDuplicateGroupDetails,
    setReviewPageIndex,
    setReviewGroupPageIndex,
    setShowAllDestinationPreviewFolders,
    reviewGroupPageItems: reviewGroupPage.items,
    selectedDuplicateGroupId,
    selectedDuplicateGroup,
    setIsLoadingDuplicateGroupDetails,
    setError,
    approvedActionCount,
    executionIsActive,
    loadExecutionPreflight,
    activeReviewBucket,
    uiMode,
    setActiveReviewBucket,
  })

  useExecutionSessionSync({
    executionSession,
    setExecutionSession,
    setIsExecutingPlan,
    setPlan,
    setStatus,
    setError,
  })

  useHistoryTabEffects({
    activeNav,
    historyPageIndex,
    setIsLoadingHistory,
    setHistoryPage,
    setError,
    historyPage,
    selectedHistoryRecordId,
    setSelectedHistoryRecordId,
    setSelectedHistorySessionId,
    selectedHistorySessionId,
    setSelectedHistorySession,
  })

  usePaginationResets({
    selectedHistorySession,
    setHistorySessionRecordPageIndex,
    executionSession,
    setExecutionRecordPageIndex,
    analysisSummary,
    setAnalysisDuplicatePageIndex,
    setProtectionPageIndex,
  })

  useWorkflowStepEffects({
    scanStatus,
    workflowStep,
    setWorkflowStep,
    plan,
    activeNav,
    isExecutingPlan,
    executionSession,
    wasExecutingPlanRef,
  })

  const selectedHistoryRecord =
    historyPage?.entries.find((entry) => entry.recordId === selectedHistoryRecordId) ?? null
  const duplicateKeeperObservations = useMemo(
    () => learnerObservations.filter(isDuplicateKeeperObservation),
    [learnerObservations],
  )
  const ruleReviewDecisionObservations = useMemo(
    () => learnerObservations.filter(isPlannedActionReviewDecisionObservation),
    [learnerObservations],
  )
  const learnerSuggestionFeedbackEvents = useMemo(
    () => learnerObservations.filter(isSuggestionFeedbackObservation),
    [learnerObservations],
  )
  const currentSourceProfileKind = useMemo(
    () =>
      analysisSummary?.aiAssistedSuggestions.find((suggestion) => suggestion.kind === 'sourceProfile')
        ?.sourceProfileKind ?? null,
    [analysisSummary?.aiAssistedSuggestions],
  )
  const advancedDupAnalysisTimeoutMs = useMemo(() => {
    const t = advancedDupTimeoutMsRaw.trim()
    if (t === '') {
      return null
    }
    const n = Number(t)
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null
  }, [advancedDupTimeoutMsRaw])

  const duplicateConfigForNextScan = useMemo(() => {
    if (uiMode === 'advanced') {
      return duplicateConfigFromAdvancedForm({
        matchingStrategy: advancedDupStrategy,
        keeperPreference: advancedDupKeeper,
        includeHidden: advancedDupIncludeHidden,
        ignoreSystemJunk: advancedDupIgnoreJunk,
        groupByParentFolder: advancedDupGroupByFolder,
        scope: advancedDupScope,
        imagesModule: advancedDupImages,
        safetyTier: advancedDupSafetyTier,
        maxFilesForSimilarity: advancedDupMaxSimilarFiles,
        maxPairwiseComparisons: advancedDupMaxPairwise,
        analysisTimeoutMs: advancedDupAnalysisTimeoutMs,
      })
    }
    return duplicateConfigFromSimple(
      dupSimpleMode,
      dupSimpleStrictness,
      dupKeeperPreference,
      dupIgnoreSmallFiles,
      dupIgnoreHiddenSystem,
      dupGroupByFolder,
    )
  }, [
    uiMode,
    advancedDupStrategy,
    advancedDupKeeper,
    advancedDupIncludeHidden,
    advancedDupIgnoreJunk,
    advancedDupGroupByFolder,
    advancedDupScope,
    advancedDupImages,
    advancedDupSafetyTier,
    advancedDupMaxSimilarFiles,
    advancedDupMaxPairwise,
    advancedDupAnalysisTimeoutMs,
    dupSimpleMode,
    dupSimpleStrictness,
    dupKeeperPreference,
    dupIgnoreSmallFiles,
    dupIgnoreHiddenSystem,
    dupGroupByFolder,
  ])

  const duplicateScanPreviewLines = useMemo(() => {
    const c = duplicateConfigForNextScan
    const strategyLabel: Record<MatchingStrategy, string> = {
      exactHash: 'Exact content hash',
      fastNameSize: 'Fast name + size buckets',
      hybrid: 'Hybrid (name/size + hash confirmation)',
      similar: 'Similarity-oriented (budget-limited)',
      metadataOnly: 'Metadata-only matching',
    }
    const lines: string[] = [
      `Matching: ${strategyLabel[c.matchingStrategy]}`,
      `Keeper preference: ${c.keeper.preference}${c.keeper.allowAutoKeeper ? '' : ' — manual keeper selection'}`,
      `${c.filters.includeHidden ? 'Includes' : 'Excludes'} hidden files; ${c.filters.ignoreSystemJunk ? 'skips' : 'includes'} common system junk files`,
    ]
    if (c.filters.groupByParentFolder) {
      lines.push('Prefers grouping duplicates that share the same parent folder.')
    }
    lines.push(
      c.grouping.scope === 'perSourceRoot'
        ? 'Duplicate groups stay within each source root.'
        : 'Duplicate groups may span all selected sources.',
    )
    if (uiMode === 'simple') {
      lines.push('Simple mode keeps execution in the safe-hold tier (non-destructive).')
    } else {
      lines.push(`Execution safety tier: ${c.execution.safetyTier}`)
      lines.push(
        `Performance guardrails: up to ${c.limits.maxFilesForSimilarity.toLocaleString()} files for similarity work, ${c.limits.maxPairwiseComparisons.toLocaleString()} pairwise comparisons.`,
      )
      if (c.limits.analysisTimeoutMs != null) {
        lines.push(`Analysis time budget: ${c.limits.analysisTimeoutMs.toLocaleString()} ms (best effort).`)
      }
      if (c.mediaModules.imagesEnabled) {
        lines.push('Image module enabled for similarity-style signals where configured.')
      }
    }
    return lines
  }, [duplicateConfigForNextScan, uiMode])

  const workflowPreferenceSuggestions = useMemo(
    () =>
      learnerSuggestions.filter(
        (
          suggestion,
        ): suggestion is Extract<
          LearnerSuggestionDto,
          { kind: 'presetAffinitySuggestion' | 'reviewModePreferenceSuggestion' }
        > => {
        if (
          suggestion.kind === 'presetAffinitySuggestion' &&
          currentSourceProfileKind &&
          suggestion.sourceProfileKind === currentSourceProfileKind
        ) {
          return true
        }

        return (
          suggestion.kind === 'reviewModePreferenceSuggestion' &&
          suggestion.presetId === selectedPresetId
        )
        },
      ),
    [currentSourceProfileKind, learnerSuggestions, selectedPresetId],
  )

  const workflowDeps = {
    draftSourcePaths,
    draftDestinationPaths,
    setStatus,
    setError,
    setSourceInput,
    setDestinationInput,
    setSyntheticOutputRoot,
    setSyntheticCategories,
    setActiveNav,
    setIsBrowsingSource,
    setIsBrowsingDestination,
    setIsStartingScan,
    setScanProgress,
    setAnalysisSummary,
    setPlan,
    setExecutionSession,
    setManifestPageIndex,
    setReviewPageIndex,
    setReviewGroupPageIndex,
    setAnalysisDuplicatePageIndex,
    setProtectionPageIndex,
    setScanStatus,
    setWorkflowStep,
    setIsRunningExpensiveAnalysis,
    setActiveAnalysisJobId,
    setIsBuildingPlan,
    setActiveReviewBucket,
    setSelectedActionId,
    setIsUpdatingReview,
    setIsExecutingPlan,
    setExecutionRecordPageIndex,
    setIsGeneratingSyntheticData,
    setIsSyntheticSourcePending,
    setSyntheticDatasetResult,
    setIsUndoingHistory,
    setHistoryPage,
    setHistoryPageIndex,
    setSelectedHistoryRecordId,
    setSelectedHistorySessionId,
    setSelectedHistorySession,
    setPresets,
    setSelectedPresetId,
    setLearnerObservations,
    setLearnerSuggestions,
    setLearnerDraftPreviews,
    setAiEvaluationSnapshot,
    setActiveLearnerSuggestionId,
    setActiveLearnerDraftId,
    setManifestPage,
    setExecutionPreflightIssues,
    scanStatus,
    selectedPresetId,
    plan,
    syntheticOutputRoot,
    syntheticDatasetName,
    syntheticCategories,
    syntheticMaxDepth,
    syntheticMessinessLevel,
    syntheticDuplicateRatePercent,
    syntheticIncludeHiddenFiles,
    syntheticIncludeEmptyFolders,
    syntheticTargetApparentSizeBytes,
    selectedHistoryRecord,
    selectedHistorySession,
    filteredPlanActions,
    analysisSummary,
    wasExecutingPlanRef,
    loadExecutionPreflight,
    duplicateConfigForNextScan,
  } satisfies workflowActions.WorkflowActionDeps

  const phaseLabelParams = useMemo(
    () => ({
      activeNav,
      workflowStep,
      plan,
      scanStatus,
      executionSession,
      executionIsActive,
      backendWorkflowPhase: status?.workflowPhase,
    }),
    [
      activeNav,
      workflowStep,
      plan,
      scanStatus,
      executionSession,
      executionIsActive,
      status?.workflowPhase,
    ],
  )

  const phaseLabel = useMemo(() => getWorkflowPhaseLabel(phaseLabelParams), [phaseLabelParams])

  const workflowStepperActiveIndex = useMemo(
    () => getWorkflowStepperActiveIndex(phaseLabelParams),
    [phaseLabelParams],
  )

  const desktopAvailable = isDesktopRuntimeAvailable()

  const showExecutingMain =
    !!plan &&
    executionIsActive &&
    (activeNav === 'workflow' || activeNav === 'review')

  const showCompletionMain =
    !!plan &&
    !!executionSession &&
    workflowStep === 'complete' &&
    !executionIsActive &&
    (activeNav === 'workflow' || activeNav === 'review')

  const showPlanWorkspace =
    !!plan &&
    !executionIsActive &&
    workflowStep !== 'complete' &&
    ((activeNav === 'workflow' && workflowStep === 'workspace') || activeNav === 'review')

  function handleAppNav(id: AppNavId) {
    setActiveNav(id)
  }

  const showStartOver = workflowStep !== 'setup' || !!scanStatus || !!plan

  const reviewBucketRows: Array<[ReviewBucket, string]> =
    uiMode === 'simple'
      ? [
          ['all', 'All'],
          ['duplicates', 'Duplicates'],
          ['needsChoice', 'Needs choice'],
          ['approved', 'Approved'],
        ]
      : [
          ['all', 'All'],
          ['blocked', 'Blocked'],
          ['protected', 'Protected'],
          ['duplicates', 'Duplicates'],
          ['unknown', 'Unknown'],
          ['approved', 'Approved'],
          ['rejected', 'Rejected'],
          ['needsChoice', 'Needs choice'],
        ]

  const layoutContentProps = {
    workflowDeps,
    activeNav,
    uiMode,
    workflowStep,
    setActiveNav,
    setWorkflowStep,
    setSyntheticDatasetName,
    setSyntheticMaxDepth,
    setSyntheticMessinessLevel,
    setSyntheticDuplicateRatePercent,
    setSyntheticIncludeHiddenFiles,
    setSyntheticIncludeEmptyFolders,
    setSyntheticTargetApparentSizeBytes,
    setHistoryPageIndex,
    setHistorySessionRecordPageIndex,
    setShowAllDestinationPreviewFolders,
    showExecutingMain,
    showCompletionMain,
    showPlanWorkspace,
    phaseLabel,
    workflowStepperActiveIndex,
    reviewBucketRows,
    status,
    presets,
    draftDestinationPath,
    syntheticOutputRoot,
    syntheticDatasetName,
    syntheticCategories,
    syntheticMaxDepth,
    syntheticMessinessLevel,
    syntheticDuplicateRatePercent,
    syntheticIncludeHiddenFiles,
    syntheticIncludeEmptyFolders,
    syntheticTargetApparentSizeBytes,
    isGeneratingSyntheticData,
    isSyntheticSourcePending,
    syntheticDatasetResult,
    learnerSuggestions,
    aiEvaluationSnapshot,
    learnerDraftPreviews,
    duplicateKeeperObservations,
    ruleReviewDecisionObservations,
    learnerSuggestionFeedbackEvents,
    activeLearnerSuggestionId,
    activeLearnerDraftId,
    historyPage,
    historyPageIndex,
    isLoadingHistory,
    selectedHistoryRecord,
    selectedHistorySession,
    historySessionRecordPage,
    isUndoingHistory,
    selectedPresetId,
    plan,
    executionSession,
    scanStatus,
    scanProgress,
    analysisSummary,
    isRunningExpensiveAnalysis,
    isBuildingPlan,
    destinationImpactPreview,
    visibleDestinationPreviewFolders,
    showAllDestinationPreviewFolders,
    approvedActionCount,
    hasExecutionPreflightErrors,
    executionPreflightWarnings,
    executionPreflightIssues,
    isLoadingExecutionPreflight,
    loadExecutionPreflight,
    executionIsActive,
    workflowPreferenceSuggestions,
    activeReviewBucket,
    setActiveReviewBucket,
    reviewActionPage,
    filteredPlanActions,
    setSelectedActionId,
    selectedAction,
    isUpdatingReview,
    executionRecordPage,
    setExecutionRecordPageIndex,
    reviewGroupPage,
    setReviewGroupPageIndex,
    selectedDuplicateGroup,
    setSelectedDuplicateGroupId,
    duplicateGroupDetails,
    isLoadingDuplicateGroupDetails,
    destinationInput,
    setDestinationInput,
    manifestPage,
    setManifestPageIndex,
    analysisDuplicatePage,
    setAnalysisDuplicatePageIndex,
    protectionPage,
    setProtectionPageIndex,
    sourceInput,
    setSourceInput,
    isBrowsingSource,
    isBrowsingDestination,
    isStartingScan,
    canAttemptScan,
    activeAnalysisJobId,
    dupSimpleMode,
    setDupSimpleMode,
    dupSimpleStrictness,
    setDupSimpleStrictness,
    dupKeeperPreference,
    setDupKeeperPreference,
    dupIgnoreSmallFiles,
    setDupIgnoreSmallFiles,
    dupIgnoreHiddenSystem,
    setDupIgnoreHiddenSystem,
    dupGroupByFolder,
    setDupGroupByFolder,
    advancedDupStrategy,
    setAdvancedDupStrategy,
    advancedDupKeeper,
    setAdvancedDupKeeper,
    advancedDupIncludeHidden,
    setAdvancedDupIncludeHidden,
    advancedDupIgnoreJunk,
    setAdvancedDupIgnoreJunk,
    advancedDupGroupByFolder,
    setAdvancedDupGroupByFolder,
    advancedDupScope,
    setAdvancedDupScope,
    advancedDupImages,
    setAdvancedDupImages,
    advancedDupSafetyTier,
    setAdvancedDupSafetyTier,
    advancedDupMaxSimilarFiles,
    setAdvancedDupMaxSimilarFiles,
    advancedDupMaxPairwise,
    setAdvancedDupMaxPairwise,
    advancedDupTimeoutMsRaw,
    setAdvancedDupTimeoutMsRaw,
    duplicateScanPreviewLines,
  } satisfies WorkflowAppLayoutContentProps

  return (
    <AppLayout
      activeNav={activeNav}
      onNav={handleAppNav}
      canOpenReview={!!plan}
      phaseLabel={phaseLabel}
      showStartOver={showStartOver}
      onStartOver={() => void workflowActions.handleStartOver(workflowDeps)}
      uiMode={uiMode}
      onToggleUiMode={() => setUiMode((m) => (m === 'simple' ? 'advanced' : 'simple'))}
      error={error}
      desktopAvailable={desktopAvailable}
    >
      <WorkflowAppLayoutContent {...layoutContentProps} />
    </AppLayout>
  )
}

