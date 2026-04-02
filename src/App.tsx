import { useEffect, useMemo, useState } from 'react'

import './App.css'
import { AppStatusSummary } from './components/layout/AppStatusSummary'
import { WorkflowShell } from './components/layout/WorkflowShell'
import { PermissionReadinessCard } from './components/permissions/PermissionReadinessCard'
import { HistoryView } from './features/history/HistoryView'
import { SettingsView } from './features/settings/SettingsView'
import {
  buildPlan,
  cancelScan,
  executePlan,
  generateSyntheticDataset,
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
  ProtectionDetectionDto,
  ReviewDecision,
  ScanJobStatusDto,
  ScanProgressEvent,
  SyntheticDatasetCategory,
} from './types/app'
import {
  actionMatchesBucket,
  ANALYSIS_DUPLICATE_PAGE_SIZE,
  buildDestinationImpactPreview,
  countBucket,
  EXECUTION_RECORD_PAGE_SIZE,
  type DestinationFolderPreview,
  formatBytes,
  formatExecutionStrategy,
  formatMediaDateSource,
  formatTimestamp,
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
  SYNTHETIC_SIZE_OPTIONS,
} from './features/app/shared'

function App() {
  const [activeView, setActiveView] = useState<'workflow' | 'history' | 'settings'>('workflow')
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
  const [historyPageIndex, setHistoryPageIndex] = useState(0)
  const [selectedHistoryRecordId, setSelectedHistoryRecordId] = useState<string | null>(null)
  const [selectedHistorySessionId, setSelectedHistorySessionId] = useState<string | null>(null)
  const [selectedHistorySession, setSelectedHistorySession] = useState<ExecutionSessionDto | null>(null)
  const [historySessionRecordPageIndex, setHistorySessionRecordPageIndex] = useState(0)
  const [activeReviewBucket, setActiveReviewBucket] = useState<ReviewBucket>('all')
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null)
  const [isStartingScan, setIsStartingScan] = useState(false)
  const [isCheckingReadiness, setIsCheckingReadiness] = useState(false)
  const [isRunningExpensiveAnalysis, setIsRunningExpensiveAnalysis] = useState(false)
  const [activeAnalysisJobId, setActiveAnalysisJobId] = useState<string | null>(null)
  const [isBuildingPlan, setIsBuildingPlan] = useState(false)
  const [isUpdatingReview, setIsUpdatingReview] = useState(false)
  const [isExecutingPlan, setIsExecutingPlan] = useState(false)
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
    SYNTHETIC_SIZE_OPTIONS[1].bytes,
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
  const canAttemptScan =
    draftSourcePaths.length > 0 &&
    draftDestinationPaths.length > 0 &&
    status?.permissionsReadiness.state === 'ready'
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

  async function loadLearnerInsights() {
    const [observations, suggestions, drafts] = await Promise.all([
      getLearnerObservations(16),
      getLearnerSuggestions(200, 8),
      getLearnerDraftPreviews(200, 8),
    ])
    setLearnerObservations(observations)
    setLearnerSuggestions(suggestions)
    setLearnerDraftPreviews(drafts)
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
      ])
        .then(([observations, suggestions, drafts]) => {
          if (active) {
            setLearnerObservations(observations)
            setLearnerSuggestions(suggestions)
            setLearnerDraftPreviews(drafts)
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
    if (activeView !== 'history') {
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
  }, [activeView, historyPageIndex])

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
    if (!selectedHistorySessionId || activeView !== 'history') {
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
  }, [activeView, selectedHistorySessionId])

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

  async function handleCheckReadiness() {
    setError(null)
    setIsCheckingReadiness(true)

    try {
      const nextStatus = await syncSelections()
      if (nextStatus.permissionsReadiness.state !== 'ready') {
        setError(nextStatus.permissionsReadiness.summary)
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to update path selection.')
    } finally {
      setIsCheckingReadiness(false)
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
      setActiveView('workflow')
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
      setActiveView('workflow')
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

  async function handleProtectPath(path: string) {
    try {
      await setProtectionOverride(path, 'userProtected')
      if (scanStatus?.jobId) {
        const summary = await getAnalysisSummary(scanStatus.jobId)
        setAnalysisSummary(summary)
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to persist protection override.')
    }
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
        setIsExecutingPlan(false)
        return
      }
      if (latestPreflightIssues.some((issue) => issue.severity === 'error')) {
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
      }
      setStatus(await getAppStatus())
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to undo session.')
    } finally {
      setIsUndoingHistory(false)
    }
  }

  return (
    <div className="app-frame">
      <header className="app-header">
        <div>
          <p className="app-header__eyebrow">Desktop organizing workflow</p>
          <h1>Safepath</h1>
          <p className="app-header__subtitle">
            Safepath now keeps selected sources and destinations in Rust, checks read and write
            permissions before scanning, persists manifest pages, supports both cheap and expensive
            duplicate analysis, can build preset-driven plans directly from Rust-owned rules,
            stores structured execution history in Rust, and now records duplicate-keeper learner
            observations without auto-applying any suggestions.
          </p>
        </div>
        <div className="view-toggle" role="tablist" aria-label="App sections">
          <button
            className={`toggle-button ${activeView === 'workflow' ? 'toggle-button--active' : ''}`}
            onClick={() => setActiveView('workflow')}
            type="button"
          >
            Workflow
          </button>
          <button
            className={`toggle-button ${activeView === 'history' ? 'toggle-button--active' : ''}`}
            onClick={() => setActiveView('history')}
            type="button"
          >
            History
          </button>
          <button
            className={`toggle-button ${activeView === 'settings' ? 'toggle-button--active' : ''}`}
            onClick={() => setActiveView('settings')}
            type="button"
          >
            Settings
          </button>
        </div>
      </header>

      {error ? <div className="error-banner">{error}</div> : null}

      {activeView === 'settings' ? (
        <SettingsView
          status={status}
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
          learnerDraftPreviews={learnerDraftPreviews}
          duplicateKeeperObservations={duplicateKeeperObservations}
          ruleReviewDecisionObservations={ruleReviewDecisionObservations}
          learnerSuggestionFeedbackEvents={learnerSuggestionFeedbackEvents}
          activeLearnerSuggestionId={activeLearnerSuggestionId}
          activeLearnerDraftId={activeLearnerDraftId}
          onSyntheticOutputRootChange={setSyntheticOutputRoot}
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
      ) : activeView === 'history' ? (
        <HistoryView
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
      ) : (
        <WorkflowShell
          centerHeader={
            <span className="phase-pill">
              {scanStatus ? `scan ${scanStatus.status}` : status?.workflowPhase ?? 'idle'}
            </span>
          }
          left={
            <div className="placeholder-stack">
              <div className="status-card">
                <header className="status-card__header">
                  <div>
                    <p className="status-card__eyebrow">Scan harness</p>
                    <h3>Source paths</h3>
                  </div>
                </header>
                <label className="field-label" htmlFor="source-paths">
                  Enter one absolute path per line
                </label>
                <textarea
                  id="source-paths"
                  className="text-input text-input--multiline"
                  placeholder="/Users/siggewidmark/Downloads"
                  value={sourceInput}
                  onChange={(event) => setSourceInput(event.target.value)}
                />
                <div className="button-row">
                  <button
                    className="action-button action-button--secondary"
                    onClick={handleCheckReadiness}
                    disabled={isCheckingReadiness}
                    type="button"
                  >
                    {isCheckingReadiness ? 'Checking…' : 'Check readiness'}
                  </button>
                  <button
                    className="action-button"
                    onClick={handleStartScan}
                    disabled={!canAttemptScan || isStartingScan}
                    type="button"
                  >
                    {isStartingScan ? 'Starting…' : 'Start scan'}
                  </button>
                  <button
                    className="action-button action-button--secondary"
                    onClick={handleCancelScan}
                    disabled={!scanStatus || scanStatus.status !== 'running'}
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
              </div>
              {status ? <PermissionReadinessCard readiness={status.permissionsReadiness} /> : null}
              {analysisSummary?.structureSignals.length ? (
                <div className="status-card">
                  <header className="status-card__header">
                    <div>
                      <p className="status-card__eyebrow">Structure warnings</p>
                      <h3>{analysisSummary.structureSignals.length} signals</h3>
                    </div>
                  </header>
                  <ul className="status-card__list">
                    {analysisSummary.structureSignals.map((signal) => (
                      <li key={`${signal.kind}-${signal.description}`}>{signal.description}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          }
          center={
            <div className="placeholder-stack">
              {status ? (
                <AppStatusSummary status={status} />
              ) : (
                <div className="empty-card">
                  <strong>Loading desktop status</strong>
                  <p>Waiting for the first Rust command to hydrate the shell.</p>
                </div>
              )}
              {scanStatus ? (
                <div className="status-card">
                  <header className="status-card__header">
                    <div>
                      <p className="status-card__eyebrow">Scan job</p>
                      <h3>{scanStatus.jobId}</h3>
                    </div>
                    <span className="status-pill status-pill--neutral">{scanStatus.status}</span>
                  </header>
                  <dl className="status-grid">
                    <div>
                      <dt>Discovered</dt>
                      <dd>{scanStatus.discoveredEntries}</dd>
                    </div>
                    <div>
                      <dt>Files</dt>
                      <dd>{scanStatus.scannedFiles}</dd>
                    </div>
                    <div>
                      <dt>Directories</dt>
                      <dd>{scanStatus.scannedDirectories}</dd>
                    </div>
                    <div>
                      <dt>Page size</dt>
                      <dd>{scanStatus.pageSize}</dd>
                    </div>
                  </dl>
                  {scanProgress?.latestPath ? (
                    <p className="status-card__summary">Latest path: {scanProgress.latestPath}</p>
                  ) : null}
                  {scanStatus.errorMessage ? (
                    <p className="status-card__summary">Error: {scanStatus.errorMessage}</p>
                  ) : null}
                  <div className="button-row">
                    <button
                      className="action-button action-button--secondary"
                      disabled={
                        isRunningExpensiveAnalysis ||
                        scanStatus.status !== 'completed' ||
                        scanStatus.discoveredEntries === 0
                      }
                      onClick={handleRunExpensiveAnalysis}
                      type="button"
                    >
                      {isRunningExpensiveAnalysis ? 'Hashing…' : 'Run expensive analysis'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="empty-card empty-card--large">
                  <strong>Workflow overview</strong>
                  <p>
                    Start with a readiness check and scan, then this column will fill with
                    analysis, plan building, review decisions, and execution progress as each step
                    completes.
                  </p>
                </div>
              )}
              {analysisSummary ? (
                <div className="status-card">
                  <header className="status-card__header">
                    <div>
                      <p className="status-card__eyebrow">Analysis summary</p>
                      <h3>Reviewable results</h3>
                    </div>
                    <span className="status-pill status-pill--neutral">
                      {analysisSummary.noExtensionCount} no-ext / {analysisSummary.unknownCount} unknown
                    </span>
                  </header>
                  <dl className="status-grid">
                    {analysisSummary.categoryCounts.map((count) => (
                      <div key={count.category}>
                        <dt>{count.category}</dt>
                        <dd>{count.count}</dd>
                      </div>
                    ))}
                  </dl>
                  {analysisSummary.skippedLargeSyntheticFiles > 0 ? (
                    <p className="status-card__summary">
                      Expensive duplicate hashing skipped{' '}
                      {analysisSummary.skippedLargeSyntheticFiles} large synthetic placeholder
                      file{analysisSummary.skippedLargeSyntheticFiles === 1 ? '' : 's'} to avoid
                      reading through sparse multi-GB or multi-TB test data.
                    </p>
                  ) : null}
                </div>
              ) : null}
              {analysisSummary && presets.length > 0 ? (
                <div className="status-card">
                  <header className="status-card__header">
                    <div>
                      <p className="status-card__eyebrow">Preset planner</p>
                      <h3>Build a reviewable plan</h3>
                    </div>
                  </header>
                  <label className="field-label" htmlFor="preset-select">
                    Choose a built-in preset
                  </label>
                  <select
                    id="preset-select"
                    className="text-input"
                    value={selectedPresetId}
                    onChange={(event) => setSelectedPresetId(event.target.value)}
                  >
                    {presets.map((preset) => (
                      <option key={preset.presetId} value={preset.presetId}>
                        {preset.name}
                      </option>
                    ))}
                  </select>
                  {selectedPresetId ? (
                    <p className="status-card__summary">
                      {presets.find((preset) => preset.presetId === selectedPresetId)?.description}
                    </p>
                  ) : null}
                  <div className="button-row">
                    <button
                      className="action-button"
                      disabled={isBuildingPlan || !scanStatus?.jobId}
                      onClick={handleBuildPlan}
                      type="button"
                    >
                      {isBuildingPlan ? 'Building…' : 'Build plan'}
                    </button>
                  </div>
                </div>
              ) : null}
              {plan ? (
                <div className="status-card">
                  <header className="status-card__header">
                    <div>
                      <p className="status-card__eyebrow">Plan summary</p>
                      <h3>{plan.presetName}</h3>
                    </div>
                    <span className="status-pill status-pill--neutral">{plan.summary.totalActions} actions</span>
                  </header>
                  <dl className="status-grid">
                    <div>
                      <dt>Moves</dt>
                      <dd>{plan.summary.moveActions}</dd>
                    </div>
                    <div>
                      <dt>Review</dt>
                      <dd>{plan.summary.reviewActions}</dd>
                    </div>
                    <div>
                      <dt>Blocked</dt>
                      <dd>{plan.summary.blockedActions}</dd>
                    </div>
                    <div>
                      <dt>Skipped</dt>
                      <dd>{plan.summary.skippedActions}</dd>
                    </div>
                  </dl>
                  <p className="status-card__summary">Destination root: {plan.destinationRoot}</p>
                  <div className="detail-stack">
                    <div className="status-card__header">
                      <div>
                        <p className="status-card__eyebrow">Destination impact preview</p>
                        <h3>Read-only first look</h3>
                      </div>
                      <span className="status-pill status-pill--neutral">
                        {destinationImpactPreview?.affectedFolderCount ?? 0} folder
                        {destinationImpactPreview?.affectedFolderCount === 1 ? '' : 's'}
                      </span>
                    </div>
                    <p className="status-card__summary">
                      This preview only shows destinations Safepath can already name. It is meant to
                      answer “where will things land?” without pretending to be a full tree diff.
                    </p>
                    {destinationImpactPreview && destinationImpactPreview.routedActionCount > 0 ? (
                      <>
                        <dl className="status-grid">
                          <div>
                            <dt>Affected folders</dt>
                            <dd>{destinationImpactPreview.affectedFolderCount}</dd>
                          </div>
                          <div>
                            <dt>Routed actions</dt>
                            <dd>{destinationImpactPreview.routedActionCount}</dd>
                          </div>
                          <div>
                            <dt>Move actions</dt>
                            <dd>{destinationImpactPreview.moveActionCount}</dd>
                          </div>
                          <div>
                            <dt>No destination yet</dt>
                            <dd>{destinationImpactPreview.unresolvedActionCount}</dd>
                          </div>
                        </dl>
                        <p className="status-card__summary">
                          Review-only, blocked, and duplicate-only actions without a concrete
                          destination stay outside this preview until the plan becomes more specific.
                        </p>
                        <ul className="manifest-list">
                          {visibleDestinationPreviewFolders.map((folder) => (
                            <li
                              key={folder.folderPath}
                              className="manifest-list__item manifest-list__item--stacked"
                            >
                              <div>
                                <strong>{folder.relativeFolderPath}</strong>
                                <p>{folder.itemCount} planned item{folder.itemCount === 1 ? '' : 's'}</p>
                                <p>{folder.folderPath}</p>
                              </div>
                            </li>
                          ))}
                        </ul>
                        {destinationImpactPreview.folders.length > 5 ? (
                          <div className="button-row button-row--compact">
                            <button
                              className="action-button action-button--secondary"
                              onClick={() =>
                                setShowAllDestinationPreviewFolders((current) => !current)
                              }
                              type="button"
                            >
                              {showAllDestinationPreviewFolders
                                ? 'Show fewer folders'
                                : `Show all ${destinationImpactPreview.folders.length} folders`}
                            </button>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <p className="status-card__summary">
                        This plan does not have enough concrete destination paths to preview yet.
                        That is expected for duplicate-only or review-heavy plans.
                      </p>
                    )}
                  </div>
                  {approvedActionCount > 0 ? (
                    <div className="detail-stack">
                      <div className="status-card__header">
                        <div>
                          <p className="status-card__eyebrow">Execution checks</p>
                          <h3>
                            {hasExecutionPreflightErrors
                              ? 'Fix blocking issues before execute'
                              : executionPreflightWarnings.length > 0
                                ? 'Warnings to review before execute'
                                : 'Ready to execute'}
                          </h3>
                        </div>
                        <span className="status-pill status-pill--neutral">
                          {executionPreflightIssues.length} issue
                          {executionPreflightIssues.length === 1 ? '' : 's'}
                        </span>
                      </div>
                      <p className="status-card__summary">
                        Safepath checks approved actions before it moves anything, then runs the same
                        guardrails again at execute time.
                      </p>
                      {isLoadingExecutionPreflight ? (
                        <p className="status-card__summary">Refreshing execution checks…</p>
                      ) : executionPreflightIssues.length === 0 ? (
                        <p className="status-card__summary">
                          No blocking issues found. If files change again before you run the plan,
                          Safepath will re-check the plan at execution time.
                        </p>
                      ) : (
                        <>
                          {executionPreflightWarnings.length > 0 ? (
                            <p className="status-card__summary">
                              Warnings do not block execution. They usually mean a source path changed
                              since the last scan, so this plan may be stale.
                            </p>
                          ) : null}
                          <ul className="status-card__list">
                            {executionPreflightIssues.map((issue, index) => (
                              <li key={`${issue.actionId ?? 'session'}-${index}`}>
                                {issue.severity}: {issue.message}
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                      <div className="button-row button-row--compact">
                        <button
                          className="action-button action-button--secondary"
                          disabled={isLoadingExecutionPreflight}
                          onClick={() => void loadExecutionPreflight(plan.planId)}
                          type="button"
                        >
                          {isLoadingExecutionPreflight ? 'Refreshing checks…' : 'Refresh checks'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="status-card__summary">
                      Approve one or more actions to unlock execution checks and the final run step.
                    </p>
                  )}
                  <div className="button-row">
                    <button
                      className="action-button"
                      disabled={
                        executionIsActive ||
                        approvedActionCount === 0 ||
                        isLoadingExecutionPreflight ||
                        hasExecutionPreflightErrors
                      }
                      onClick={handleExecutePlan}
                      type="button"
                    >
                      {executionIsActive ? 'Executing…' : `Execute approved (${approvedActionCount})`}
                    </button>
                  </div>
                  <div className="review-bucket-row">
                    {(
                      [
                        ['all', 'All'],
                        ['blocked', 'Blocked'],
                        ['protected', 'Protected'],
                        ['duplicates', 'Duplicates'],
                        ['unknown', 'Unknown'],
                        ['approved', 'Approved'],
                        ['rejected', 'Rejected'],
                        ['needsChoice', 'Needs choice'],
                      ] as Array<[ReviewBucket, string]>
                    ).map(([bucket, label]) => (
                      <button
                        key={bucket}
                        className={`review-bucket ${activeReviewBucket === bucket ? 'review-bucket--active' : ''}`}
                        onClick={() => setActiveReviewBucket(bucket)}
                        type="button"
                      >
                        {label} ({countBucket(plan, bucket)})
                      </button>
                    ))}
                  </div>
                  {reviewActionPage.totalItems > 0 ? (
                    <p className="status-card__summary">
                      Showing {reviewActionPage.rangeStart}-{reviewActionPage.rangeEnd} of{' '}
                      {reviewActionPage.totalItems} action
                      {reviewActionPage.totalItems === 1 ? '' : 's'} in this filter.
                    </p>
                  ) : null}
                  <div className="button-row">
                    <button
                      className="action-button action-button--secondary"
                      disabled={reviewActionPage.page === 0}
                      onClick={() => handleChangeReviewPage(reviewActionPage.page - 1)}
                      type="button"
                    >
                      Previous actions
                    </button>
                    <button
                      className="action-button action-button--secondary"
                      disabled={
                        reviewActionPage.totalPages === 0 ||
                        reviewActionPage.page >= reviewActionPage.totalPages - 1
                      }
                      onClick={() => handleChangeReviewPage(reviewActionPage.page + 1)}
                      type="button"
                    >
                      Next actions
                    </button>
                  </div>
                  {reviewActionPage.totalItems > 0 ? (
                    <ul className="manifest-list">
                      {reviewActionPage.items.map((action) => (
                        <li
                          key={action.actionId}
                          className={`manifest-list__item manifest-list__item--stacked ${
                            selectedAction?.actionId === action.actionId ? 'manifest-list__item--selected' : ''
                          }`}
                        >
                          <div className="review-item-main" onClick={() => setSelectedActionId(action.actionId)}>
                            <strong>{action.sourcePath}</strong>
                            <p>
                              {action.destinationPath ??
                                action.explanation.blockedReason ??
                                'No destination preview.'}
                            </p>
                            <p>
                              {action.actionKind} | {action.reviewState}
                              {action.explanation.conflictStatus
                                ? ` | ${action.explanation.conflictStatus}`
                                : ''}
                            </p>
                          </div>
                          <div className="button-row button-row--compact">
                            <button
                              className="action-button"
                              disabled={
                                isUpdatingReview ||
                                action.reviewState === 'blocked' ||
                                action.reviewState === 'executed'
                              }
                              onClick={() => handleReviewDecision([action.actionId], 'approve')}
                              type="button"
                            >
                              Approve
                            </button>
                            <button
                              className="action-button action-button--secondary"
                              disabled={
                                isUpdatingReview ||
                                action.reviewState === 'blocked' ||
                                action.reviewState === 'executed'
                              }
                              onClick={() => handleReviewDecision([action.actionId], 'reject')}
                              type="button"
                            >
                              Reject
                            </button>
                            <button
                              className="action-button action-button--secondary"
                              disabled={isUpdatingReview || action.reviewState === 'executed'}
                              onClick={() => handleReviewDecision([action.actionId], 'reset')}
                              type="button"
                            >
                              Reset
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="empty-card">
                      <strong>No actions in this filter</strong>
                      <p>Pick a different review bucket or rebuild the plan to inspect more work.</p>
                    </div>
                  )}
                </div>
              ) : null}
              {selectedAction ? (
                <div className="status-card">
                  <header className="status-card__header">
                    <div>
                      <p className="status-card__eyebrow">Action explanation</p>
                      <h3>{selectedAction.sourcePath}</h3>
                    </div>
                    <span className="status-pill status-pill--neutral">{selectedAction.reviewState}</span>
                  </header>
                  <div className="detail-stack">
                    <p>
                      Rule: {selectedAction.explanation.matchedRule ?? 'fallback'} | Confidence:{' '}
                      {selectedAction.explanation.confidence.toFixed(2)}
                    </p>
                    {selectedAction.destinationPath ? (
                      <p>Destination: {selectedAction.destinationPath}</p>
                    ) : null}
                    {selectedAction.explanation.conflictStatus ? (
                      <p>
                        Conflict: {selectedAction.explanation.conflictStatus}
                        {selectedAction.explanation.destinationConflictPath
                          ? ` at ${selectedAction.explanation.destinationConflictPath}`
                          : ''}
                      </p>
                    ) : null}
                    {selectedAction.explanation.blockedReason ? (
                      <p>Blocked reason: {selectedAction.explanation.blockedReason}</p>
                    ) : null}
                    {selectedAction.explanation.templateUsed ? (
                      <>
                        <p>Template: {selectedAction.explanation.templateUsed}</p>
                        {selectedAction.explanation.previewedTemplateOutput ? (
                          <p>
                            Rendered path: {selectedAction.explanation.previewedTemplateOutput}
                          </p>
                        ) : null}
                      </>
                    ) : null}
                    {selectedAction.explanation.templateError ? (
                      <p>
                        Template error: {selectedAction.explanation.templateError}. Unknown or invalid
                        tokens stay blocked until the plan is rebuilt with a valid preset.
                      </p>
                    ) : null}
                    {selectedAction.explanation.matchedConditions.length > 0 ? (
                      <p>Matched: {selectedAction.explanation.matchedConditions.join(' | ')}</p>
                    ) : null}
                    {selectedAction.explanation.safetyFlags.length > 0 ? (
                      <p>Safety flags: {selectedAction.explanation.safetyFlags.join(', ')}</p>
                    ) : null}
                    {selectedAction.explanation.notes.length > 0 ? (
                      <p>{selectedAction.explanation.notes.join(' ')}</p>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {executionSession ? (
                <div className="status-card">
                  <header className="status-card__header">
                    <div>
                      <p className="status-card__eyebrow">Execution session</p>
                      <h3>{executionSession.sessionId}</h3>
                    </div>
                    <span className="status-pill status-pill--neutral">{executionSession.status}</span>
                  </header>
                  <dl className="status-grid">
                    <div>
                      <dt>Approved</dt>
                      <dd>{executionSession.approvedActionCount}</dd>
                    </div>
                    <div>
                      <dt>Completed</dt>
                      <dd>{executionSession.completedActionCount}</dd>
                    </div>
                    <div>
                      <dt>Failed</dt>
                      <dd>{executionSession.failedActionCount}</dd>
                    </div>
                    <div>
                      <dt>Skipped</dt>
                      <dd>{executionSession.skippedActionCount}</dd>
                    </div>
                  </dl>
                  <p className="status-card__summary">
                    Progress:{' '}
                    {executionSession.completedActionCount +
                      executionSession.failedActionCount +
                      executionSession.skippedActionCount}
                    /{executionSession.approvedActionCount}
                  </p>
                  <p className="status-card__summary">
                    Undo remains best-effort after execution. Safepath can only reverse actions that
                    still have a valid destination or holding path and were recorded as rollback-safe.
                  </p>
                  {executionSession.preflightIssues.length > 0 ? (
                    <>
                      <p className="status-card__summary">
                        Safepath recorded these final execution checks before the run started. Warning
                        items usually mean the plan may be stale.
                      </p>
                      <ul className="status-card__list">
                        {executionSession.preflightIssues.map((issue, index) => (
                          <li key={`${issue.actionId ?? 'session'}-${index}`}>
                            {issue.severity}: {issue.message}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                  {executionSession.records.length > 0 ? (
                    <>
                      <p className="status-card__summary">
                        Showing {executionRecordPage.rangeStart}-{executionRecordPage.rangeEnd} of{' '}
                        {executionRecordPage.totalItems} execution record
                        {executionRecordPage.totalItems === 1 ? '' : 's'}.
                      </p>
                      <div className="button-row">
                        <button
                          className="action-button action-button--secondary"
                          disabled={executionRecordPage.page === 0}
                          onClick={() => setExecutionRecordPageIndex(executionRecordPage.page - 1)}
                          type="button"
                        >
                          Previous records
                        </button>
                        <button
                          className="action-button action-button--secondary"
                          disabled={
                            executionRecordPage.totalPages === 0 ||
                            executionRecordPage.page >= executionRecordPage.totalPages - 1
                          }
                          onClick={() => setExecutionRecordPageIndex(executionRecordPage.page + 1)}
                          type="button"
                        >
                          Next records
                        </button>
                      </div>
                      <ul className="manifest-list">
                        {executionRecordPage.items.map((record) => (
                          <li key={record.recordId} className="manifest-list__item manifest-list__item--stacked">
                            <div>
                              <strong>{record.sourcePath}</strong>
                              <p>{record.destinationPath ?? record.message ?? 'No destination recorded.'}</p>
                              <p>
                                {formatExecutionStrategy(record.strategy)} | {record.status}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          }
          right={
            <div className="placeholder-stack">
              {plan?.duplicateGroups.length ? (
                <div className="status-card">
                  <header className="status-card__header">
                    <div>
                      <p className="status-card__eyebrow">Duplicate review groups</p>
                      <h3>{plan.duplicateGroups.length} groups</h3>
                    </div>
                  </header>
                  <p className="status-card__summary">
                    Showing {reviewGroupPage.rangeStart}-{reviewGroupPage.rangeEnd} of{' '}
                    {reviewGroupPage.totalItems} duplicate review group
                    {reviewGroupPage.totalItems === 1 ? '' : 's'}.
                  </p>
                  <div className="button-row">
                    <button
                      className="action-button action-button--secondary"
                      disabled={reviewGroupPage.page === 0}
                      onClick={() => setReviewGroupPageIndex(reviewGroupPage.page - 1)}
                      type="button"
                    >
                      Previous groups
                    </button>
                    <button
                      className="action-button action-button--secondary"
                      disabled={
                        reviewGroupPage.totalPages === 0 ||
                        reviewGroupPage.page >= reviewGroupPage.totalPages - 1
                      }
                      onClick={() => setReviewGroupPageIndex(reviewGroupPage.page + 1)}
                      type="button"
                    >
                      Next groups
                    </button>
                  </div>
                  <ul className="manifest-list">
                    {reviewGroupPage.items.map((group) => (
                      <li
                        key={group.groupId}
                        className={`manifest-list__item manifest-list__item--stacked ${
                          selectedDuplicateGroup?.groupId === group.groupId
                            ? 'manifest-list__item--selected'
                            : ''
                        }`}
                      >
                        <div
                          className="review-item-main"
                          onClick={() => setSelectedDuplicateGroupId(group.groupId)}
                        >
                          <strong>{group.representativeName}</strong>
                          <p>
                            {group.itemCount} items | {group.certainty}
                          </p>
                          <p>
                            Keeper:{' '}
                            {group.selectedKeeperEntryId ??
                              group.recommendedKeeperEntryId ??
                              'Select a keeper'}
                          </p>
                          {group.recommendedKeeperReason ? (
                            <p>{group.recommendedKeeperReason}</p>
                          ) : null}
                        </div>
                        <div className="button-row button-row--compact">
                          {group.memberEntryIds.map((entryId) => (
                            <button
                              key={entryId}
                              className={`action-button action-button--secondary ${
                                group.selectedKeeperEntryId === entryId ? 'action-button--selected' : ''
                              }`}
                              disabled={isUpdatingReview}
                              onClick={() => handleSetDuplicateKeeper(group, entryId)}
                              type="button"
                            >
                              {group.selectedKeeperEntryId === entryId ? 'Keeper' : `Keep ${entryId}`}
                            </button>
                          ))}
                          <button
                            className="action-button"
                            disabled={isUpdatingReview || group.selectedKeeperEntryId === null}
                            onClick={() => handleReviewDecision(group.memberActionIds, 'approve')}
                            type="button"
                          >
                            Approve group
                          </button>
                          <button
                            className="action-button action-button--secondary"
                            disabled={isUpdatingReview}
                            onClick={() => handleReviewDecision(group.memberActionIds, 'reject')}
                            type="button"
                          >
                            Reject group
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {selectedDuplicateGroup ? (
                    <div className="detail-stack">
                      <header className="status-card__header">
                        <div>
                          <p className="status-card__eyebrow">Keeper confidence</p>
                          <h3>{selectedDuplicateGroup.representativeName}</h3>
                        </div>
                        <span className="status-pill status-pill--neutral">
                          {duplicateGroupDetails?.members.length ?? selectedDuplicateGroup.itemCount} files
                        </span>
                      </header>
                      <p className="status-card__summary">
                        Compare paths, timestamps, and sizes before you commit to a keeper.
                        Safepath's recommendation is only a starting point.
                      </p>
                      {selectedDuplicateGroup.recommendedKeeperReason ? (
                        <p className="status-card__summary">
                          Suggested keeper: {selectedDuplicateGroup.recommendedKeeperEntryId ?? 'none yet'}.
                          {' '}
                          {selectedDuplicateGroup.recommendedKeeperReason}
                        </p>
                      ) : null}
                      {isLoadingDuplicateGroupDetails ? (
                        <p className="status-card__summary">Loading duplicate details…</p>
                      ) : duplicateGroupDetails ? (
                        <ul className="manifest-list">
                          {duplicateGroupDetails.members.map((member) => (
                            <li
                              key={member.entryId}
                              className="manifest-list__item manifest-list__item--stacked"
                            >
                              <div>
                                <strong>{member.name}</strong>
                                <p>{member.path}</p>
                                <p>
                                  {formatBytes(member.sizeBytes)} | Modified{' '}
                                  {formatTimestamp(member.modifiedAtEpochMs)} | Created{' '}
                                  {formatTimestamp(member.createdAtEpochMs)}
                                </p>
                                {member.mediaDateSource ? (
                                  <p>
                                    Media date {formatTimestamp(member.mediaDateEpochMs)} from{' '}
                                    {formatMediaDateSource(member.mediaDateSource)}
                                  </p>
                                ) : null}
                                <p>
                                  Review state: {member.reviewState ?? 'not tracked'}
                                  {member.isRecommendedKeeper ? ' | suggested keeper' : ''}
                                  {member.isSelectedKeeper ? ' | selected keeper' : ''}
                                </p>
                              </div>
                              <div className="button-row button-row--compact">
                                <button
                                  className={`action-button action-button--secondary ${
                                    member.isSelectedKeeper ? 'action-button--selected' : ''
                                  }`}
                                  disabled={isUpdatingReview}
                                  onClick={() =>
                                    handleSetDuplicateKeeper(selectedDuplicateGroup, member.entryId)
                                  }
                                  type="button"
                                >
                                  {member.isSelectedKeeper ? 'Keeper selected' : 'Use as keeper'}
                                </button>
                                <button
                                  className="action-button action-button--secondary"
                                  onClick={() => void handleRevealPath(member.path)}
                                  type="button"
                                >
                                  Reveal path
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="status-card__summary">
                          Pick a duplicate group to inspect its members in more detail.
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="status-card">
                <header className="status-card__header">
                  <div>
                    <p className="status-card__eyebrow">Destination selection</p>
                    <h3>Destination folder</h3>
                  </div>
                  <span className="status-pill status-pill--neutral">
                    {draftDestinationPath ? 'configured' : 'missing'}
                  </span>
                </header>
                <label className="field-label" htmlFor="destination-path">
                  Enter the primary destination folder
                </label>
                <input
                  id="destination-path"
                  className="text-input"
                  placeholder="/Users/siggewidmark/Organized"
                  value={destinationInput}
                  onChange={(event) => setDestinationInput(event.target.value)}
                />
                <p className="status-card__summary">
                  Sprint 1 uses a single destination root explicitly. The backend still keeps a
                  destination path list so future modes can expand this safely.
                </p>
                {status && status.destinationPaths.length > 1 ? (
                  <p className="status-card__summary">
                    {status.destinationPaths.length - 1} extra stored destination path
                    {status.destinationPaths.length - 1 === 1 ? '' : 's'} will be ignored until a
                    future multi-destination mode exists.
                  </p>
                ) : null}
              </div>
              {manifestPage ? (
                <div className="status-card">
                  <header className="status-card__header">
                    <div>
                      <p className="status-card__eyebrow">Manifest page</p>
                      <h3>
                        Page {manifestPage.page + 1}
                        {manifestPage.totalPages > 0 ? ` / ${manifestPage.totalPages}` : ''}
                      </h3>
                    </div>
                    <span className="status-pill status-pill--neutral">
                      {manifestPage.totalEntries} entries
                    </span>
                  </header>
                  {manifestPage.entries.length > 0 ? (
                    <p className="status-card__summary">
                      Showing {manifestPage.page * manifestPage.pageSize + 1}-
                      {manifestPage.page * manifestPage.pageSize + manifestPage.entries.length} of{' '}
                      {manifestPage.totalEntries} manifest entries.
                    </p>
                  ) : null}
                  <div className="button-row">
                    <button
                      className="action-button action-button--secondary"
                      disabled={manifestPage.page === 0}
                      onClick={() => setManifestPageIndex(manifestPage.page - 1)}
                      type="button"
                    >
                      Previous page
                    </button>
                    <button
                      className="action-button action-button--secondary"
                      disabled={
                        manifestPage.totalPages === 0 ||
                        manifestPage.page >= manifestPage.totalPages - 1
                      }
                      onClick={() => setManifestPageIndex(manifestPage.page + 1)}
                      type="button"
                    >
                      Next page
                    </button>
                  </div>
                  <ul className="manifest-list">
                    {manifestPage.entries.map((entry) => (
                      <li key={entry.entryId} className="manifest-list__item">
                        <div>
                          <strong>{entry.name}</strong>
                          <p>{entry.relativePath}</p>
                          {entry.mediaDateSource ? (
                            <p>
                              Media date {formatTimestamp(entry.mediaDateEpochMs)} from{' '}
                              {formatMediaDateSource(entry.mediaDateSource)}
                            </p>
                          ) : null}
                        </div>
                        <span>{entry.entryKind}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="empty-card">
                  <strong>No manifest page yet</strong>
                  <p>After a scan starts, Safepath will page raw manifest rows into this panel.</p>
                </div>
              )}
              {analysisSummary ? (
                <>
                  <div className="status-card">
                    <header className="status-card__header">
                      <div>
                        <p className="status-card__eyebrow">Duplicate groups</p>
                        <h3>{analysisSummary.likelyDuplicateGroups.length} groups</h3>
                      </div>
                    </header>
                    {analysisSummary.likelyDuplicateGroups.length > 0 ? (
                      <>
                        <p className="status-card__summary">
                          Showing {analysisDuplicatePage.rangeStart}-{analysisDuplicatePage.rangeEnd}{' '}
                          of {analysisDuplicatePage.totalItems} detected duplicate group
                          {analysisDuplicatePage.totalItems === 1 ? '' : 's'}.
                        </p>
                        <div className="button-row">
                          <button
                            className="action-button action-button--secondary"
                            disabled={analysisDuplicatePage.page === 0}
                            onClick={() =>
                              setAnalysisDuplicatePageIndex(analysisDuplicatePage.page - 1)
                            }
                            type="button"
                          >
                            Previous groups
                          </button>
                          <button
                            className="action-button action-button--secondary"
                            disabled={
                              analysisDuplicatePage.totalPages === 0 ||
                              analysisDuplicatePage.page >= analysisDuplicatePage.totalPages - 1
                            }
                            onClick={() =>
                              setAnalysisDuplicatePageIndex(analysisDuplicatePage.page + 1)
                            }
                            type="button"
                          >
                            Next groups
                          </button>
                        </div>
                        <ul className="manifest-list">
                          {analysisDuplicatePage.items.map((group) => (
                          <li key={group.groupId} className="manifest-list__item">
                            <div>
                              <strong>{group.representativeName}</strong>
                              <p>
                                {group.itemCount} items with {group.certainty} duplicate certainty.
                              </p>
                            </div>
                            <span>{group.certainty}</span>
                          </li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <p className="status-card__summary">No duplicate groups detected yet.</p>
                    )}
                  </div>

                  <div className="status-card">
                    <header className="status-card__header">
                      <div>
                        <p className="status-card__eyebrow">Protection badges</p>
                        <h3>{analysisSummary.detectedProtections.length} detected paths</h3>
                      </div>
                    </header>
                    {analysisSummary.detectedProtections.length > 0 ? (
                      <>
                        <p className="status-card__summary">
                          Showing {protectionPage.rangeStart}-{protectionPage.rangeEnd} of{' '}
                          {protectionPage.totalItems} detected protection path
                          {protectionPage.totalItems === 1 ? '' : 's'}.
                        </p>
                        <div className="button-row">
                          <button
                            className="action-button action-button--secondary"
                            disabled={protectionPage.page === 0}
                            onClick={() => setProtectionPageIndex(protectionPage.page - 1)}
                            type="button"
                          >
                            Previous paths
                          </button>
                          <button
                            className="action-button action-button--secondary"
                            disabled={
                              protectionPage.totalPages === 0 ||
                              protectionPage.page >= protectionPage.totalPages - 1
                            }
                            onClick={() => setProtectionPageIndex(protectionPage.page + 1)}
                            type="button"
                          >
                            Next paths
                          </button>
                        </div>
                        <ul className="manifest-list">
                          {protectionPage.items.map((detection: ProtectionDetectionDto) => (
                            <li key={detection.path} className="manifest-list__item manifest-list__item--stacked">
                              <div>
                                <strong>{detection.path}</strong>
                                <p>{detection.reasons[0] ?? 'Protected path detected.'}</p>
                              </div>
                              <div className="button-row button-row--compact">
                                <span className="status-pill status-pill--neutral">{detection.state}</span>
                                <button
                                  className="action-button action-button--secondary"
                                  onClick={() => handleProtectPath(detection.path)}
                                  disabled={isOverridden(detection.path)}
                                  type="button"
                                >
                                  {isOverridden(detection.path) ? 'Protected' : 'Mark protected'}
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <p className="status-card__summary">No project or protection markers detected yet.</p>
                    )}
                  </div>
                </>
              ) : (
                <div className="empty-card">
                  <strong>Analysis pending</strong>
                  <p>After a scan completes, cheap analysis results will appear here.</p>
                </div>
              )}
            </div>
          }
        />
      )}
    </div>
  )
}

export default App
