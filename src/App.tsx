import { useEffect, useMemo, useRef, useState } from 'react'

import './App.css'
import { PresetsView } from './features/presets/PresetsView'
import { HistoryView } from './features/history/HistoryView'
import { SettingsView } from './features/settings/SettingsView'
import { WorkflowResultsScreen } from './features/workflow/WorkflowResultsScreen'
import { WorkflowScanningScreen } from './features/workflow/WorkflowScanningScreen'
import { WorkflowCompletionScreen } from './features/workflow/WorkflowCompletionScreen'
import { WorkflowExecutingScreen } from './features/workflow/WorkflowExecutingScreen'
import { PlanReviewWorkspace } from './features/workflow/PlanReviewWorkspace'
import { WorkflowStepper } from './features/workflow/WorkflowStepper'
import { WorkflowSetupScreen } from './features/workflow/WorkflowSetupScreen'
import { AppLayout, type AppNavId } from './shell/AppLayout'
import { getWorkflowPhaseLabel, getWorkflowStepperActiveIndex } from './shell/getWorkflowPhaseLabel'
import {
  buildPlan,
  cancelScan,
  executePlan,
  generateSyntheticDataset,
  getAiEvaluationSnapshot,
  getAnalysisSummary,
  getAppStatus,
  getDuplicateReviewGroupDetails,
  getExecutionPreflight,
  getExecutionStatus,
  getHistoryPage,
  getLearnerDraftPreviews,
  getLearnerObservations,
  getLearnerSuggestions,
  getManifestPage,
  pickFolder,
  getPlan,
  isDesktopRuntimeAvailable,
  messageFromInvokeError,
  onAnalysisProgress,
  onExecutionCompleted,
  onExecutionProgress,
  onJobFailed,
  onPlanReady,
  getPresets,
  getScanStatus,
  onScanPageReady,
  onScanStarted,
  onScanProgress,
  recordLearnerSuggestionFeedback,
  revealPathInFileManager,
  runExpensiveAnalysis,
  saveLearnerDraftAsPreset,
  selectDestinations,
  selectSources,
  setDuplicateKeeper,
  setProtectionOverride,
  startScan,
  undoRecord,
  undoSession,
  updateReviewState,
} from './lib/tauri'
import type {
  AnalysisSummaryDto,
  AiEvaluationSnapshotDto,
  AppStatusDto,
  DuplicateReviewGroupDetailsDto,
  ExecutionSessionDto,
  GenerateSyntheticDatasetResultDto,
  HistoryEntryDto,
  HistoryPageDto,
  LearnerDraftPreviewDto,
  LearnerObservationDto,
  LearnerSuggestionFeedbackKind,
  LearnerSuggestionDto,
  ManifestPageDto,
  PlanDuplicateGroupDto,
  PlanDto,
  PreflightIssueDto,
  PresetDefinitionDto,
  ProtectionOverrideKind,
  ReviewDecision,
  ScanJobStatusDto,
  ScanProgressEvent,
  SyntheticDatasetCategory,
} from './types/app'
import {
  actionMatchesBucket,
  ANALYSIS_DUPLICATE_PAGE_SIZE,
  buildDestinationImpactPreview,
  EXECUTION_RECORD_PAGE_SIZE,
  type DestinationFolderPreview,
  HISTORY_PAGE_SIZE,
  HISTORY_SESSION_RECORD_PAGE_SIZE,
  isDuplicateKeeperObservation,
  isPlannedActionReviewDecisionObservation,
  isSuggestionFeedbackObservation,
  MANIFEST_PAGE_SIZE,
  paginateItems,
  parsePaths,
  PROTECTION_PAGE_SIZE,
  REVIEW_ACTION_PAGE_SIZE,
  REVIEW_GROUP_PAGE_SIZE,
  type ReviewBucket,
} from './features/app/shared'

