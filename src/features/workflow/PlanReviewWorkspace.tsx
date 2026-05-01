import { AlertCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { AppStatusSummary } from '../../components/layout/AppStatusSummary'
import { WorkflowShell } from '../../components/layout/WorkflowShell'
import { WorkflowHomeStageIntro } from './WorkflowHomeStageIntro'
import { WorkflowStepper } from './WorkflowStepper'
import type {
  AnalysisSummaryDto,
  AppStatusDto,
  DuplicateReviewGroupDetailsDto,
  ExecutionSessionDto,
  LearnerSuggestionDto,
  ManifestPageDto,
  PlanDto,
  PlannedActionDto,
  PlanDuplicateGroupDto,
  PreflightIssueDto,
  PresetDefinitionDto,
  ProtectionDetectionDto,
  ProtectionOverrideKind,
  ReviewDecision,
  ScanJobStatusDto,
  ScanProgressEvent,
} from '../../types/app'
import {
  aiSuggestionActionLabel,
  countBucket,
  describeAiSuggestion,
  describeLearnerSuggestion,
  type DestinationFolderPreview,
  formatAiAssistedSuggestionKind,
  formatBytes,
  formatConfidence,
  formatConfidenceBand,
  formatExecutionSessionStatusLabel,
  formatExecutionStrategy,
  formatMediaDateSource,
  formatPlanActionReviewState,
  formatReviewMode,
  formatSourceProfileKind,
  formatTimestamp,
  learnerSuggestionEvidence,
  type ReviewBucket,
  summarizeAiEvidence,
} from '../app/shared'

type PaginatedSlice<T> = {
  items: T[]
  page: number
  totalItems: number
  totalPages: number
  rangeStart: number
  rangeEnd: number
}

export type PlanReviewWorkspaceProps = {
  /** When true (Home nav), Simple mode shows the staged intro in the center column. */
  showHomeStageIntro?: boolean
  scanStatus: ScanJobStatusDto | null
  status: AppStatusDto | null
  uiMode: 'simple' | 'advanced'
  analysisSummary: AnalysisSummaryDto | null
  plan: PlanDto | null
  scanProgress: ScanProgressEvent | null
  isRunningExpensiveAnalysis: boolean
  handleRunExpensiveAnalysis: () => void
  selectedPresetId: string
  setSelectedPresetId: (presetId: string) => void
  presets: PresetDefinitionDto[]
  workflowPreferenceSuggestions: Extract<
    LearnerSuggestionDto,
    { kind: 'presetAffinitySuggestion' | 'reviewModePreferenceSuggestion' }
  >[]
  isBuildingPlan: boolean
  handleBuildPlan: () => void
  destinationImpactPreview: {
    affectedFolderCount: number
    routedActionCount: number
    moveActionCount: number
    unresolvedActionCount: number
    folders: { folderPath: string; relativeFolderPath: string; itemCount: number }[]
  } | null
  visibleDestinationPreviewFolders: DestinationFolderPreview[]
  showAllDestinationPreviewFolders: boolean
  setShowAllDestinationPreviewFolders: (updater: (current: boolean) => boolean) => void
  approvedActionCount: number
  hasExecutionPreflightErrors: boolean
  executionPreflightWarnings: PreflightIssueDto[]
  executionPreflightIssues: PreflightIssueDto[]
  isLoadingExecutionPreflight: boolean
  loadExecutionPreflight: (planId: string, surfaceErrors?: boolean) => Promise<PreflightIssueDto[] | null>
  executionIsActive: boolean
  handleExecutePlan: () => void
  reviewBucketRows: Array<[ReviewBucket, string]>
  activeReviewBucket: ReviewBucket
  setActiveReviewBucket: (bucket: ReviewBucket) => void
  reviewActionPage: PaginatedSlice<PlannedActionDto>
  filteredActionIds: string[]
  handleChangeReviewPage: (page: number) => void
  selectedAction: PlannedActionDto | null
  setSelectedActionId: (actionId: string | null) => void
  handleReviewDecision: (actionIds: string[], decision: ReviewDecision) => void
  isUpdatingReview: boolean
  executionSession: ExecutionSessionDto | null
  executionRecordPage: PaginatedSlice<ExecutionSessionDto['records'][number]>
  setExecutionRecordPageIndex: (page: number) => void
  reviewGroupPage: PaginatedSlice<PlanDuplicateGroupDto>
  setReviewGroupPageIndex: (page: number) => void
  selectedDuplicateGroup: PlanDuplicateGroupDto | null
  setSelectedDuplicateGroupId: (groupId: string | null) => void
  duplicateGroupDetails: DuplicateReviewGroupDetailsDto | null
  isLoadingDuplicateGroupDetails: boolean
  handleSetDuplicateKeeper: (group: PlanDuplicateGroupDto, keeperEntryId: string) => void
  /** Apply planner-recommended keepers for every group that still needs one. */
  onApplyRecommendedDuplicateKeepers?: () => void
  /** Write JSON debug report (plan, scan snapshot, analysis, preflight). */
  onExportDuplicateWorkflowReport?: () => void
  handleRevealPath: (path: string) => void
  draftDestinationPath: string
  destinationInput: string
  setDestinationInput: (value: string) => void
  handleBrowseDestination: () => void
  isBrowsingDestination: boolean
  manifestPage: ManifestPageDto | null
  setManifestPageIndex: (page: number) => void
  analysisDuplicatePage: PaginatedSlice<
    NonNullable<AnalysisSummaryDto['likelyDuplicateGroups']>[number]
  >
  setAnalysisDuplicatePageIndex: (page: number) => void
  protectionPage: PaginatedSlice<ProtectionDetectionDto>
  setProtectionPageIndex: (page: number) => void
  handleProtectPath: (path: string) => void
  isOverridden: (path: string) => boolean
  handleApplyStructureProtection: (path: string, kind: ProtectionOverrideKind) => void
  /** Same user-facing wording as the top app header phase pill. */
  phaseLabel: string
  workflowStepperActiveIndex: number
}

export function PlanReviewWorkspace(props: PlanReviewWorkspaceProps) {
  const {
    showHomeStageIntro = false,
    scanStatus,
    status,
    uiMode,
    analysisSummary,
    plan,
    scanProgress,
    isRunningExpensiveAnalysis,
    handleRunExpensiveAnalysis,
    selectedPresetId,
    setSelectedPresetId,
    presets,
    workflowPreferenceSuggestions,
    isBuildingPlan,
    handleBuildPlan,
    destinationImpactPreview,
    visibleDestinationPreviewFolders,
    showAllDestinationPreviewFolders,
    setShowAllDestinationPreviewFolders,
    approvedActionCount,
    hasExecutionPreflightErrors,
    executionPreflightWarnings,
    executionPreflightIssues,
    isLoadingExecutionPreflight,
    loadExecutionPreflight,
    executionIsActive,
    handleExecutePlan,
    reviewBucketRows,
    activeReviewBucket,
    setActiveReviewBucket,
    reviewActionPage,
    filteredActionIds,
    handleChangeReviewPage,
    selectedAction,
    setSelectedActionId,
    handleReviewDecision,
    isUpdatingReview,
    executionSession,
    executionRecordPage,
    setExecutionRecordPageIndex,
    reviewGroupPage,
    setReviewGroupPageIndex,
    selectedDuplicateGroup,
    setSelectedDuplicateGroupId,
    duplicateGroupDetails,
    isLoadingDuplicateGroupDetails,
    handleSetDuplicateKeeper,
    onApplyRecommendedDuplicateKeepers,
    onExportDuplicateWorkflowReport,
    handleRevealPath,
    draftDestinationPath,
    destinationInput,
    setDestinationInput,
    handleBrowseDestination,
    isBrowsingDestination,
    manifestPage,
    setManifestPageIndex,
    analysisDuplicatePage,
    setAnalysisDuplicatePageIndex,
    protectionPage,
    setProtectionPageIndex,
    handleProtectPath,
    isOverridden,
    handleApplyStructureProtection,
    phaseLabel,
    workflowStepperActiveIndex,
  } = props

  const executionPreflightCounts = useMemo(() => {
    let blocking = 0
    let warnings = 0
    let infos = 0
    for (const issue of executionPreflightIssues) {
      if (issue.severity === 'error') {
        blocking += 1
      } else if (issue.severity === 'warning') {
        warnings += 1
      } else {
        infos += 1
      }
    }
    return { blocking, warnings, infos }
  }, [executionPreflightIssues])

  const approvedMoveCount =
    plan?.actions.filter((a) => a.reviewState === 'approved' && a.actionKind === 'move').length ??
    0

  const driftIssuesForSelectedDuplicateGroup = useMemo(() => {
    if (!duplicateGroupDetails?.members.length) {
      return []
    }
    const paths = duplicateGroupDetails.members.map((m) => m.path)
    return executionPreflightIssues.filter((issue) => {
      if (!issue.message) {
        return false
      }
      return paths.some((p) => issue.message.includes(p))
    })
  }, [duplicateGroupDetails, executionPreflightIssues])

  const canApplyRecommendedDuplicateKeepers = useMemo(
    () =>
      plan?.duplicateGroups.some(
        (group) => !group.selectedKeeperEntryId && group.recommendedKeeperEntryId,
      ) ?? false,
    [plan],
  )

  const selectionScopeKey = `${plan?.planId ?? 'none'}:${activeReviewBucket}:${reviewActionPage.page}`
  const [selectionState, setSelectionState] = useState<{
    scopeKey: string
    selectedActionIds: string[]
    selectionAnchorIndex: number | null
  }>({
    scopeKey: selectionScopeKey,
    selectedActionIds: [],
    selectionAnchorIndex: null,
  })

  const scopedSelection =
    selectionState.scopeKey === selectionScopeKey
      ? selectionState
      : { scopeKey: selectionScopeKey, selectedActionIds: [], selectionAnchorIndex: null }
  const selectedActionIds = scopedSelection.selectedActionIds
  const selectionAnchorIndex = scopedSelection.selectionAnchorIndex
  const selectedActionIdSet = useMemo(() => new Set(selectedActionIds), [selectedActionIds])

  function toggleActionSelection(actionId: string, index: number, withRange: boolean) {
    if (withRange && selectionAnchorIndex !== null && reviewActionPage.items.length > 0) {
      const start = Math.min(selectionAnchorIndex, index)
      const end = Math.max(selectionAnchorIndex, index)
      const rangeIds = reviewActionPage.items.slice(start, end + 1).map((item) => item.actionId)
      setSelectionState((current) => {
        const currentIds =
          current.scopeKey === selectionScopeKey ? current.selectedActionIds : ([] as string[])
        return {
          scopeKey: selectionScopeKey,
          selectedActionIds: Array.from(new Set([...currentIds, ...rangeIds])),
          selectionAnchorIndex: selectionAnchorIndex,
        }
      })
      return
    }

    setSelectionState((current) => {
      const currentIds =
        current.scopeKey === selectionScopeKey ? current.selectedActionIds : ([] as string[])
      const nextIds = currentIds.includes(actionId)
        ? currentIds.filter((id) => id !== actionId)
        : [...currentIds, actionId]
      return {
        scopeKey: selectionScopeKey,
        selectedActionIds: nextIds,
        selectionAnchorIndex: index,
      }
    })
  }

  return (
    <div className="workflow-legacy text-[length:initial]">
      <WorkflowStepper
        activeIndex={workflowStepperActiveIndex}
        density="compact"
        className="mb-3 px-1"
      />
      <WorkflowShell
        centerHeader={
          <span className="phase-pill" title={phaseLabel}>
            {phaseLabel}
          </span>
        }
        center={
          <div className="placeholder-stack">
            {showHomeStageIntro ? (
              <WorkflowHomeStageIntro uiMode={uiMode} activeIndex={workflowStepperActiveIndex} />
            ) : null}
            {status ? (
              uiMode === 'advanced' || !plan ? (
                <AppStatusSummary status={status} />
              ) : null
            ) : (
              <div className="empty-card">
                <strong>Loading desktop status</strong>
                <p>Waiting for the first Rust command to hydrate the shell.</p>
              </div>
            )}
            {scanStatus && (!plan || uiMode === 'advanced') ? (
              <div className="status-card">
                <header className="status-card__header">
                  <div>
                    <p className="status-card__eyebrow">Scan job</p>
                    <h3>{uiMode === 'advanced' ? scanStatus.jobId : 'Latest scan'}</h3>
                  </div>
                  <span className="status-pill status-pill--neutral">{scanStatus.status}</span>
                </header>
                <dl className="status-grid">
                  <div>
                    <dt>{uiMode === 'advanced' ? 'Discovered' : 'Items found'}</dt>
                    <dd>{scanStatus.discoveredEntries}</dd>
                  </div>
                  <div>
                    <dt>Files</dt>
                    <dd>{scanStatus.scannedFiles}</dd>
                  </div>
                  <div>
                    <dt>{uiMode === 'advanced' ? 'Directories' : 'Folders'}</dt>
                    <dd>{scanStatus.scannedDirectories}</dd>
                  </div>
                  {uiMode === 'advanced' ? (
                    <div>
                      <dt>Page size</dt>
                      <dd>{scanStatus.pageSize}</dd>
                    </div>
                  ) : null}
                </dl>
                {scanProgress?.latestPath && uiMode === 'advanced' ? (
                  <p className="status-card__summary">Latest path: {scanProgress.latestPath}</p>
                ) : null}
                {scanStatus.errorMessage ? (
                  <p className="status-card__summary">Error: {scanStatus.errorMessage}</p>
                ) : null}
                {uiMode === 'advanced' ? (
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
                ) : null}
              </div>
            ) : !plan ? (
              <div className="empty-card empty-card--large">
                <strong>Workflow overview</strong>
                <p>
                  Start with a readiness check and scan, then this column will fill with
                  analysis, plan building, review decisions, and execution progress as each step
                  completes.
                </p>
              </div>
            ) : null}
            {analysisSummary && (!plan || uiMode === 'advanced') ? (
              <div className="status-card">
                <header className="status-card__header">
                  <div>
                    <p className="status-card__eyebrow">Analysis summary</p>
                    <h3>Reviewable results</h3>
                  </div>
                  <span className="status-pill status-pill--neutral">
                    {uiMode === 'advanced' ? (
                      <>
                        {analysisSummary.noExtensionCount} no-ext / {analysisSummary.unknownCount}{' '}
                        unknown
                      </>
                    ) : (
                      <>
                        {analysisSummary.unknownCount + analysisSummary.noExtensionCount} need a look
                      </>
                    )}
                  </span>
                </header>
                {uiMode === 'advanced' ? (
                  <dl className="status-grid">
                    {analysisSummary.categoryCounts.map((count) => (
                      <div key={count.category}>
                        <dt>{count.category}</dt>
                        <dd>{count.count}</dd>
                      </div>
                    ))}
                  </dl>
                ) : analysisSummary.categoryCounts.length > 0 ? (
                  <p className="status-card__summary">
                    Files are grouped into {analysisSummary.categoryCounts.length} categories for
                    planning.
                  </p>
                ) : null}
                {uiMode === 'advanced' && analysisSummary.skippedLargeSyntheticFiles > 0 ? (
                  <p className="status-card__summary">
                    Expensive duplicate hashing skipped{' '}
                    {analysisSummary.skippedLargeSyntheticFiles} large synthetic placeholder
                    file{analysisSummary.skippedLargeSyntheticFiles === 1 ? '' : 's'} to avoid
                    reading through sparse multi-GB or multi-TB test data.
                  </p>
                ) : null}
                {analysisSummary && (analysisSummary.analysisPartialNotes?.length ?? 0) > 0 ? (
                  <div
                    className="mt-4 rounded-xl border border-amber-400/40 bg-amber-500/15 px-4 py-3"
                    role="status"
                  >
                    <p className="flex items-center gap-2 text-sm font-medium text-amber-100">
                      <AlertCircle className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                      Analysis caveats
                    </p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-50/95">
                      {(analysisSummary.analysisPartialNotes ?? []).map((note, index) => (
                        <li key={`${index}-${note}`}>{note}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
            {analysisSummary &&
            plan &&
            uiMode === 'simple' &&
            (analysisSummary.analysisPartialNotes?.length ?? 0) > 0 ? (
              <div
                className="rounded-xl border border-amber-400/40 bg-amber-500/15 px-4 py-3"
                role="status"
              >
                <p className="flex items-center gap-2 text-sm font-medium text-amber-100">
                  <AlertCircle className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                  Analysis caveats
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-50/95">
                  {(analysisSummary.analysisPartialNotes ?? []).map((note, index) => (
                    <li key={`plan-simple-${index}-${note}`}>{note}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {uiMode === 'advanced' && analysisSummary?.aiAssistedSuggestions.length ? (
              <div className="status-card">
                <header className="status-card__header">
                  <div>
                    <p className="status-card__eyebrow">AI-assisted suggestions</p>
                    <h3>{analysisSummary.aiAssistedSuggestions.length} reviewable hints</h3>
                  </div>
                </header>
                <p className="status-card__summary">
                  These suggestions are local, explainable, and optional. Safepath will not apply
                  them unless you choose to.
                </p>
                <ul className="manifest-list">
                  {analysisSummary.aiAssistedSuggestions.map((suggestion) => (
                    <li
                      key={suggestion.suggestionId}
                      className="manifest-list__item manifest-list__item--stacked"
                    >
                      <div>
                        <strong>{suggestion.title}</strong>
                        <p>{describeAiSuggestion(suggestion, presets)}</p>
                        <p>
                          {formatAiAssistedSuggestionKind(suggestion.kind)} |{' '}
                          {formatConfidence(suggestion.confidence)} |{' '}
                          {formatConfidenceBand(suggestion.confidence)}
                        </p>
                        <p>{suggestion.summary}</p>
                        {summarizeAiEvidence(suggestion) ? <p>{summarizeAiEvidence(suggestion)}</p> : null}
                      </div>
                      <div className="button-row button-row--compact">
                        {suggestion.suggestedPresetId ? (
                          <button
                            className="action-button action-button--secondary"
                            disabled={selectedPresetId === suggestion.suggestedPresetId}
                            onClick={() => setSelectedPresetId(suggestion.suggestedPresetId ?? '')}
                            type="button"
                          >
                            {selectedPresetId === suggestion.suggestedPresetId
                              ? 'Using this preset'
                              : aiSuggestionActionLabel(suggestion, presets)}
                          </button>
                        ) : null}
                        {suggestion.suggestedProtectionPath && suggestion.suggestedProtectionKind ? (
                          <button
                            className="action-button action-button--secondary"
                            disabled={isOverridden(suggestion.suggestedProtectionPath)}
                            onClick={() =>
                              handleApplyStructureProtection(
                                suggestion.suggestedProtectionPath ?? '',
                                suggestion.suggestedProtectionKind ?? 'userProtected',
                              )
                            }
                            type="button"
                          >
                            {isOverridden(suggestion.suggestedProtectionPath)
                              ? 'Boundary confirmed'
                              : aiSuggestionActionLabel(suggestion, presets)}
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {uiMode === 'advanced' && analysisSummary && workflowPreferenceSuggestions.length > 0 ? (
              <div className="status-card">
                <header className="status-card__header">
                  <div>
                    <p className="status-card__eyebrow">Preference hints</p>
                    <h3>{workflowPreferenceSuggestions.length} local suggestions</h3>
                  </div>
                </header>
                <p className="status-card__summary">
                  These hints come from local preset choices and review history. They stay optional,
                  and you can suppress them from Settings at any time.
                </p>
                <ul className="manifest-list">
                  {workflowPreferenceSuggestions.map((suggestion) => (
                    <li
                      key={suggestion.suggestionId}
                      className="manifest-list__item manifest-list__item--stacked"
                    >
                      <div>
                        <strong>{suggestion.title}</strong>
                        <p>{describeLearnerSuggestion(suggestion, presets)}</p>
                        <p>{suggestion.rationale}</p>
                        <p>{suggestion.suggestedAdjustment}</p>
                        {learnerSuggestionEvidence(suggestion, presets) ? (
                          <p>{learnerSuggestionEvidence(suggestion, presets)}</p>
                        ) : null}
                        {suggestion.kind === 'presetAffinitySuggestion' ? (
                          <p>
                            {formatSourceProfileKind(suggestion.sourceProfileKind)} profile |{' '}
                            {Math.round(suggestion.presetSelectionRate * 100)}% of{' '}
                            {suggestion.basedOnObservationCount} similar scans
                          </p>
                        ) : (
                          <p>
                            Suggested mode: {formatReviewMode(suggestion.suggestedReviewMode)} |{' '}
                            {Math.round(suggestion.conservativePreferenceRate * 100)}%
                            {' '}conservative tendency
                          </p>
                        )}
                      </div>
                      <div className="button-row button-row--compact">
                        {suggestion.kind === 'presetAffinitySuggestion' ? (
                          <button
                            className="action-button action-button--secondary"
                            disabled={selectedPresetId === suggestion.presetId}
                            onClick={() => setSelectedPresetId(suggestion.presetId)}
                            type="button"
                          >
                            {selectedPresetId === suggestion.presetId
                              ? 'Using this preset'
                              : `Use ${
                                  presets.find((preset) => preset.presetId === suggestion.presetId)
                                    ?.name ?? 'suggested preset'
                                } as starting preset`}
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {analysisSummary && presets.length > 0 && !plan ? (
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
                <p className="status-card__summary">
                  {uiMode === 'advanced' ? (
                    <>Destination root: {plan.destinationRoot}</>
                  ) : (
                    <>Files will be organized under: {plan.destinationRoot}</>
                  )}
                </p>
                {uiMode === 'advanced' ? (
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
                ) : null}
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
                    <div className="mt-3 grid gap-2 rounded-xl border border-white/10 bg-black/15 p-3 text-left text-xs text-white/80 sm:grid-cols-2">
                      <p className="sm:col-span-2 text-[11px] font-semibold uppercase tracking-wide text-white/45">
                        Dry-run summary
                      </p>
                      <div>
                        <span className="text-white/50">Approved actions</span>{' '}
                        <span className="font-medium text-white">{approvedActionCount}</span>
                      </div>
                      <div>
                        <span className="text-white/50">Approved moves</span>{' '}
                        <span className="font-medium text-white">{approvedMoveCount}</span>
                      </div>
                      <div>
                        <span className="text-white/50">Blocking checks</span>{' '}
                        <span className="font-medium text-rose-200/90">
                          {executionPreflightCounts.blocking}
                        </span>
                      </div>
                      <div>
                        <span className="text-white/50">Warnings / info</span>{' '}
                        <span className="font-medium text-white">
                          {executionPreflightCounts.warnings} / {executionPreflightCounts.infos}
                        </span>
                      </div>
                      {plan?.destinationRoot ? (
                        <div className="sm:col-span-2">
                          <span className="text-white/50">Destination root</span>{' '}
                          <span className="font-mono text-[11px] text-white/85">
                            {plan.destinationRoot}
                          </span>
                        </div>
                      ) : null}
                    </div>
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
                              {uiMode === 'advanced' ? (
                                <>
                                  {issue.severity}: {issue.message}
                                </>
                              ) : issue.severity === 'error' ? (
                                <>Must fix before running: {issue.message}</>
                              ) : (
                                <>Heads-up: {issue.message}</>
                              )}
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
                  {reviewBucketRows.map(([bucket, label]) => (
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
                    {uiMode === 'advanced' ? (
                      <>
                        Showing {reviewActionPage.rangeStart}-{reviewActionPage.rangeEnd} of{' '}
                        {reviewActionPage.totalItems} action
                        {reviewActionPage.totalItems === 1 ? '' : 's'} in this filter.
                      </>
                    ) : (
                      <>
                        {reviewActionPage.totalItems} action
                        {reviewActionPage.totalItems === 1 ? '' : 's'} in this view. Use Previous and
                        Next to move through the list.
                      </>
                    )}
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
                <div className="button-row button-row--compact">
                  <button
                    className="action-button"
                    disabled={isUpdatingReview || filteredActionIds.length === 0}
                    onClick={() => handleReviewDecision(filteredActionIds, 'approve')}
                    type="button"
                  >
                    Accept all in filter
                  </button>
                  <button
                    className="action-button action-button--secondary"
                    disabled={isUpdatingReview || filteredActionIds.length === 0}
                    onClick={() => handleReviewDecision(filteredActionIds, 'reject')}
                    type="button"
                  >
                    Reject all in filter
                  </button>
                  <button
                    className="action-button action-button--secondary"
                    disabled={isUpdatingReview || filteredActionIds.length === 0}
                    onClick={() => handleReviewDecision(filteredActionIds, 'reset')}
                    type="button"
                  >
                    Reset all in filter
                  </button>
                </div>
                <div className="button-row button-row--compact">
                  <button
                    className="action-button"
                    disabled={isUpdatingReview || selectedActionIds.length === 0}
                    onClick={() => handleReviewDecision(selectedActionIds, 'approve')}
                    type="button"
                  >
                    Accept selected ({selectedActionIds.length})
                  </button>
                  <button
                    className="action-button action-button--secondary"
                    disabled={isUpdatingReview || selectedActionIds.length === 0}
                    onClick={() => handleReviewDecision(selectedActionIds, 'reject')}
                    type="button"
                  >
                    Reject selected ({selectedActionIds.length})
                  </button>
                  <button
                    className="action-button action-button--secondary"
                    disabled={isUpdatingReview || selectedActionIds.length === 0}
                    onClick={() => handleReviewDecision(selectedActionIds, 'reset')}
                    type="button"
                  >
                    Reset selected ({selectedActionIds.length})
                  </button>
                </div>
                {reviewActionPage.totalItems > 0 ? (
                  <ul className="manifest-list">
                    {reviewActionPage.items.map((action, actionIndex) => (
                      <li
                        key={action.actionId}
                        className={`manifest-list__item manifest-list__item--stacked ${
                          selectedAction?.actionId === action.actionId ? 'manifest-list__item--selected' : ''
                        }`}
                      >
                        <div className="action-selection-slot">
                          <button
                            type="button"
                            className={`action-selection-toggle ${
                              selectedActionIdSet.has(action.actionId)
                                ? 'action-selection-toggle--selected'
                                : ''
                            }`}
                            aria-label={`Select action ${action.sourcePath}`}
                            aria-pressed={selectedActionIdSet.has(action.actionId)}
                            onClick={(event) => {
                              toggleActionSelection(action.actionId, actionIndex, event.shiftKey)
                            }}
                          >
                            <span className="action-selection-toggle__dot" aria-hidden />
                          </button>
                        </div>
                        <button
                          type="button"
                          className="review-item-main"
                          aria-label={`Select planned action ${action.sourcePath}`}
                          aria-pressed={selectedAction?.actionId === action.actionId}
                          onClick={() => setSelectedActionId(action.actionId)}
                        >
                          <strong>{action.sourcePath}</strong>
                          <p>
                            {action.destinationPath ??
                              action.explanation.blockedReason ??
                              'No destination preview.'}
                          </p>
                          {uiMode === 'advanced' ? (
                            <p>
                              {action.actionKind} | {action.reviewState}
                              {action.explanation.conflictStatus
                                ? ` | ${action.explanation.conflictStatus}`
                                : ''}
                            </p>
                          ) : (
                            <p>{formatPlanActionReviewState(action.reviewState)}</p>
                          )}
                        </button>
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
            {uiMode === 'advanced' && selectedAction ? (
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
                    <h3>
                      {uiMode === 'advanced' ? executionSession.sessionId : 'Last run summary'}
                    </h3>
                  </div>
                  <span className="status-pill status-pill--neutral">
                    {uiMode === 'advanced'
                      ? executionSession.status
                      : formatExecutionSessionStatusLabel(executionSession.status)}
                  </span>
                </header>
                {uiMode === 'advanced' ? (
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
                ) : null}
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
                {uiMode === 'advanced' && executionSession.preflightIssues.length > 0 ? (
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
                {uiMode === 'advanced' && executionSession.records.length > 0 ? (
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
                  <div className="flex flex-col items-end gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                    {onApplyRecommendedDuplicateKeepers ? (
                      <button
                        type="button"
                        className="action-button action-button--secondary"
                        disabled={isUpdatingReview || !canApplyRecommendedDuplicateKeepers}
                        onClick={onApplyRecommendedDuplicateKeepers}
                      >
                        Apply suggested keepers
                      </button>
                    ) : null}
                    {uiMode === 'advanced' && onExportDuplicateWorkflowReport ? (
                      <button
                        type="button"
                        className="action-button action-button--secondary"
                        onClick={onExportDuplicateWorkflowReport}
                      >
                        Export duplicate report
                      </button>
                    ) : null}
                  </div>
                </header>
                <p className="status-card__summary">
                  {uiMode === 'advanced' ? (
                    <>
                      Showing {reviewGroupPage.rangeStart}-{reviewGroupPage.rangeEnd} of{' '}
                      {reviewGroupPage.totalItems} duplicate review group
                      {reviewGroupPage.totalItems === 1 ? '' : 's'}.
                    </>
                  ) : (
                    <>
                      {reviewGroupPage.totalItems} group{reviewGroupPage.totalItems === 1 ? '' : 's'} of
                      similar files — review them one page at a time.
                    </>
                  )}
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
                      <button
                        type="button"
                        className="review-item-main"
                        aria-label={`Select duplicate group ${group.representativeName}`}
                        aria-pressed={selectedDuplicateGroup?.groupId === group.groupId}
                        onClick={() => setSelectedDuplicateGroupId(group.groupId)}
                      >
                        <strong>{group.representativeName}</strong>
                        <p>
                          {uiMode === 'advanced' ? (
                            <>
                              {group.itemCount} items | {group.certainty}
                            </>
                          ) : (
                            <>{group.itemCount} similar files</>
                          )}
                        </p>
                        <p>
                          {uiMode === 'advanced' ? (
                            <>
                              Keeper:{' '}
                              {group.selectedKeeperEntryId ??
                                group.recommendedKeeperEntryId ??
                                'Select a keeper'}
                            </>
                          ) : group.selectedKeeperEntryId ? (
                            <>Keeper selected</>
                          ) : (
                            <>Choose which copy to keep</>
                          )}
                        </p>
                        {uiMode === 'advanced' && group.recommendedKeeperConfidence !== null ? (
                          <p>{formatConfidence(group.recommendedKeeperConfidence)}</p>
                        ) : null}
                        {uiMode === 'advanced' && group.recommendedKeeperReasonTags.length > 0 ? (
                          <p>Why: {group.recommendedKeeperReasonTags.join(' | ')}</p>
                        ) : null}
                        {uiMode === 'advanced' && group.recommendedKeeperReason ? (
                          <p>{group.recommendedKeeperReason}</p>
                        ) : null}
                      </button>
                      <div className="button-row button-row--compact">
                        {group.memberEntryIds.map((entryId, copyIndex) => (
                          <button
                            key={entryId}
                            className={`action-button action-button--secondary ${
                              group.selectedKeeperEntryId === entryId ? 'action-button--selected' : ''
                            }`}
                            disabled={isUpdatingReview}
                            onClick={() => handleSetDuplicateKeeper(group, entryId)}
                            type="button"
                          >
                            {group.selectedKeeperEntryId === entryId
                              ? 'Keeper'
                              : uiMode === 'advanced'
                                ? `Keep ${entryId}`
                                : `Keep copy ${copyIndex + 1}`}
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
                        <p className="status-card__eyebrow">
                          {uiMode === 'advanced' ? 'Keeper confidence' : 'Compare copies'}
                        </p>
                        <h3>{selectedDuplicateGroup.representativeName}</h3>
                      </div>
                      <span className="status-pill status-pill--neutral">
                        {duplicateGroupDetails?.members.length ?? selectedDuplicateGroup.itemCount} files
                      </span>
                    </header>
                    <p className="status-card__summary">
                      {uiMode === 'advanced' ? (
                        <>
                          Compare paths, timestamps, and sizes before you commit to a keeper.
                          Safepath&apos;s recommendation is only a starting point.
                        </>
                      ) : (
                        <>
                          Open a copy in Finder if you need to. Pick one keeper before approving the
                          group.
                        </>
                      )}
                    </p>
                    {driftIssuesForSelectedDuplicateGroup.length > 0 ? (
                      <div className="mb-3 rounded-xl border border-amber-400/40 bg-amber-500/15 p-3 text-xs text-amber-50">
                        <p className="font-semibold text-amber-100">Source drift for this group</p>
                        <p className="mt-1 text-amber-50/90">
                          Execution checks reference files in this group. Something may have changed on
                          disk since the scan.
                        </p>
                        <ul className="mt-2 list-inside list-disc space-y-1 text-amber-50/85">
                          {driftIssuesForSelectedDuplicateGroup.map((issue, idx) => (
                            <li key={`${issue.actionId ?? 'session'}-drift-${idx}`}>
                              {issue.severity === 'error' ? 'Blocking: ' : 'Heads-up: '}
                              {issue.message}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {uiMode === 'advanced' && selectedDuplicateGroup.recommendedKeeperReason ? (
                      <p className="status-card__summary">
                        Suggested keeper: {selectedDuplicateGroup.recommendedKeeperEntryId ?? 'none yet'}.
                        {' '}
                        {selectedDuplicateGroup.recommendedKeeperReason}
                      </p>
                    ) : null}
                    {uiMode === 'advanced' && selectedDuplicateGroup.recommendedKeeperConfidence !== null ? (
                      <p className="status-card__summary">
                        {formatConfidence(selectedDuplicateGroup.recommendedKeeperConfidence)}
                      </p>
                    ) : null}
                    {uiMode === 'advanced' &&
                    selectedDuplicateGroup.recommendedKeeperReasonTags.length > 0 ? (
                      <p className="status-card__summary">
                        Reason tags: {selectedDuplicateGroup.recommendedKeeperReasonTags.join(' | ')}
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
                              {uiMode === 'advanced' ? (
                                <>
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
                                </>
                              ) : (
                                <p>{formatBytes(member.sizeBytes)}</p>
                              )}
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
              <div className="button-row button-row--compact">
                <button
                  className="action-button action-button--secondary"
                  disabled={isBrowsingDestination}
                  onClick={handleBrowseDestination}
                  type="button"
                >
                  {isBrowsingDestination ? 'Opening…' : 'Browse destination folder'}
                </button>
              </div>
              {uiMode === 'advanced' ? (
                <>
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
                </>
              ) : (
                <p className="status-card__summary">
                  Safepath uses one main folder where organized files should go.
                </p>
              )}
            </div>
            {uiMode === 'advanced' ? (
              manifestPage ? (
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
              )
            ) : null}
            {uiMode === 'advanced' ? (
              analysisSummary ? (
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
              )
            ) : null}
          </div>
        }
      />

    </div>
  )
}
