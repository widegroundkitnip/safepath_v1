import { useEffect, useMemo, useState } from 'react'

import './App.css'
import { AppStatusSummary } from './components/layout/AppStatusSummary'
import { WorkflowShell } from './components/layout/WorkflowShell'
import { PermissionReadinessCard } from './components/permissions/PermissionReadinessCard'
import {
  buildPlan,
  cancelScan,
  executePlan,
  generateSyntheticDataset,
  getAnalysisSummary,
  getAppStatus,
  getExecutionStatus,
  getHistoryPage,
  getLearnerDraftPreviews,
  getLearnerObservations,
  getLearnerSuggestions,
  getManifestPage,
  getPlan,
  isDesktopRuntimeAvailable,
  onExecutionCompleted,
  onExecutionProgress,
  getPresets,
  getScanStatus,
  onScanProgress,
  recordLearnerSuggestionFeedback,
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
  PlannedActionDto,
  PresetDefinitionDto,
  ProtectionDetectionDto,
  ReviewDecision,
  ScanJobStatusDto,
  ScanProgressEvent,
  SyntheticDatasetCategory,
} from './types/app'

function parsePaths(value: string) {
  return value
    .split('\n')
    .map((path) => path.trim())
    .filter(Boolean)
}

function formatTimestamp(epochMs: number | null) {
  if (epochMs === null) {
    return 'Not recorded'
  }

  return new Date(epochMs).toLocaleString()
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return 'Unknown size'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }

  return `${value.toFixed(value >= 100 || index === 0 ? 0 : 1)} ${units[index]}`
}

type ReviewBucket =
  | 'all'
  | 'blocked'
  | 'protected'
  | 'duplicates'
  | 'unknown'
  | 'approved'
  | 'rejected'
  | 'needsChoice'

function actionMatchesBucket(action: PlannedActionDto, bucket: ReviewBucket) {
  switch (bucket) {
    case 'blocked':
      return action.reviewState === 'blocked'
    case 'protected':
      return action.explanation.safetyFlags.includes('protected')
    case 'duplicates':
      return action.duplicateGroupId !== null
    case 'unknown':
      return (
        action.explanation.safetyFlags.includes('unknownFile') ||
        action.explanation.safetyFlags.includes('noExtension')
      )
    case 'approved':
      return action.reviewState === 'approved'
    case 'rejected':
      return action.reviewState === 'rejected'
    case 'needsChoice':
      return action.reviewState === 'needsChoice'
    default:
      return true
  }
}

function countBucket(plan: PlanDto, bucket: ReviewBucket) {
  return plan.actions.filter((action) => actionMatchesBucket(action, bucket)).length
}

function formatExecutionStrategy(strategy: string) {
  switch (strategy) {
    case 'sameVolumeMove':
      return 'Same-volume move'
    case 'crossVolumeSafeMove':
      return 'Cross-volume safe move'
    case 'copyOnly':
      return 'Copy-only'
    case 'duplicateConsolidate':
      return 'Duplicate consolidate'
    case 'deleteToTrash':
      return 'Safepath trash hold'
    default:
      return strategy
  }
}

function formatSyntheticCategory(category: SyntheticDatasetCategory) {
  return SYNTHETIC_CATEGORY_OPTIONS.find((option) => option.category === category)?.label ?? category
}

const MANIFEST_PAGE_SIZE = 25
const HISTORY_PAGE_SIZE = 12
const REVIEW_ACTION_PAGE_SIZE = 8
const REVIEW_GROUP_PAGE_SIZE = 4
const HISTORY_SESSION_RECORD_PAGE_SIZE = 8
const EXECUTION_RECORD_PAGE_SIZE = 6
const ANALYSIS_DUPLICATE_PAGE_SIZE = 4
const PROTECTION_PAGE_SIZE = 4
const SYNTHETIC_CATEGORY_OPTIONS: Array<{
  category: SyntheticDatasetCategory
  label: string
  description: string
}> = [
  { category: 'documents', label: 'Documents', description: 'Notes, docs, text, and pages files.' },
  { category: 'pdfs', label: 'PDFs', description: 'Invoices, manuals, reports, and scans.' },
  {
    category: 'spreadsheets',
    label: 'Spreadsheets',
    description: 'Budgets, CSV exports, and tracking sheets.',
  },
  { category: 'images', label: 'Images', description: 'JPEG, PNG, and edited image exports.' },
  {
    category: 'rawImages',
    label: 'RAW images',
    description: 'Camera originals with larger photo placeholder files.',
  },
  { category: 'videos', label: 'Videos', description: 'Movies, clips, exports, and large media.' },
  { category: 'archives', label: 'Archives', description: 'ZIP, RAR, tar, and backup bundles.' },
  { category: 'audio', label: 'Audio', description: 'Voice memos, music, and long recordings.' },
  {
    category: 'codeProjects',
    label: 'Code/projects',
    description: 'Scripts, configs, manifests, and repo-like files.',
  },
  {
    category: 'mixedClutter',
    label: 'Mixed clutter',
    description: 'Messy leftovers, installers, old exports, and random files.',
  },
]
const SYNTHETIC_SIZE_OPTIONS = [
  { label: '250 GB apparent size', bytes: 250 * 1024 ** 3 },
  { label: '1 TB apparent size', bytes: 1024 ** 4 },
  { label: '3 TB apparent size', bytes: 3 * 1024 ** 4 },
  { label: '10 TB apparent size', bytes: 10 * 1024 ** 4 },
]