function App() {
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

  async function loadLearnerInsights() {
    const [observations, suggestions, drafts, evaluationSnapshot] = await Promise.all([
      getLearnerObservations(16),
      getLearnerSuggestions(200, 8),
      getLearnerDraftPreviews(200, 8),
      getAiEvaluationSnapshot(5000),
    ])
    setLearnerObservations(observations)
    setLearnerSuggestions(suggestions)
    setLearnerDraftPreviews(drafts)
    setAiEvaluationSnapshot(evaluationSnapshot)
  }

  useEffect(() => {
    let active = true

    getAppStatus()
      .then((nextStatus) => {
        if (active) {
          setStatus(nextStatus)
          setSourceInput(nextStatus.sourcePaths.join('\n'))
          setDestinationInput(nextStatus.destinationPaths[0] ?? '')
        }
      })
      .catch((nextError) => {
        if (active) {
          setError(nextError instanceof Error ? nextError.message : 'Unknown error')
        }
      })

    if (isDesktopRuntimeAvailable()) {
      getPresets()
        .then((nextPresets) => {
          if (active) {
            setPresets(nextPresets)
            setSelectedPresetId((current) => current || nextPresets[0]?.presetId || '')
          }
        })
        .catch((nextError) => {
          if (active) {
            setError(nextError instanceof Error ? nextError.message : 'Failed to load presets.')
          }
        })

      Promise.all([
        getLearnerObservations(16),
        getLearnerSuggestions(200, 8),
        getLearnerDraftPreviews(200, 8),
        getAiEvaluationSnapshot(5000),
      ])
        .then(([observations, suggestions, drafts, evaluationSnapshot]) => {
          if (active) {
            setLearnerObservations(observations)
            setLearnerSuggestions(suggestions)
            setLearnerDraftPreviews(drafts)
            setAiEvaluationSnapshot(evaluationSnapshot)
          }
        })
        .catch((nextError) => {
          if (active) {
            setError(
              nextError instanceof Error ? nextError.message : 'Failed to load learner insights.',
            )
          }
        })
    }

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!scanStatus?.jobId) {
      return
    }

    let active = true
    let removeListener: (() => void) | undefined

    onScanProgress((payload) => {
      if (active && payload.jobId === scanStatus.jobId) {
        setScanProgress(payload)
      }
    }).then((unlisten) => {
      removeListener = unlisten
    })

    return () => {
      active = false
      removeListener?.()
    }
  }, [scanStatus?.jobId])

  useEffect(() => {
    let active = true
    let removeScanStarted: (() => void) | undefined
    let removeScanPageReady: (() => void) | undefined
    let removeAnalysisProgress: (() => void) | undefined
    let removePlanReady: (() => void) | undefined
    let removeJobFailed: (() => void) | undefined

    onScanStarted((payload) => {
      if (!active || payload.jobId !== scanStatus?.jobId) {
        return
      }
      setError(null)
    }).then((unlisten) => {
      removeScanStarted = unlisten
    })

    onScanPageReady((payload) => {
      if (!active || payload.jobId !== scanStatus?.jobId || payload.page !== manifestPageIndex) {
        return
      }

      void getManifestPage(payload.jobId, payload.page, payload.pageSize)
        .then((page) => {
          if (active) {
            setManifestPage(page)
          }
        })
        .catch((nextError) => {
          if (active) {
            setError(nextError instanceof Error ? nextError.message : 'Failed to load manifest page.')
          }
        })
    }).then((unlisten) => {
      removeScanPageReady = unlisten
    })

    onAnalysisProgress((payload) => {
      if (!active || payload.jobId !== activeAnalysisJobId || payload.stage !== 'completed') {
        return
      }

      setIsRunningExpensiveAnalysis(false)
      setActiveAnalysisJobId(null)
      void getAnalysisSummary(payload.jobId)
        .then((summary) => {
          if (active && summary) {
            setAnalysisSummary(summary)
          }
        })
        .catch((nextError) => {
          if (active) {
            setError(
              nextError instanceof Error
                ? nextError.message
                : 'Failed to refresh analysis summary.',
            )
          }
        })
      void getAppStatus()
        .then((nextStatus) => {
          if (active) {
            setStatus(nextStatus)
          }
        })
        .catch(() => {})
    }).then((unlisten) => {
      removeAnalysisProgress = unlisten
    })

    onPlanReady((payload) => {
      if (!active || payload.jobId !== scanStatus?.jobId) {
        return
      }

      void getAppStatus()
        .then((nextStatus) => {
          if (active) {
            setStatus(nextStatus)
          }
        })
        .catch(() => {})
    }).then((unlisten) => {
      removePlanReady = unlisten
    })

    onJobFailed((payload) => {
      if (!active) {
        return
      }

      if (payload.jobId === activeAnalysisJobId) {
        setIsRunningExpensiveAnalysis(false)
        setActiveAnalysisJobId(null)
      }
      setError(payload.message)
      void getAppStatus()
        .then((nextStatus) => {
          if (active) {
            setStatus(nextStatus)
          }
        })
        .catch(() => {})
    }).then((unlisten) => {
      removeJobFailed = unlisten
    })

    return () => {
      active = false
      removeScanStarted?.()
      removeScanPageReady?.()
      removeAnalysisProgress?.()
      removePlanReady?.()
      removeJobFailed?.()
    }
  }, [activeAnalysisJobId, manifestPageIndex, scanStatus?.jobId])

  useEffect(() => {
    if (!scanStatus?.jobId) {
      return
    }

    if (scanStatus.status !== 'running' && scanStatus.status !== 'pending') {
      return
    }

    const interval = window.setInterval(async () => {
      try {
        const nextStatus = await getScanStatus(scanStatus.jobId)
        if (nextStatus) {
          setScanStatus(nextStatus)
          setStatus(await getAppStatus())
        }
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'Failed to poll scan status.')
      }
    }, 700)

    return () => {
      window.clearInterval(interval)
    }
  }, [scanStatus])

  useEffect(() => {
    if (!scanStatus?.jobId) {
      return
    }

    if (scanStatus.discoveredEntries === 0) {
      setManifestPage(null)
      return
    }

    getManifestPage(scanStatus.jobId, manifestPageIndex, MANIFEST_PAGE_SIZE)
      .then((page) => {
        setManifestPage(page)
      })
      .catch((nextError) => {
        setError(nextError instanceof Error ? nextError.message : 'Failed to load manifest page.')
      })
  }, [scanStatus?.jobId, scanStatus?.discoveredEntries, manifestPageIndex])

  useEffect(() => {
    setManifestPageIndex(0)
  }, [scanStatus?.jobId])

  useEffect(() => {
    if (!scanStatus?.jobId) {
      return
    }

    getAnalysisSummary(scanStatus.jobId)
      .then((summary) => {
        setAnalysisSummary(summary)
      })
      .catch((nextError) => {
        setError(nextError instanceof Error ? nextError.message : 'Failed to load analysis summary.')
      })
  }, [scanStatus?.jobId, scanStatus?.status, scanStatus?.discoveredEntries])

  useEffect(() => {
    if (!plan) {
      setSelectedActionId(null)
      setExecutionPreflightIssues([])
      setSelectedDuplicateGroupId(null)
      setDuplicateGroupDetails(null)
      return
    }

    if (!selectedActionId || !filteredPlanActions.some((action) => action.actionId === selectedActionId)) {
      setSelectedActionId(filteredPlanActions[0]?.actionId ?? null)
    }
  }, [plan, filteredPlanActions, selectedActionId])

  useEffect(() => {
    setReviewPageIndex(0)
    setReviewGroupPageIndex(0)
    setShowAllDestinationPreviewFolders(false)
  }, [plan?.planId])

  useEffect(() => {
    if (reviewGroupPage.items.length === 0) {
      setSelectedDuplicateGroupId(null)
      setDuplicateGroupDetails(null)
      return
    }

    if (!selectedDuplicateGroupId || !reviewGroupPage.items.some((group) => group.groupId === selectedDuplicateGroupId)) {
      setSelectedDuplicateGroupId(reviewGroupPage.items[0]?.groupId ?? null)
    }
  }, [reviewGroupPage.items, selectedDuplicateGroupId])

  useEffect(() => {
    if (!plan?.planId || !selectedDuplicateGroup?.groupId) {
      setDuplicateGroupDetails(null)
      return
    }

    let active = true
    setIsLoadingDuplicateGroupDetails(true)
    getDuplicateReviewGroupDetails(plan.planId, selectedDuplicateGroup.groupId)
      .then((details) => {
        if (active) {
          setDuplicateGroupDetails(details)
        }
      })
      .catch((nextError) => {
        if (active) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : 'Failed to load duplicate review details.',
          )
        }
      })
      .finally(() => {
        if (active) {
          setIsLoadingDuplicateGroupDetails(false)
        }
      })

    return () => {
      active = false
    }
  }, [
    plan?.planId,
    selectedDuplicateGroup?.groupId,
    selectedDuplicateGroup?.selectedKeeperEntryId,
    selectedDuplicateGroup?.recommendedKeeperEntryId,
  ])

  useEffect(() => {
    if (!plan?.planId || executionIsActive) {
      return
    }

    if (approvedActionCount === 0) {
      setExecutionPreflightIssues([])
      return
    }

    void loadExecutionPreflight(plan.planId, false)
  }, [plan, approvedActionCount, executionIsActive])

  useEffect(() => {
    setReviewPageIndex(0)
  }, [activeReviewBucket])

  useEffect(() => {
    if (uiMode !== 'simple') {
      return
    }
    const allowed: ReviewBucket[] = ['all', 'duplicates', 'needsChoice', 'approved']
    if (!allowed.includes(activeReviewBucket)) {
      setActiveReviewBucket('all')
    }
  }, [uiMode, activeReviewBucket])

  useEffect(() => {
    if (!executionSession?.sessionId) {
      return
    }

    let active = true
    let removeProgress: (() => void) | undefined
    let removeCompleted: (() => void) | undefined

    async function refreshLiveSession(sessionId: string, syncPlan: boolean) {
      try {
        const nextSession = await getExecutionStatus(sessionId)
        if (!active || !nextSession) {
          return
        }

        setExecutionSession(nextSession)
        const stillRunning =
          nextSession.status === 'pending' || nextSession.status === 'running'
        setIsExecutingPlan(stillRunning)

        if (syncPlan) {
          const nextPlan = await getPlan(nextSession.planId)
          if (active && nextPlan) {
            setPlan(nextPlan)
          }
        }

        if (!stillRunning) {
          setStatus(await getAppStatus())
        }
      } catch (nextError) {
        if (active) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : 'Failed to refresh execution progress.',
          )
        }
      }
    }

    onExecutionProgress((payload) => {
      if (active && payload.sessionId === executionSession.sessionId) {
        void refreshLiveSession(payload.sessionId, true)
      }
    }).then((unlisten) => {
      removeProgress = unlisten
    })

    onExecutionCompleted((payload) => {
      if (active && payload.sessionId === executionSession.sessionId) {
        void refreshLiveSession(payload.sessionId, true)
      }
    }).then((unlisten) => {
      removeCompleted = unlisten
    })

    return () => {
      active = false
      removeProgress?.()
      removeCompleted?.()
    }
  }, [executionSession?.sessionId])

  useEffect(() => {
    if (
      !executionSession?.sessionId ||
      (executionSession.status !== 'pending' && executionSession.status !== 'running')
    ) {
      return
    }

    const interval = window.setInterval(async () => {
      try {
        const nextSession = await getExecutionStatus(executionSession.sessionId)
        if (!nextSession) {
          return
        }

        setExecutionSession(nextSession)
        const stillRunning =
          nextSession.status === 'pending' || nextSession.status === 'running'
        setIsExecutingPlan(stillRunning)

        if (!stillRunning) {
          const nextPlan = await getPlan(nextSession.planId)
          if (nextPlan) {
            setPlan(nextPlan)
          }
          setStatus(await getAppStatus())
        }
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : 'Failed to poll execution session.',
        )
      }
    }, 900)

    return () => {
      window.clearInterval(interval)
    }
  }, [executionSession?.sessionId, executionSession?.status])

  useEffect(() => {
    if (activeNav !== 'history') {
      return
    }

    let active = true
    setIsLoadingHistory(true)

    getHistoryPage(historyPageIndex, HISTORY_PAGE_SIZE)
      .then((page) => {
        if (active) {
          setHistoryPage(page)
        }
      })
      .catch((nextError) => {
        if (active) {
          setError(nextError instanceof Error ? nextError.message : 'Failed to load history page.')
        }
      })
      .finally(() => {
        if (active) {
          setIsLoadingHistory(false)
        }
      })

    return () => {
      active = false
    }
  }, [activeNav, historyPageIndex])

  useEffect(() => {
    if (!historyPage) {
      setSelectedHistoryRecordId(null)
      setSelectedHistorySessionId(null)
      return
    }

    if (
      !selectedHistoryRecordId ||
      !historyPage.entries.some((entry) => entry.recordId === selectedHistoryRecordId)
    ) {
      const firstEntry = historyPage.entries[0] ?? null
      setSelectedHistoryRecordId(firstEntry?.recordId ?? null)
      setSelectedHistorySessionId(firstEntry?.sessionId ?? null)
    }
  }, [historyPage, selectedHistoryRecordId])

  useEffect(() => {
    if (!selectedHistorySessionId || activeNav !== 'history') {
      setSelectedHistorySession(null)
      return
    }

    let active = true
    getExecutionStatus(selectedHistorySessionId)
      .then((session) => {
        if (active) {
          setSelectedHistorySession(session)
        }
      })
      .catch((nextError) => {
        if (active) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : 'Failed to load execution session history.',
          )
        }
      })

    return () => {
      active = false
    }
  }, [activeNav, selectedHistorySessionId])

  useEffect(() => {
    setHistorySessionRecordPageIndex(0)
  }, [selectedHistorySession?.sessionId])

  useEffect(() => {
    setExecutionRecordPageIndex(0)
  }, [executionSession?.sessionId])

  useEffect(() => {
    setAnalysisDuplicatePageIndex(0)
    setProtectionPageIndex(0)
  }, [analysisSummary?.jobId])

  function toggleSyntheticCategory(category: SyntheticDatasetCategory) {
    setSyntheticCategories((current) => {
      if (current.includes(category)) {
        return current.filter((item) => item !== category)
      }

      return [...current, category]
    })
  }

  async function syncSelections(
    nextSourcePaths: string[] = draftSourcePaths,
    nextDestinationPaths: string[] = draftDestinationPaths,
  ) {
    const nextSourceStatus = await selectSources(nextSourcePaths)
    const nextStatus = await selectDestinations(nextDestinationPaths)
    setStatus(nextStatus)

    if (!nextSourceStatus.sourcePaths.every((path, index) => path === nextStatus.sourcePaths[index])) {
      setStatus(await getAppStatus())
    }

    return nextStatus
  }

  async function handleBrowseSourceFolder() {
    setError(null)
    setIsBrowsingSource(true)
    try {
      const selected = await pickFolder()
      if (!selected) {
        return
      }
      const nextSourcePaths = Array.from(new Set([...draftSourcePaths, selected]))
      setSourceInput(nextSourcePaths.join('\n'))
      const nextStatus = await syncSelections(nextSourcePaths, draftDestinationPaths)
      setStatus(nextStatus)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to select source folder.')
    } finally {
      setIsBrowsingSource(false)
    }
  }

  async function handleBrowseDestinationFolder() {
    setError(null)
    setIsBrowsingDestination(true)
    try {
      const selected = await pickFolder()
      if (!selected) {
        return
      }
      setDestinationInput(selected)
      const nextStatus = await syncSelections(draftSourcePaths, [selected])
      setStatus(nextStatus)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to select destination folder.')
    } finally {
      setIsBrowsingDestination(false)
    }
  }

  async function handleBrowseSyntheticOutputFolder() {
    setError(null)
    try {
      const selected = await pickFolder()
      if (selected) {
        setSyntheticOutputRoot(selected)
      }
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Failed to select synthetic output folder.',
      )
    }
  }

  async function startScanFlow(
    nextSourcePaths: string[] = draftSourcePaths,
    nextDestinationPaths: string[] = draftDestinationPaths,
  ) {
    if (nextSourcePaths.length === 0) {
      setError('Enter at least one source path to scan.')
      return
    }

    if (nextDestinationPaths.length === 0) {
      setError('Enter a destination folder before scanning.')
      return
    }

    setError(null)
    setIsStartingScan(true)
    setScanProgress(null)
    setAnalysisSummary(null)
    setPlan(null)
    setExecutionSession(null)
    setManifestPageIndex(0)
    setReviewPageIndex(0)
    setReviewGroupPageIndex(0)
    setAnalysisDuplicatePageIndex(0)
    setProtectionPageIndex(0)

    try {
      const nextStatus = await syncSelections(nextSourcePaths, nextDestinationPaths)
      if (nextStatus.permissionsReadiness.state !== 'ready') {
        setError(nextStatus.permissionsReadiness.summary)
        return
      }

      const nextScanStatus = await startScan({ sourcePaths: nextSourcePaths })
      setScanStatus(nextScanStatus)
      setWorkflowStep('scanning')
      setStatus(await getAppStatus())
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to start scan.')
    } finally {
      setIsStartingScan(false)
    }
  }

  async function handleStartScan() {
    await startScanFlow()
  }

  async function applySyntheticDatasetAsSource(rootPath: string) {
    setError(null)
    setIsSyntheticSourcePending(true)

    try {
      setSourceInput(rootPath)
      const nextStatus = await selectSources([rootPath])
      setStatus(nextStatus)
      setActiveNav('workflow')
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Failed to apply synthetic dataset source.',
      )
    } finally {
      setIsSyntheticSourcePending(false)
    }
  }

  async function handleGenerateSyntheticDataset() {
    if (syntheticOutputRoot.trim().length === 0) {
      setError('Enter an output root folder for the synthetic dataset.')
      return
    }

    if (syntheticCategories.length === 0) {
      setError('Select at least one category for the synthetic dataset.')
      return
    }

    setError(null)
    setIsGeneratingSyntheticData(true)

    try {
      const result = await generateSyntheticDataset({
        outputRoot: syntheticOutputRoot.trim(),
        datasetName: syntheticDatasetName.trim() || 'Safepath Synthetic Dataset',
        categories: syntheticCategories,
        maxDepth: syntheticMaxDepth,
        messinessLevel: syntheticMessinessLevel,
        duplicateRatePercent: syntheticDuplicateRatePercent,
        includeHiddenFiles: syntheticIncludeHiddenFiles,
        includeEmptyFolders: syntheticIncludeEmptyFolders,
        targetApparentSizeBytes: syntheticTargetApparentSizeBytes,
      })
      setSyntheticDatasetResult(result)
    } catch (nextError) {
      setError(
        messageFromInvokeError(nextError, 'Failed to generate synthetic data.'),
      )
    } finally {
      setIsGeneratingSyntheticData(false)
    }
  }

  async function handleGenerateAndScanSyntheticDataset() {
    if (draftDestinationPaths.length === 0) {
      setError('Enter a destination folder before generating and scanning synthetic data.')
      return
    }

    setError(null)
    setIsGeneratingSyntheticData(true)

    try {
      const result = await generateSyntheticDataset({
        outputRoot: syntheticOutputRoot.trim(),
        datasetName: syntheticDatasetName.trim() || 'Safepath Synthetic Dataset',
        categories: syntheticCategories,
        maxDepth: syntheticMaxDepth,
        messinessLevel: syntheticMessinessLevel,
        duplicateRatePercent: syntheticDuplicateRatePercent,
        includeHiddenFiles: syntheticIncludeHiddenFiles,
        includeEmptyFolders: syntheticIncludeEmptyFolders,
        targetApparentSizeBytes: syntheticTargetApparentSizeBytes,
      })
      setSyntheticDatasetResult(result)
      setSourceInput(result.rootPath)
      setActiveNav('workflow')
      await startScanFlow([result.rootPath], draftDestinationPaths)
    } catch (nextError) {
      setError(
        messageFromInvokeError(nextError, 'Failed to generate and scan synthetic data.'),
      )
    } finally {
      setIsGeneratingSyntheticData(false)
    }
  }

  async function handleCancelScan() {
    if (!scanStatus?.jobId) {
      return
    }

    try {
      const nextStatus = await cancelScan(scanStatus.jobId)
      setScanStatus(nextStatus)
      setStatus(await getAppStatus())
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to cancel scan.')
    }
  }

  async function handleRunExpensiveAnalysis() {
    if (!scanStatus?.jobId) {
      return
    }

    setError(null)
    setIsRunningExpensiveAnalysis(true)
    try {
      setActiveAnalysisJobId(scanStatus.jobId)
      await runExpensiveAnalysis(scanStatus.jobId)
    } catch (nextError) {
      setActiveAnalysisJobId(null)
      setError(nextError instanceof Error ? nextError.message : 'Failed to run expensive analysis.')
      setIsRunningExpensiveAnalysis(false)
    }
  }

  async function handleBuildPlan() {
    if (!scanStatus?.jobId || !selectedPresetId) {
      return
    }

    setError(null)
    setIsBuildingPlan(true)
    try {
      const nextPlan = await buildPlan({
        jobId: scanStatus.jobId,
        presetId: selectedPresetId,
      })
      setPlan(nextPlan)
      setWorkflowStep('workspace')
      setActiveReviewBucket('all')
      setReviewPageIndex(0)
      setReviewGroupPageIndex(0)
      setSelectedActionId(nextPlan.actions[0]?.actionId ?? null)
      setExecutionSession(null)
      setStatus(await getAppStatus())
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to build plan.')
    } finally {
      setIsBuildingPlan(false)
    }
  }

  async function applyProtectionOverride(path: string, overrideKind: ProtectionOverrideKind) {
    try {
      await setProtectionOverride(path, overrideKind)
      if (scanStatus?.jobId) {
        const summary = await getAnalysisSummary(scanStatus.jobId)
        setAnalysisSummary(summary)
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to persist protection override.')
    }
  }

  async function handleProtectPath(path: string) {
    await applyProtectionOverride(path, 'userProtected')
  }

  async function handleApplyStructureProtection(path: string, overrideKind: ProtectionOverrideKind) {
    await applyProtectionOverride(path, overrideKind)
  }

  function isOverridden(path: string) {
    return analysisSummary?.protectionOverrides.some((item) => item.path === path) ?? false
  }

  async function handleRefreshPlan() {
    if (!plan?.planId) {
      return
    }

    const nextPlan = await getPlan(plan.planId)
    if (nextPlan) {
      setPlan(nextPlan)
    }
  }

  async function loadExecutionPreflight(planId: string, surfaceErrors = true) {
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
  }

  async function handleReviewDecision(actionIds: string[], decision: ReviewDecision) {
    if (!plan?.planId || actionIds.length === 0) {
      return
    }

    setError(null)
    setIsUpdatingReview(true)
    try {
      const nextPlan = await updateReviewState({
        planId: plan.planId,
        actionIds,
        decision,
      })
      setPlan(nextPlan)
      setExecutionSession(null)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to update review state.')
      await handleRefreshPlan()
    } finally {
      setIsUpdatingReview(false)
    }
  }

  async function handleSetDuplicateKeeper(group: PlanDuplicateGroupDto, keeperEntryId: string) {
    if (!plan?.planId) {
      return
    }

    setError(null)
    setIsUpdatingReview(true)
    try {
      const nextPlan = await setDuplicateKeeper({
        planId: plan.planId,
        groupId: group.groupId,
        keeperEntryId,
      })
      setPlan(nextPlan)
      await loadLearnerInsights()
      setExecutionSession(null)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to update duplicate keeper.')
      await handleRefreshPlan()
    } finally {
      setIsUpdatingReview(false)
    }
  }

  async function handleRevealPath(path: string) {
    setError(null)
    try {
      await revealPathInFileManager(path)
    } catch (nextError) {
      setError(messageFromInvokeError(nextError, 'Failed to reveal the selected path.'))
    }
  }

  async function handleLearnerSuggestionFeedback(
    suggestion: LearnerSuggestionDto,
    feedback: LearnerSuggestionFeedbackKind,
  ) {
    setError(null)
    setActiveLearnerSuggestionId(suggestion.suggestionId)
    try {
      await recordLearnerSuggestionFeedback({
        suggestionId: suggestion.suggestionId,
        presetId: suggestion.presetId,
        feedback,
      })
      await loadLearnerInsights()
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Failed to record learner feedback.',
      )
    } finally {
      setActiveLearnerSuggestionId(null)
    }
  }

  async function handleSaveLearnerDraftPreview(draft: LearnerDraftPreviewDto) {
    setError(null)
    setActiveLearnerDraftId(draft.draftId)
    try {
      const savedPreset = await saveLearnerDraftAsPreset({ draftId: draft.draftId })
      const nextPresets = await getPresets()
      setPresets(nextPresets)
      setSelectedPresetId(savedPreset.presetId)
      await loadLearnerInsights()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to save learner draft.')
    } finally {
      setActiveLearnerDraftId(null)
    }
  }

  async function handleExecutePlan() {
    if (!plan?.planId) {
      return
    }

    setError(null)
    setIsExecutingPlan(true)
    setExecutionRecordPageIndex(0)
    try {
      const latestPreflightIssues = await loadExecutionPreflight(plan.planId)
      if (!latestPreflightIssues) {
        wasExecutingPlanRef.current = false
        setIsExecutingPlan(false)
        return
      }
      if (latestPreflightIssues.some((issue) => issue.severity === 'error')) {
        wasExecutingPlanRef.current = false
        setIsExecutingPlan(false)
        return
      }

      const session = await executePlan({ planId: plan.planId })
      setExecutionSession(session)
      if (session.status !== 'pending' && session.status !== 'running') {
        const persistedSession = await getExecutionStatus(session.sessionId)
        setExecutionSession(persistedSession ?? session)
        await handleRefreshPlan()
        setStatus(await getAppStatus())
        setIsExecutingPlan(false)
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to execute plan.')
      wasExecutingPlanRef.current = false
      setIsExecutingPlan(false)
    }
  }

  function handleSelectHistoryEntry(entry: HistoryEntryDto) {
    setSelectedHistoryRecordId(entry.recordId)
    setSelectedHistorySessionId(entry.sessionId)
  }

  function handleChangeReviewPage(nextPage: number) {
    const nextSlice = paginateItems(filteredPlanActions, nextPage, REVIEW_ACTION_PAGE_SIZE)
    setReviewPageIndex(nextSlice.page)
    setSelectedActionId(nextSlice.items[0]?.actionId ?? null)
  }

  async function refreshHistorySelection(
    nextRecordId: string | null,
    nextSessionId: string | null,
    nextPageIndex = 0,
  ) {
    const page = await getHistoryPage(nextPageIndex, HISTORY_PAGE_SIZE)
    setHistoryPage(page)
    setHistoryPageIndex(nextPageIndex)
    setSelectedHistoryRecordId(nextRecordId)
    setSelectedHistorySessionId(nextSessionId)

    if (nextSessionId) {
      setSelectedHistorySession(await getExecutionStatus(nextSessionId))
    } else {
      setSelectedHistorySession(null)
    }
  }

  async function handleUndoSelectedRecord() {
    if (!selectedHistoryRecord) {
      return
    }

    setError(null)
    setIsUndoingHistory(true)
    try {
      const undoRun = await undoRecord({ recordId: selectedHistoryRecord.recordId })
      const undoRecordId = undoRun.records[0]?.recordId ?? null
      setExecutionSession(undoRun)
      await refreshHistorySelection(undoRecordId, undoRun.sessionId, 0)
      const nextPlan = await getPlan(undoRun.planId)
      if (nextPlan) {
        setPlan(nextPlan)
        setWorkflowStep('workspace')
      }
      setStatus(await getAppStatus())
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to undo action record.')
    } finally {
      setIsUndoingHistory(false)
    }
  }

  async function handleUndoSelectedSession() {
    if (!selectedHistorySession) {
      return
    }

    setError(null)
    setIsUndoingHistory(true)
    try {
      const undoRun = await undoSession({ sessionId: selectedHistorySession.sessionId })
      const lastUndoRecord = undoRun.records[undoRun.records.length - 1] ?? null
      setExecutionSession(undoRun)
      await refreshHistorySelection(lastUndoRecord?.recordId ?? null, undoRun.sessionId, 0)
      const nextPlan = await getPlan(undoRun.planId)
      if (nextPlan) {
        setPlan(nextPlan)
        setWorkflowStep('workspace')
      }
      setStatus(await getAppStatus())
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to undo session.')
    } finally {
      setIsUndoingHistory(false)
    }
  }

  useEffect(() => {
    const s = scanStatus?.status
    if (s === 'cancelled' || s === 'failed') {
      setWorkflowStep('setup')
      return
    }
    if (s === 'completed' && workflowStep === 'scanning') {
      setWorkflowStep('results')
    }
  }, [scanStatus?.status, workflowStep])

  useEffect(() => {
    if (!plan && scanStatus?.status === 'completed' && workflowStep === 'workspace') {
      setWorkflowStep('results')
    }
  }, [plan, scanStatus?.status, workflowStep])

  useEffect(() => {
    if (activeNav !== 'workflow' && activeNav !== 'review') {
      return
    }
    const s = scanStatus?.status
    if (s === 'running' || s === 'pending') {
      setWorkflowStep('scanning')
    }
  }, [activeNav, scanStatus?.status])

  useEffect(() => {
    if (isExecutingPlan) {
      wasExecutingPlanRef.current = true
      return
    }
    if (
      wasExecutingPlanRef.current &&
      executionSession &&
      executionSession.status !== 'pending' &&
      executionSession.status !== 'running'
    ) {
      wasExecutingPlanRef.current = false
      setWorkflowStep('complete')
    }
  }, [isExecutingPlan, executionSession])

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

  async function handleStartOver() {
    setError(null)
    try {
      if (scanStatus?.jobId && scanStatus.status === 'running') {
        await cancelScan(scanStatus.jobId)
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to cancel scan.')
    }
    setWorkflowStep('setup')
    setPlan(null)
    setExecutionSession(null)
    setAnalysisSummary(null)
    setScanStatus(null)
    setScanProgress(null)
    setManifestPage(null)
    setExecutionPreflightIssues([])
    setManifestPageIndex(0)
    wasExecutingPlanRef.current = false
    try {
      const next = await getAppStatus()
      setStatus(next)
      setSourceInput(next.sourcePaths.join('\n'))
      setDestinationInput(next.destinationPaths[0] ?? '')
    } catch {
      /* ignore */
    }
    setActiveNav('workflow')
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

  return (
    <AppLayout
      activeNav={activeNav}
      onNav={handleAppNav}
      canOpenReview={!!plan}
      phaseLabel={phaseLabel}
      showStartOver={showStartOver}
      onStartOver={() => void handleStartOver()}
      uiMode={uiMode}
      onToggleUiMode={() => setUiMode((m) => (m === 'simple' ? 'advanced' : 'simple'))}
      error={error}
      desktopAvailable={desktopAvailable}
    >
      {activeNav === 'settings' ? (
        <div className="workflow-legacy">
        <SettingsView
          status={status}
          presets={presets}
          draftDestinationPath={draftDestinationPath}
          syntheticOutputRoot={syntheticOutputRoot}
          syntheticDatasetName={syntheticDatasetName}
          syntheticCategories={syntheticCategories}
          syntheticMaxDepth={syntheticMaxDepth}
          syntheticMessinessLevel={syntheticMessinessLevel}
          syntheticDuplicateRatePercent={syntheticDuplicateRatePercent}
          syntheticIncludeHiddenFiles={syntheticIncludeHiddenFiles}
          syntheticIncludeEmptyFolders={syntheticIncludeEmptyFolders}
          syntheticTargetApparentSizeBytes={syntheticTargetApparentSizeBytes}
          isGeneratingSyntheticData={isGeneratingSyntheticData}
          isSyntheticSourcePending={isSyntheticSourcePending}
          syntheticDatasetResult={syntheticDatasetResult}
          learnerSuggestions={learnerSuggestions}
          aiEvaluationSnapshot={aiEvaluationSnapshot}
          learnerDraftPreviews={learnerDraftPreviews}
          duplicateKeeperObservations={duplicateKeeperObservations}
          ruleReviewDecisionObservations={ruleReviewDecisionObservations}
          learnerSuggestionFeedbackEvents={learnerSuggestionFeedbackEvents}
          activeLearnerSuggestionId={activeLearnerSuggestionId}
          activeLearnerDraftId={activeLearnerDraftId}
          onSyntheticOutputRootChange={setSyntheticOutputRoot}
          onBrowseSyntheticOutputRoot={() => void handleBrowseSyntheticOutputFolder()}
          onSyntheticDatasetNameChange={setSyntheticDatasetName}
          onSyntheticTargetSizeChange={setSyntheticTargetApparentSizeBytes}
          onSyntheticMaxDepthChange={setSyntheticMaxDepth}
          onSyntheticMessinessLevelChange={setSyntheticMessinessLevel}
          onSyntheticDuplicateRateChange={setSyntheticDuplicateRatePercent}
          onSyntheticIncludeHiddenFilesChange={setSyntheticIncludeHiddenFiles}
          onSyntheticIncludeEmptyFoldersChange={setSyntheticIncludeEmptyFolders}
          onToggleSyntheticCategory={toggleSyntheticCategory}
          onGenerateSyntheticDataset={handleGenerateSyntheticDataset}
          onGenerateAndScanSyntheticDataset={handleGenerateAndScanSyntheticDataset}
          onApplySyntheticDatasetAsSource={applySyntheticDatasetAsSource}
          onLearnerSuggestionFeedback={handleLearnerSuggestionFeedback}
          onSaveLearnerDraftPreview={handleSaveLearnerDraftPreview}
        />
        </div>
      ) : null}

      {activeNav === 'history' ? (
        <div className="workflow-legacy">
        <HistoryView
          uiMode={uiMode}
          historyPage={historyPage}
          historyPageIndex={historyPageIndex}
          isLoadingHistory={isLoadingHistory}
          selectedHistoryRecord={selectedHistoryRecord}
          selectedHistorySession={selectedHistorySession}
          historySessionRecordPage={historySessionRecordPage}
          isUndoingHistory={isUndoingHistory}
          onPreviousHistoryPage={() => setHistoryPageIndex((current) => Math.max(0, current - 1))}
          onNextHistoryPage={() => setHistoryPageIndex((current) => current + 1)}
          onSelectHistoryEntry={handleSelectHistoryEntry}
          onUndoSelectedRecord={handleUndoSelectedRecord}
          onUndoSelectedSession={handleUndoSelectedSession}
          onPreviousHistorySessionRecordPage={() =>
            setHistorySessionRecordPageIndex(historySessionRecordPage.page - 1)
          }
          onNextHistorySessionRecordPage={() =>
            setHistorySessionRecordPageIndex(historySessionRecordPage.page + 1)
          }
        />
        </div>
      ) : null}

      {activeNav === 'presets' ? (
        <PresetsView
          presets={presets}
          selectedPresetId={selectedPresetId}
          onSelectPreset={setSelectedPresetId}
          onUsePreset={() => setActiveNav('workflow')}
        />
      ) : null}

      {activeNav === 'review' && !plan ? (
        <div className="mx-auto flex max-w-lg flex-col gap-6">
          <WorkflowStepper activeIndex={workflowStepperActiveIndex} className="px-2" />
          <div className="rounded-3xl border border-white/10 bg-white/5 p-10 text-center backdrop-blur-xl">
            <h2 className="text-xl font-semibold text-white">No plan yet</h2>
            <p className="mt-3 text-sm text-white/65">
              The same guided steps run on <strong className="text-white/85">Home</strong>. Use Home
              to move from prepare through scan, signals, plan, execute, and done.{' '}
              <strong className="text-white/85">Review</strong> is a shortcut to this workspace once
              you have a plan, so you can jump back without hunting for the right phase on Home.
            </p>
          </div>
        </div>
      ) : null}

      {showExecutingMain && executionSession ? (
        <WorkflowExecutingScreen
          session={executionSession}
          planLabel={plan?.presetName ?? 'Plan'}
          workflowStepperActiveIndex={workflowStepperActiveIndex}
          uiMode={uiMode}
        />
      ) : null}

      {showCompletionMain && executionSession ? (
        <WorkflowCompletionScreen
          session={executionSession}
          planLabel={plan?.presetName ?? 'Plan'}
          workflowStepperActiveIndex={workflowStepperActiveIndex}
          uiMode={uiMode}
          onBackToReview={() => setWorkflowStep('workspace')}
          onViewHistory={() => setActiveNav('history')}
          onStartNewScan={() => void handleStartOver()}
        />
      ) : null}

      {showPlanWorkspace ? (
        <PlanReviewWorkspace
          showHomeStageIntro={activeNav === 'workflow'}
          scanStatus={scanStatus}
          status={status}
          uiMode={uiMode}
          analysisSummary={analysisSummary}
          plan={plan}
          scanProgress={scanProgress}
          isRunningExpensiveAnalysis={isRunningExpensiveAnalysis}
          handleRunExpensiveAnalysis={() => void handleRunExpensiveAnalysis()}
          selectedPresetId={selectedPresetId}
          setSelectedPresetId={setSelectedPresetId}
          presets={presets}
          workflowPreferenceSuggestions={workflowPreferenceSuggestions}
          isBuildingPlan={isBuildingPlan}
          handleBuildPlan={() => void handleBuildPlan()}
          destinationImpactPreview={destinationImpactPreview}
          visibleDestinationPreviewFolders={visibleDestinationPreviewFolders}
          showAllDestinationPreviewFolders={showAllDestinationPreviewFolders}
          setShowAllDestinationPreviewFolders={setShowAllDestinationPreviewFolders}
          approvedActionCount={approvedActionCount}
          hasExecutionPreflightErrors={hasExecutionPreflightErrors}
          executionPreflightWarnings={executionPreflightWarnings}
          executionPreflightIssues={executionPreflightIssues}
          isLoadingExecutionPreflight={isLoadingExecutionPreflight}
          loadExecutionPreflight={loadExecutionPreflight}
          executionIsActive={executionIsActive}
          handleExecutePlan={() => void handleExecutePlan()}
          reviewBucketRows={reviewBucketRows}
          activeReviewBucket={activeReviewBucket}
          setActiveReviewBucket={setActiveReviewBucket}
          reviewActionPage={reviewActionPage}
          filteredActionIds={filteredPlanActions.map((action) => action.actionId)}
          handleChangeReviewPage={handleChangeReviewPage}
          selectedAction={selectedAction}
          setSelectedActionId={setSelectedActionId}
          handleReviewDecision={handleReviewDecision}
          isUpdatingReview={isUpdatingReview}
          executionSession={executionSession}
          executionRecordPage={executionRecordPage}
          setExecutionRecordPageIndex={setExecutionRecordPageIndex}
          reviewGroupPage={reviewGroupPage}
          setReviewGroupPageIndex={setReviewGroupPageIndex}
          selectedDuplicateGroup={selectedDuplicateGroup}
          setSelectedDuplicateGroupId={setSelectedDuplicateGroupId}
          duplicateGroupDetails={duplicateGroupDetails}
          isLoadingDuplicateGroupDetails={isLoadingDuplicateGroupDetails}
          handleSetDuplicateKeeper={handleSetDuplicateKeeper}
          handleRevealPath={handleRevealPath}
          draftDestinationPath={draftDestinationPath}
          destinationInput={destinationInput}
          setDestinationInput={setDestinationInput}
          handleBrowseDestination={() => void handleBrowseDestinationFolder()}
          isBrowsingDestination={isBrowsingDestination}
          manifestPage={manifestPage}
          setManifestPageIndex={setManifestPageIndex}
          analysisDuplicatePage={analysisDuplicatePage}
          setAnalysisDuplicatePageIndex={setAnalysisDuplicatePageIndex}
          protectionPage={protectionPage}
          setProtectionPageIndex={setProtectionPageIndex}
          handleProtectPath={handleProtectPath}
          isOverridden={isOverridden}
          handleApplyStructureProtection={handleApplyStructureProtection}
          phaseLabel={phaseLabel}
          workflowStepperActiveIndex={workflowStepperActiveIndex}
        />
      ) : null}

      {activeNav === 'workflow' && workflowStep === 'setup' ? (
        <WorkflowSetupScreen
          status={status}
          sourceInput={sourceInput}
          destinationInput={destinationInput}
          onSourceChange={setSourceInput}
          onDestinationChange={setDestinationInput}
          onBrowseSource={() => void handleBrowseSourceFolder()}
          onBrowseDestination={() => void handleBrowseDestinationFolder()}
          onStartScan={() => void handleStartScan()}
          isBrowsingSource={isBrowsingSource}
          isBrowsingDestination={isBrowsingDestination}
          isStartingScan={isStartingScan}
          canAttemptScan={canAttemptScan}
          workflowStepperActiveIndex={workflowStepperActiveIndex}
          uiMode={uiMode}
        />
      ) : null}

      {activeNav === 'workflow' && workflowStep === 'scanning' && scanStatus ? (
        <WorkflowScanningScreen
          scanStatus={scanStatus}
          scanProgress={scanProgress}
          onCancel={() => void handleCancelScan()}
          workflowStepperActiveIndex={workflowStepperActiveIndex}
          uiMode={uiMode}
        />
      ) : null}

      {activeNav === 'workflow' && workflowStep === 'results' && scanStatus ? (
        <WorkflowResultsScreen
          scanStatus={scanStatus}
          analysisSummary={analysisSummary}
          presets={presets}
          selectedPresetId={selectedPresetId}
          onPresetChange={setSelectedPresetId}
          onBuildPlan={() => void handleBuildPlan()}
          isBuildingPlan={isBuildingPlan}
          onRunExpensiveAnalysis={() => void handleRunExpensiveAnalysis()}
          isRunningExpensiveAnalysis={isRunningExpensiveAnalysis}
          activeAnalysisJobId={activeAnalysisJobId}
          onContinueToWorkspace={() => setWorkflowStep('workspace')}
          hasPlan={!!plan}
          uiMode={uiMode}
          workflowPreferenceSuggestions={workflowPreferenceSuggestions}
          aiAssistedSuggestions={analysisSummary?.aiAssistedSuggestions ?? []}
          selectedPresetIdForAi={selectedPresetId}
          onApplyAiPreset={setSelectedPresetId}
          onApplyStructureProtection={handleApplyStructureProtection}
          isOverridden={isOverridden}
          workflowStepperActiveIndex={workflowStepperActiveIndex}
        />
      ) : null}
    </AppLayout>
  )
}

export default App