function paginateItems<T>(items: T[], requestedPage: number, pageSize: number) {
  const totalItems = items.length
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize)
  const page = totalPages === 0 ? 0 : Math.min(Math.max(requestedPage, 0), totalPages - 1)
  const startIndex = page * pageSize
  const pageItems = items.slice(startIndex, startIndex + pageSize)
  const rangeStart = pageItems.length === 0 ? 0 : startIndex + 1
  const rangeEnd = pageItems.length === 0 ? 0 : startIndex + pageItems.length

  return {
    items: pageItems,
    page,
    totalItems,
    totalPages,
    rangeStart,
    rangeEnd,
  }
}

function isDuplicateKeeperObservation(
  observation: LearnerObservationDto,
): observation is Extract<LearnerObservationDto, { kind: 'duplicateKeeperSelection' }> {
  return observation.kind === 'duplicateKeeperSelection'
}

function isPlannedActionReviewDecisionObservation(
  observation: LearnerObservationDto,
): observation is Extract<LearnerObservationDto, { kind: 'plannedActionReviewDecision' }> {
  return observation.kind === 'plannedActionReviewDecision'
}

function isSuggestionFeedbackObservation(
  observation: LearnerObservationDto,
): observation is Extract<LearnerObservationDto, { kind: 'suggestionFeedback' }> {
  return observation.kind === 'suggestionFeedback'
}

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
  const [reviewPageIndex, setReviewPageIndex] = useState(0)
  const [reviewGroupPageIndex, setReviewGroupPageIndex] = useState(0)
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
  const [isBuildingPlan, setIsBuildingPlan] = useState(false)
  const [isUpdatingReview, setIsUpdatingReview] = useState(false)
  const [isExecutingPlan, setIsExecutingPlan] = useState(false)
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
  const approvedActionCount =
    plan?.actions.filter((action) => action.reviewState === 'approved').length ?? 0
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
      return
    }

    if (!selectedActionId || !filteredPlanActions.some((action) => action.actionId === selectedActionId)) {
      setSelectedActionId(filteredPlanActions[0]?.actionId ?? null)
    }
  }, [plan, filteredPlanActions, selectedActionId])

  useEffect(() => {
    setReviewPageIndex(0)
    setReviewGroupPageIndex(0)
  }, [plan?.planId])

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
      setError(nextError instanceof Error ? nextError.message : 'Failed to generate synthetic data.')
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
        nextError instanceof Error
          ? nextError.message
          : 'Failed to generate and scan synthetic data.',
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
      const summary = await runExpensiveAnalysis(scanStatus.jobId)
      setAnalysisSummary(summary)
      setStatus(await getAppStatus())
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to run expensive analysis.')
    } finally {
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
        <section className="settings-shell">
          <div className="placeholder-stack">
            <div className="status-card">
              <header className="status-card__header">
                <div>
                  <p className="status-card__eyebrow">Settings overview</p>
                  <h3>Workflow defaults and learner controls</h3>
                </div>
              </header>
              <p className="status-card__summary">
                This view is where Safepath collects reusable controls that apply across scans and
                review sessions. Today it surfaces learner suggestions, saved draft presets, and
                observation history while the workflow view handles live scan, review, and
                execution tasks.
              </p>
            </div>
            <div className="status-card">
              <header className="status-card__header">
                <div>
                  <p className="status-card__eyebrow">Synthetic test data</p>
                  <h3>Generate messy fake datasets for scanning</h3>
                </div>
                <span className="status-pill status-pill--neutral">testing utility</span>
              </header>
              <p className="status-card__summary">
                Create a realistic, messy folder tree with fake files and sparse large placeholders.
                The generated root can then be used as a scan source without consuming the real disk
                space suggested by the apparent file sizes.
              </p>
              <label className="field-label" htmlFor="synthetic-output-root">
                Output root folder
              </label>
              <input
                id="synthetic-output-root"
                className="text-input"
                onChange={(event) => setSyntheticOutputRoot(event.target.value)}
                placeholder="/Volumes/TestData or /Users/name/Desktop"
                type="text"
                value={syntheticOutputRoot}
              />
              <div className="button-row button-row--compact">
                <button
                  className="action-button action-button--secondary"
                  onClick={() => setSyntheticOutputRoot(draftDestinationPath)}
                  type="button"
                >
                  Use current destination path
                </button>
              </div>
              <label className="field-label" htmlFor="synthetic-dataset-name">
                Dataset folder name
              </label>
              <input
                id="synthetic-dataset-name"
                className="text-input"
                onChange={(event) => setSyntheticDatasetName(event.target.value)}
                type="text"
                value={syntheticDatasetName}
              />
              <div className="synthetic-settings-grid">
                <div>
                  <label className="field-label" htmlFor="synthetic-size-target">
                    Apparent size target
                  </label>
                  <select
                    id="synthetic-size-target"
                    className="text-input"
                    onChange={(event) => setSyntheticTargetApparentSizeBytes(Number(event.target.value))}
                    value={syntheticTargetApparentSizeBytes}
                  >
                    {SYNTHETIC_SIZE_OPTIONS.map((option) => (
                      <option key={option.bytes} value={option.bytes}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor="synthetic-depth">
                    Max folder depth
                  </label>
                  <select
                    id="synthetic-depth"
                    className="text-input"
                    onChange={(event) => setSyntheticMaxDepth(Number(event.target.value))}
                    value={syntheticMaxDepth}
                  >
                    {[2, 3, 4, 5, 6].map((depth) => (
                      <option key={depth} value={depth}>
                        {depth} levels
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor="synthetic-messiness">
                    Messiness
                  </label>
                  <select
                    id="synthetic-messiness"
                    className="text-input"
                    onChange={(event) => setSyntheticMessinessLevel(Number(event.target.value))}
                    value={syntheticMessinessLevel}
                  >
                    <option value={1}>Light</option>
                    <option value={2}>Moderate</option>
                    <option value={3}>Busy</option>
                    <option value={4}>Messy</option>
                    <option value={5}>Chaotic</option>
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor="synthetic-duplicate-rate">
                    Duplicate rate
                  </label>
                  <input
                    id="synthetic-duplicate-rate"
                    className="text-input"
                    max={80}
                    min={0}
                    onChange={(event) =>
                      setSyntheticDuplicateRatePercent(Number(event.target.value) || 0)
                    }
                    type="number"
                    value={syntheticDuplicateRatePercent}
                  />
                </div>
              </div>
              <div className="synthetic-toggle-list">
                <label className="synthetic-checkbox">
                  <input
                    checked={syntheticIncludeHiddenFiles}
                    onChange={(event) => setSyntheticIncludeHiddenFiles(event.target.checked)}
                    type="checkbox"
                  />
                  Include hidden clutter files
                </label>
                <label className="synthetic-checkbox">
                  <input
                    checked={syntheticIncludeEmptyFolders}
                    onChange={(event) => setSyntheticIncludeEmptyFolders(event.target.checked)}
                    type="checkbox"
                  />
                  Include empty folders
                </label>
              </div>
              <p className="status-card__summary">
                Categories decide which kinds of files appear in the generated tree.
              </p>
              <div className="synthetic-category-grid">
                {SYNTHETIC_CATEGORY_OPTIONS.map((option) => {
                  const selected = syntheticCategories.includes(option.category)
                  return (
                    <button
                      key={option.category}
                      className={`synthetic-category-chip ${
                        selected ? 'synthetic-category-chip--selected' : ''
                      }`}
                      onClick={() => toggleSyntheticCategory(option.category)}
                      type="button"
                    >
                      <strong>{option.label}</strong>
                      <span>{option.description}</span>
                    </button>
                  )
                })}
              </div>
              <div className="button-row">
                <button
                  className="action-button"
                  disabled={isGeneratingSyntheticData}
                  onClick={handleGenerateSyntheticDataset}
                  type="button"
                >
                  {isGeneratingSyntheticData ? 'Generating…' : 'Generate dataset'}
                </button>
                <button
                  className="action-button action-button--secondary"
                  disabled={isGeneratingSyntheticData || draftDestinationPaths.length === 0}
                  onClick={handleGenerateAndScanSyntheticDataset}
                  type="button"
                >
                  {isGeneratingSyntheticData ? 'Preparing scan…' : 'Generate and scan'}
                </button>
              </div>
              {syntheticDatasetResult ? (
                <div className="synthetic-result-card">
                  <header className="status-card__header">
                    <div>
                      <p className="status-card__eyebrow">Last generated dataset</p>
                      <h3>{syntheticDatasetResult.datasetName}</h3>
                    </div>
                    <span className="status-pill status-pill--ready">
                      {formatBytes(syntheticDatasetResult.apparentSizeBytes)}
                    </span>
                  </header>
                  <dl className="status-grid">
                    <div>
                      <dt>Root</dt>
                      <dd>{syntheticDatasetResult.rootPath}</dd>
                    </div>
                    <div>
                      <dt>Files</dt>
                      <dd>{syntheticDatasetResult.fileCount}</dd>
                    </div>
                    <div>
                      <dt>Folders</dt>
                      <dd>{syntheticDatasetResult.directoryCount}</dd>
                    </div>
                    <div>
                      <dt>Sparse files</dt>
                      <dd>{syntheticDatasetResult.sparseFileCount}</dd>
                    </div>
                    <div>
                      <dt>Estimated actual size</dt>
                      <dd>{formatBytes(syntheticDatasetResult.estimatedActualSizeBytes)}</dd>
                    </div>
                    <div>
                      <dt>Hash skip threshold</dt>
                      <dd>{formatBytes(syntheticDatasetResult.hashSkipThresholdBytes)}</dd>
                    </div>
                  </dl>
                  <p className="status-card__summary">
                    Created {formatTimestamp(syntheticDatasetResult.createdAtEpochMs)}. Manifest:{' '}
                    {syntheticDatasetResult.manifestPath}
                  </p>
                  {syntheticDatasetResult.categoryCounts.length > 0 ? (
                    <ul className="manifest-list">
                      {syntheticDatasetResult.categoryCounts.map((count) => (
                        <li key={count.category} className="manifest-list__item">
                          <strong>{formatSyntheticCategory(count.category)}</strong>
                          <span>{count.count} files</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {syntheticDatasetResult.warnings.length > 0 ? (
                    <ul className="status-card__list">
                      {syntheticDatasetResult.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="button-row">
                    <button
                      className="action-button"
                      disabled={isSyntheticSourcePending}
                      onClick={() => applySyntheticDatasetAsSource(syntheticDatasetResult.rootPath)}
                      type="button"
                    >
                      {isSyntheticSourcePending ? 'Applying…' : 'Use as scan source'}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="status-card">
              <header className="status-card__header">
                <div>
                  <p className="status-card__eyebrow">Learner suggestions</p>
                  <h3>{learnerSuggestions.length} reviewable suggestion{learnerSuggestions.length === 1 ? '' : 's'}</h3>
                </div>
              </header>
              <p className="status-card__summary">
                Phase 7 now turns both duplicate-keeper corrections and repeated rule rejections
                into reviewable suggestions. Nothing is auto-applied yet; you can only save them
                for later or suppress them.
              </p>
              {learnerSuggestions.length > 0 ? (
                <ul className="manifest-list">
                  {learnerSuggestions.map((suggestion) => (
                    <li
                      key={suggestion.suggestionId}
                      className="manifest-list__item manifest-list__item--stacked"
                    >
                      <div>
                        <strong>{suggestion.title}</strong>
                        {suggestion.kind === 'duplicateKeeperPolicySuggestion' ? (
                          <p>
                            preset {suggestion.presetId} | {suggestion.disagreementCount}{' '}
                            corrections out of {suggestion.basedOnObservationCount} observations
                          </p>
                        ) : (
                          <p>
                            preset {suggestion.presetId} | rule {suggestion.ruleId} |{' '}
                            {suggestion.rejectionCount} rejects out of{' '}
                            {suggestion.basedOnObservationCount} review decisions
                          </p>
                        )}
                        <p>{suggestion.rationale}</p>
                        <p>{suggestion.suggestedAdjustment}</p>
                        {suggestion.feedback === 'acceptedForLater' &&
                        suggestion.feedbackRecordedAtEpochMs ? (
                          <p>Saved for later on {formatTimestamp(suggestion.feedbackRecordedAtEpochMs)}.</p>
                        ) : null}
                        {suggestion.kind === 'duplicateKeeperPolicySuggestion' &&
                        suggestion.representativeNames.length > 0 ? (
                          <p>Examples: {suggestion.representativeNames.join(', ')}</p>
                        ) : null}
                        {suggestion.kind === 'ruleReviewTuningSuggestion' &&
                        suggestion.sampleSourcePaths.length > 0 ? (
                          <p>Examples: {suggestion.sampleSourcePaths.join(', ')}</p>
                        ) : null}
                        <div className="button-row">
                          <button
                            className="action-button action-button--secondary"
                            disabled={
                              activeLearnerSuggestionId === suggestion.suggestionId ||
                              suggestion.feedback !== null
                            }
                            onClick={() =>
                              handleLearnerSuggestionFeedback(suggestion, 'acceptedForLater')
                            }
                            type="button"
                          >
                            {activeLearnerSuggestionId === suggestion.suggestionId
                              ? 'Saving...'
                              : suggestion.feedback === 'acceptedForLater'
                                ? 'Saved for later'
                                : 'Save for later'}
                          </button>
                          <button
                            className="action-button action-button--secondary"
                            disabled={
                              activeLearnerSuggestionId === suggestion.suggestionId ||
                              suggestion.feedback !== null
                            }
                            onClick={() => handleLearnerSuggestionFeedback(suggestion, 'suppressed')}
                            type="button"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                      <span
                        className={`status-pill ${
                          suggestion.feedback === 'acceptedForLater'
                            ? 'status-pill--ready'
                            : 'status-pill--needsAttention'
                        }`}
                      >
                        {suggestion.feedback === 'acceptedForLater'
                          ? 'saved'
                          : suggestion.kind === 'duplicateKeeperPolicySuggestion'
                            ? `${(suggestion.disagreementRate * 100).toFixed(0)}% corrected`
                            : `${(suggestion.rejectionRate * 100).toFixed(0)}% rejected`}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="empty-card">
                  <strong>No learner suggestions yet</strong>
                  <p>
                    Suggestions appear after repeated duplicate-keeper corrections establish a
                    clear pattern.
                  </p>
                </div>
              )}
            </div>
            <div className="status-card">
              <header className="status-card__header">
                <div>
                  <p className="status-card__eyebrow">Draft change previews</p>
                  <h3>{learnerDraftPreviews.length} previewable preset/rule draft{learnerDraftPreviews.length === 1 ? '' : 's'}</h3>
                </div>
              </header>
              <p className="status-card__summary">
                These are computed before/after previews tied to active learner suggestions. They
                are not written back to presets and exist only as review material for now.
              </p>
              {learnerDraftPreviews.length > 0 ? (
                <ul className="manifest-list">
                  {learnerDraftPreviews.map((draft) => (
                    <li
                      key={draft.draftId}
                      className="manifest-list__item manifest-list__item--stacked"
                    >
                      <div>
                        <strong>{draft.title}</strong>
                        <p>{draft.summary}</p>
                        {draft.kind === 'duplicateKeeperPolicyDraft' ? (
                          <>
                            <p>preset {draft.presetName}</p>
                            <p>
                              duplicate policy {draft.beforeDuplicatePolicy} {'->'}{' '}
                              {draft.afterDuplicatePolicy}
                            </p>
                            <p>
                              review mode {draft.beforeReviewMode} {'->'} {draft.afterReviewMode}
                            </p>
                          </>
                        ) : (
                          <>
                            <p>
                              preset {draft.presetName} | rule {draft.ruleName}
                            </p>
                            <p>
                              action kind {draft.beforeActionKind} {'->'} {draft.afterActionKind}
                            </p>
                            <p>
                              {draft.conditionCount} condition{draft.conditionCount === 1 ? '' : 's'}
                              {draft.destinationTemplate
                                ? ` | destination ${draft.destinationTemplate}`
                                : ' | no destination template'}
                            </p>
                          </>
                        )}
                        <div className="button-row">
                          <button
                            className="action-button action-button--secondary"
                            disabled={activeLearnerDraftId === draft.draftId}
                            onClick={() => handleSaveLearnerDraftPreview(draft)}
                            type="button"
                          >
                            {activeLearnerDraftId === draft.draftId
                              ? 'Saving preset draft...'
                              : 'Save as preset draft'}
                          </button>
                        </div>
                      </div>
                      <span className="status-pill status-pill--neutral">preview only</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="empty-card">
                  <strong>No draft previews yet</strong>
                  <p>
                    Draft previews appear when an active learner suggestion can be mapped to a
                    concrete preset or rule change.
                  </p>
                </div>
              )}
            </div>
            <div className="status-card">
              <header className="status-card__header">
                <div>
                  <p className="status-card__eyebrow">Learner observations</p>
                  <h3>{duplicateKeeperObservations.length} recent duplicate-keeper observations</h3>
                </div>
              </header>
              <p className="status-card__summary">
                Safepath keeps the raw evidence behind those suggestions here so you can inspect
                what the learner has seen before we add any preset-writing behavior.
              </p>
              {duplicateKeeperObservations.length > 0 ? (
                <ul className="manifest-list">
                  {duplicateKeeperObservations.map((observation) => (
                    <li
                      key={observation.observationId}
                      className="manifest-list__item manifest-list__item--stacked"
                    >
                      <div>
                        <strong>{observation.representativeName}</strong>
                        <p>
                          group {observation.groupId} | {observation.itemCount} items |{' '}
                          {observation.certainty}
                        </p>
                        <p>
                          selected {observation.selectedKeeperEntryId}
                          {observation.recommendedKeeperEntryId
                            ? ` | recommended ${observation.recommendedKeeperEntryId}`
                            : ' | no recommendation'}
                        </p>
                        {observation.recommendedKeeperReason ? (
                          <p>{observation.recommendedKeeperReason}</p>
                        ) : null}
                      </div>
                      <span
                        className={`status-pill ${
                          observation.userAgreedWithRecommendation
                            ? 'status-pill--ready'
                            : 'status-pill--needsAttention'
                        }`}
                      >
                        {observation.userAgreedWithRecommendation ? 'agreed' : 'corrected'}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="empty-card">
                  <strong>No observations yet</strong>
                  <p>Select a duplicate keeper to record the first learner observation.</p>
                </div>
              )}
            </div>
            <div className="status-card">
              <header className="status-card__header">
                <div>
                  <p className="status-card__eyebrow">Rule review observations</p>
                  <h3>
                    {ruleReviewDecisionObservations.length} recent planned-action review decision
                    {ruleReviewDecisionObservations.length === 1 ? '' : 's'}
                  </h3>
                </div>
              </header>
              <p className="status-card__summary">
                Safepath now records when planned actions are explicitly approved or rejected, tied
                back to the matched planner rule when one exists.
              </p>
              {ruleReviewDecisionObservations.length > 0 ? (
                <ul className="manifest-list">
                  {ruleReviewDecisionObservations.map((observation) => (
                    <li
                      key={observation.observationId}
                      className="manifest-list__item manifest-list__item--stacked"
                    >
                      <div>
                        <strong>{observation.sourcePath}</strong>
                        <p>
                          preset {observation.presetId}
                          {observation.matchedRuleId
                            ? ` | rule ${observation.matchedRuleId}`
                            : ' | no matched rule'}
                        </p>
                        <p>
                          decision {observation.decision} | resulting state{' '}
                          {observation.resultingReviewState}
                        </p>
                      </div>
                      <span
                        className={`status-pill ${
                          observation.decision === 'approve'
                            ? 'status-pill--ready'
                            : 'status-pill--needsAttention'
                        }`}
                      >
                        {observation.decision}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="empty-card">
                  <strong>No rule review observations yet</strong>
                  <p>Approve or reject planned actions to grow this second learner signal.</p>
                </div>
              )}
            </div>
            <div className="status-card">
              <header className="status-card__header">
                <div>
                  <p className="status-card__eyebrow">Learner feedback</p>
                  <h3>{learnerSuggestionFeedbackEvents.length} recent suggestion feedback event{learnerSuggestionFeedbackEvents.length === 1 ? '' : 's'}</h3>
                </div>
              </header>
              <p className="status-card__summary">
                Suggestion responses are stored as learner observations too, so the system can
                remember which prompts were saved for later and which were suppressed.
              </p>
              {learnerSuggestionFeedbackEvents.length > 0 ? (
                <ul className="manifest-list">
                  {learnerSuggestionFeedbackEvents.map((observation) => (
                    <li
                      key={observation.observationId}
                      className="manifest-list__item manifest-list__item--stacked"
                    >
                      <div>
                        <strong>{observation.suggestionId}</strong>
                        <p>preset {observation.presetId}</p>
                        <p>{formatTimestamp(observation.observedAtEpochMs)}</p>
                      </div>
                      <span
                        className={`status-pill ${
                          observation.feedback === 'acceptedForLater'
                            ? 'status-pill--ready'
                            : 'status-pill--neutral'
                        }`}
                      >
                        {observation.feedback === 'acceptedForLater'
                          ? 'saved for later'
                          : 'suppressed'}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="empty-card">
                  <strong>No feedback yet</strong>
                  <p>Use Save for later or Dismiss on a learner suggestion to record feedback.</p>
                </div>
              )}
            </div>
          </div>
          {status ? <AppStatusSummary status={status} /> : null}
        </section>
      ) : activeView === 'history' ? (
        <section className="history-shell">
          <div className="status-card">
            <header className="status-card__header">
              <div>
                <p className="status-card__eyebrow">Execution history</p>
                <h3>{historyPage?.totalEntries ?? 0} recorded actions</h3>
              </div>
              <span className="status-pill status-pill--neutral">
                Page {(historyPage?.page ?? historyPageIndex) + 1}
                {historyPage && historyPage.totalPages > 0 ? ` / ${historyPage.totalPages}` : ''}
              </span>
            </header>
            <p className="status-card__summary">
              Inspect past execution records, open their sessions, and see core-owned undo
              readiness without re-parsing stored JSON in the frontend.
            </p>
            {historyPage?.entries.length ? (
              <p className="status-card__summary">
                Showing{' '}
                {historyPage.page * historyPage.pageSize + 1}
                -
                {historyPage.page * historyPage.pageSize + historyPage.entries.length} of{' '}
                {historyPage.totalEntries} records.
              </p>
            ) : null}
            <div className="button-row">
              <button
                className="action-button action-button--secondary"
                disabled={isLoadingHistory || historyPageIndex === 0}
                onClick={() => setHistoryPageIndex((current) => Math.max(0, current - 1))}
                type="button"
              >
                Previous
              </button>
              <button
                className="action-button action-button--secondary"
                disabled={
                  isLoadingHistory ||
                  !historyPage ||
                  historyPage.totalPages === 0 ||
                  historyPageIndex >= historyPage.totalPages - 1
                }
                onClick={() => setHistoryPageIndex((current) => current + 1)}
                type="button"
              >
                Next
              </button>
            </div>
            {isLoadingHistory ? (
              <p className="status-card__summary">Loading history…</p>
            ) : historyPage?.entries.length ? (
              <ul className="manifest-list">
                {historyPage.entries.map((entry) => (
                  <li
                    key={entry.recordId}
                    className={`manifest-list__item manifest-list__item--stacked ${
                      selectedHistoryRecord?.recordId === entry.recordId
                        ? 'manifest-list__item--selected'
                        : ''
                    }`}
                  >
                    <div className="review-item-main" onClick={() => handleSelectHistoryEntry(entry)}>
                      <strong>{entry.sourcePath}</strong>
                      <p>{entry.destinationPath ?? entry.message ?? 'No destination recorded.'}</p>
                      <p>
                        {entry.operationKind} | session {entry.sessionId} |{' '}
                        {formatExecutionStrategy(entry.strategy)} |{' '}
                        {entry.status}
                      </p>
                    </div>
                    <span
                      className={`status-pill ${
                        entry.undoEligible ? 'status-pill--ready' : 'status-pill--needsAttention'
                      }`}
                    >
                      {entry.undoEligible ? 'undo ready' : 'undo unavailable'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty-card">
                <strong>No history yet</strong>
                <p>Execute a plan to populate the append-only history log.</p>
              </div>
            )}
          </div>
          <div className="placeholder-stack">
            {selectedHistoryRecord ? (
              <div className="status-card">
                <header className="status-card__header">
                  <div>
                    <p className="status-card__eyebrow">Selected record</p>
                    <h3>{selectedHistoryRecord.recordId}</h3>
                  </div>
                  <span className="status-pill status-pill--neutral">
                    {selectedHistoryRecord.status}
                  </span>
                </header>
                <div className="detail-stack">
                  <p>Operation: {selectedHistoryRecord.operationKind}</p>
                  <p>Source: {selectedHistoryRecord.sourcePath}</p>
                  <p>
                    Destination:{' '}
                    {selectedHistoryRecord.destinationPath ?? 'No destination path was recorded.'}
                  </p>
                  <p>Strategy: {formatExecutionStrategy(selectedHistoryRecord.strategy)}</p>
                  <p>Finished: {formatTimestamp(selectedHistoryRecord.finishedAtEpochMs)}</p>
                  <p>
                    Undo:{' '}
                    {selectedHistoryRecord.undoEligible
                      ? 'Available now.'
                      : selectedHistoryRecord.undoBlockedReason ?? 'Unavailable.'}
                  </p>
                  {selectedHistoryRecord.message ? <p>{selectedHistoryRecord.message}</p> : null}
                </div>
                <div className="button-row">
                  <button
                    className="action-button"
                    disabled={
                      isUndoingHistory ||
                      !selectedHistoryRecord.undoEligible ||
                      selectedHistoryRecord.operationKind === 'undo'
                    }
                    onClick={handleUndoSelectedRecord}
                    type="button"
                  >
                    {isUndoingHistory ? 'Undoing…' : 'Undo this record'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="empty-card">
                <strong>Select a record</strong>
                <p>Pick a history entry to inspect its strategy, outcome, and undo readiness.</p>
              </div>
            )}
            {selectedHistorySession ? (
              <div className="status-card">
                <header className="status-card__header">
                  <div>
                    <p className="status-card__eyebrow">Session drill-down</p>
                    <h3>{selectedHistorySession.sessionId}</h3>
                  </div>
                  <span className="status-pill status-pill--neutral">
                    {selectedHistorySession.status}
                  </span>
                </header>
                <dl className="status-grid">
                  <div>
                    <dt>Approved</dt>
                    <dd>{selectedHistorySession.approvedActionCount}</dd>
                  </div>
                  <div>
                    <dt>Completed</dt>
                    <dd>{selectedHistorySession.completedActionCount}</dd>
                  </div>
                  <div>
                    <dt>Failed</dt>
                    <dd>{selectedHistorySession.failedActionCount}</dd>
                  </div>
                  <div>
                    <dt>Skipped</dt>
                    <dd>{selectedHistorySession.skippedActionCount}</dd>
                  </div>
                </dl>
                <p className="status-card__summary">
                  {selectedHistorySession.operationKind} session
                  {selectedHistorySession.relatedSessionId
                    ? ` for ${selectedHistorySession.relatedSessionId}. `
                    : '. '}
                  Started {formatTimestamp(selectedHistorySession.startedAtEpochMs)} and finished{' '}
                  {formatTimestamp(selectedHistorySession.finishedAtEpochMs)}
                </p>
                <div className="button-row">
                  <button
                    className="action-button"
                    disabled={
                      isUndoingHistory ||
                      selectedHistorySession.operationKind === 'undo' ||
                      !selectedHistorySession.records.some(
                        (record) => record.operationKind === 'execute',
                      )
                    }
                    onClick={handleUndoSelectedSession}
                    type="button"
                  >
                    {isUndoingHistory ? 'Undoing…' : 'Best-effort undo session'}
                  </button>
                </div>
                {selectedHistorySession.records.length > 0 ? (
                  <>
                    <p className="status-card__summary">
                      Showing {historySessionRecordPage.rangeStart}-{historySessionRecordPage.rangeEnd}{' '}
                      of {historySessionRecordPage.totalItems} session records.
                    </p>
                    <div className="button-row">
                      <button
                        className="action-button action-button--secondary"
                        disabled={historySessionRecordPage.page === 0}
                        onClick={() =>
                          setHistorySessionRecordPageIndex(historySessionRecordPage.page - 1)
                        }
                        type="button"
                      >
                        Previous records
                      </button>
                      <button
                        className="action-button action-button--secondary"
                        disabled={
                          historySessionRecordPage.totalPages === 0 ||
                          historySessionRecordPage.page >= historySessionRecordPage.totalPages - 1
                        }
                        onClick={() =>
                          setHistorySessionRecordPageIndex(historySessionRecordPage.page + 1)
                        }
                        type="button"
                      >
                        Next records
                      </button>
                    </div>
                    <ul className="manifest-list">
                      {historySessionRecordPage.items.map((record) => (
                      <li key={record.recordId} className="manifest-list__item manifest-list__item--stacked">
                        <div>
                          <strong>{record.sourcePath}</strong>
                          <p>{record.destinationPath ?? record.message ?? 'No destination recorded.'}</p>
                          <p>
                            {record.operationKind} | {formatExecutionStrategy(record.strategy)} |{' '}
                            {record.status}
                          </p>
                        </div>
                      </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>
            ) : (
              <div className="empty-card">
                <strong>No session selected</strong>
                <p>Session details appear here once a history record has been selected.</p>
              </div>
            )}
          </div>
        </section>
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
                  <div className="button-row">
                    <button
                      className="action-button"
                      disabled={executionIsActive || approvedActionCount === 0}
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
                      <p>
                        Template: {selectedAction.explanation.templateUsed}
                        {selectedAction.explanation.previewedTemplateOutput
                          ? ` -> ${selectedAction.explanation.previewedTemplateOutput}`
                          : ''}
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
                  {executionSession.preflightIssues.length > 0 ? (
                    <ul className="status-card__list">
                      {executionSession.preflightIssues.map((issue, index) => (
                        <li key={`${issue.actionId ?? 'session'}-${index}`}>
                          {issue.severity}: {issue.message}
                        </li>
                      ))}
                    </ul>
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
                      <li key={group.groupId} className="manifest-list__item manifest-list__item--stacked">
                        <div>
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
