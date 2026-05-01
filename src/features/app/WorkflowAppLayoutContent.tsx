import type { Dispatch, SetStateAction } from 'react'

import { PresetsView } from '../presets/PresetsView'
import { HistoryView } from '../history/HistoryView'
import { SettingsView } from '../settings/SettingsView'
import { WorkflowResultsScreen } from '../workflow/WorkflowResultsScreen'
import { WorkflowScanningScreen } from '../workflow/WorkflowScanningScreen'
import { WorkflowCompletionScreen } from '../workflow/WorkflowCompletionScreen'
import { WorkflowExecutingScreen } from '../workflow/WorkflowExecutingScreen'
import type { PlanReviewWorkspaceProps } from '../workflow/PlanReviewWorkspace'
import { PlanReviewWorkspace } from '../workflow/PlanReviewWorkspace'
import { WorkflowStepper } from '../workflow/WorkflowStepper'
import { WorkflowSetupScreen } from '../workflow/WorkflowSetupScreen'
import type { AppNavId } from '../../shell/AppLayout'
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
  LearnerSuggestionDto,
  ManifestPageDto,
  PlanDto,
  PreflightIssueDto,
  PresetDefinitionDto,
  PlannedActionDto,
  PlanDuplicateGroupDto,
  ScanJobStatusDto,
  ScanProgressEvent,
  SyntheticDatasetCategory,
} from '../../types/app'
import type {
  DuplicateGroupScope,
  ExecutionSafetyTier,
  KeeperPreference,
  MatchingStrategy,
  SimpleDuplicateMode,
  SimpleStrictness,
} from '../../types/duplicateConfig'
import { type ReviewBucket } from './shared'
import type { WorkflowActionDeps } from './workflowActions'
import * as workflowActions from './workflowActions'

export type WorkflowStep = 'setup' | 'scanning' | 'results' | 'workspace' | 'complete'

type PaginatedSlice<T> = {
  items: T[]
  page: number
  totalItems: number
  totalPages: number
  rangeStart: number
  rangeEnd: number
}

export interface WorkflowAppLayoutContentProps {
  workflowDeps: WorkflowActionDeps
  activeNav: AppNavId
  uiMode: 'simple' | 'advanced'
  workflowStep: WorkflowStep
  setActiveNav: Dispatch<SetStateAction<AppNavId>>
  setWorkflowStep: Dispatch<SetStateAction<WorkflowStep>>
  setSyntheticDatasetName: Dispatch<SetStateAction<string>>
  setSyntheticMaxDepth: Dispatch<SetStateAction<number>>
  setSyntheticMessinessLevel: Dispatch<SetStateAction<number>>
  setSyntheticDuplicateRatePercent: Dispatch<SetStateAction<number>>
  setSyntheticIncludeHiddenFiles: Dispatch<SetStateAction<boolean>>
  setSyntheticIncludeEmptyFolders: Dispatch<SetStateAction<boolean>>
  setSyntheticTargetApparentSizeBytes: Dispatch<SetStateAction<number>>
  setHistoryPageIndex: Dispatch<SetStateAction<number>>
  setHistorySessionRecordPageIndex: Dispatch<SetStateAction<number>>
  setShowAllDestinationPreviewFolders: Dispatch<SetStateAction<boolean>>
  showExecutingMain: boolean
  showCompletionMain: boolean
  showPlanWorkspace: boolean
  phaseLabel: string
  workflowStepperActiveIndex: number
  reviewBucketRows: Array<[ReviewBucket, string]>
  status: AppStatusDto | null
  presets: PresetDefinitionDto[]
  draftDestinationPath: string
  syntheticOutputRoot: string
  syntheticDatasetName: string
  syntheticCategories: SyntheticDatasetCategory[]
  syntheticMaxDepth: number
  syntheticMessinessLevel: number
  syntheticDuplicateRatePercent: number
  syntheticIncludeHiddenFiles: boolean
  syntheticIncludeEmptyFolders: boolean
  syntheticTargetApparentSizeBytes: number
  isGeneratingSyntheticData: boolean
  isSyntheticSourcePending: boolean
  syntheticDatasetResult: GenerateSyntheticDatasetResultDto | null
  learnerSuggestions: LearnerSuggestionDto[]
  aiEvaluationSnapshot: AiEvaluationSnapshotDto | null
  learnerDraftPreviews: LearnerDraftPreviewDto[]
  duplicateKeeperObservations: Extract<LearnerObservationDto, { kind: 'duplicateKeeperSelection' }>[]
  ruleReviewDecisionObservations: Extract<
    LearnerObservationDto,
    { kind: 'plannedActionReviewDecision' }
  >[]
  learnerSuggestionFeedbackEvents: Extract<LearnerObservationDto, { kind: 'suggestionFeedback' }>[]
  activeLearnerSuggestionId: string | null
  activeLearnerDraftId: string | null
  historyPage: HistoryPageDto | null
  historyPageIndex: number
  isLoadingHistory: boolean
  selectedHistoryRecord: HistoryEntryDto | null
  selectedHistorySession: ExecutionSessionDto | null
  historySessionRecordPage: PaginatedSlice<ExecutionSessionDto['records'][number]>
  isUndoingHistory: boolean
  selectedPresetId: string
  plan: PlanDto | null
  executionSession: ExecutionSessionDto | null
  scanStatus: ScanJobStatusDto | null
  scanProgress: ScanProgressEvent | null
  analysisSummary: AnalysisSummaryDto | null
  isRunningExpensiveAnalysis: boolean
  isBuildingPlan: boolean
  destinationImpactPreview: PlanReviewWorkspaceProps['destinationImpactPreview']
  visibleDestinationPreviewFolders: PlanReviewWorkspaceProps['visibleDestinationPreviewFolders']
  showAllDestinationPreviewFolders: boolean
  approvedActionCount: number
  hasExecutionPreflightErrors: boolean
  executionPreflightWarnings: PreflightIssueDto[]
  executionPreflightIssues: PreflightIssueDto[]
  isLoadingExecutionPreflight: boolean
  loadExecutionPreflight: (planId: string, surfaceErrors?: boolean) => Promise<PreflightIssueDto[] | null>
  executionIsActive: boolean
  workflowPreferenceSuggestions: Extract<
    LearnerSuggestionDto,
    { kind: 'presetAffinitySuggestion' | 'reviewModePreferenceSuggestion' }
  >[]
  activeReviewBucket: ReviewBucket
  setActiveReviewBucket: Dispatch<SetStateAction<ReviewBucket>>
  reviewActionPage: PaginatedSlice<PlannedActionDto>
  filteredPlanActions: PlannedActionDto[]
  setSelectedActionId: Dispatch<SetStateAction<string | null>>
  selectedAction: PlannedActionDto | null
  isUpdatingReview: boolean
  executionRecordPage: PaginatedSlice<ExecutionSessionDto['records'][number]>
  setExecutionRecordPageIndex: Dispatch<SetStateAction<number>>
  reviewGroupPage: PaginatedSlice<PlanDuplicateGroupDto>
  setReviewGroupPageIndex: Dispatch<SetStateAction<number>>
  selectedDuplicateGroup: PlanDuplicateGroupDto | null
  setSelectedDuplicateGroupId: Dispatch<SetStateAction<string | null>>
  duplicateGroupDetails: DuplicateReviewGroupDetailsDto | null
  isLoadingDuplicateGroupDetails: boolean
  destinationInput: string
  setDestinationInput: Dispatch<SetStateAction<string>>
  manifestPage: ManifestPageDto | null
  setManifestPageIndex: Dispatch<SetStateAction<number>>
  analysisDuplicatePage: PaginatedSlice<NonNullable<AnalysisSummaryDto['likelyDuplicateGroups']>[number]>
  setAnalysisDuplicatePageIndex: Dispatch<SetStateAction<number>>
  protectionPage: PaginatedSlice<NonNullable<AnalysisSummaryDto['detectedProtections']>[number]>
  setProtectionPageIndex: Dispatch<SetStateAction<number>>
  sourceInput: string
  setSourceInput: Dispatch<SetStateAction<string>>
  isBrowsingSource: boolean
  isBrowsingDestination: boolean
  isStartingScan: boolean
  canAttemptScan: boolean
  activeAnalysisJobId: string | null
  dupSimpleMode: SimpleDuplicateMode
  setDupSimpleMode: Dispatch<SetStateAction<SimpleDuplicateMode>>
  dupSimpleStrictness: SimpleStrictness
  setDupSimpleStrictness: Dispatch<SetStateAction<SimpleStrictness>>
  dupKeeperPreference: KeeperPreference
  setDupKeeperPreference: Dispatch<SetStateAction<KeeperPreference>>
  dupIgnoreSmallFiles: boolean
  setDupIgnoreSmallFiles: Dispatch<SetStateAction<boolean>>
  dupIgnoreHiddenSystem: boolean
  setDupIgnoreHiddenSystem: Dispatch<SetStateAction<boolean>>
  dupGroupByFolder: boolean
  setDupGroupByFolder: Dispatch<SetStateAction<boolean>>
  advancedDupStrategy: MatchingStrategy
  setAdvancedDupStrategy: Dispatch<SetStateAction<MatchingStrategy>>
  advancedDupKeeper: KeeperPreference
  setAdvancedDupKeeper: Dispatch<SetStateAction<KeeperPreference>>
  advancedDupIncludeHidden: boolean
  setAdvancedDupIncludeHidden: Dispatch<SetStateAction<boolean>>
  advancedDupIgnoreJunk: boolean
  setAdvancedDupIgnoreJunk: Dispatch<SetStateAction<boolean>>
  advancedDupGroupByFolder: boolean
  setAdvancedDupGroupByFolder: Dispatch<SetStateAction<boolean>>
  advancedDupScope: DuplicateGroupScope
  setAdvancedDupScope: Dispatch<SetStateAction<DuplicateGroupScope>>
  advancedDupImages: boolean
  setAdvancedDupImages: Dispatch<SetStateAction<boolean>>
  advancedDupSafetyTier: ExecutionSafetyTier
  setAdvancedDupSafetyTier: Dispatch<SetStateAction<ExecutionSafetyTier>>
  advancedDupMaxSimilarFiles: number
  setAdvancedDupMaxSimilarFiles: Dispatch<SetStateAction<number>>
  advancedDupMaxPairwise: number
  setAdvancedDupMaxPairwise: Dispatch<SetStateAction<number>>
  advancedDupTimeoutMsRaw: string
  setAdvancedDupTimeoutMsRaw: Dispatch<SetStateAction<string>>
  duplicateScanPreviewLines: string[]
}

export function WorkflowAppLayoutContent(props: WorkflowAppLayoutContentProps) {
  const {
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
  } = props

  return (
    <>
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
            onSyntheticOutputRootChange={workflowDeps.setSyntheticOutputRoot}
            onBrowseSyntheticOutputRoot={() =>
              void workflowActions.handleBrowseSyntheticOutputFolder(workflowDeps)
            }
            onSyntheticDatasetNameChange={setSyntheticDatasetName}
            onSyntheticTargetSizeChange={setSyntheticTargetApparentSizeBytes}
            onSyntheticMaxDepthChange={setSyntheticMaxDepth}
            onSyntheticMessinessLevelChange={setSyntheticMessinessLevel}
            onSyntheticDuplicateRateChange={setSyntheticDuplicateRatePercent}
            onSyntheticIncludeHiddenFilesChange={setSyntheticIncludeHiddenFiles}
            onSyntheticIncludeEmptyFoldersChange={setSyntheticIncludeEmptyFolders}
            onToggleSyntheticCategory={(category) =>
              workflowActions.toggleSyntheticCategory(workflowDeps, category)
            }
            onGenerateSyntheticDataset={() =>
              void workflowActions.handleGenerateSyntheticDataset(workflowDeps)
            }
            onGenerateAndScanSyntheticDataset={() =>
              void workflowActions.handleGenerateAndScanSyntheticDataset(workflowDeps)
            }
            onApplySyntheticDatasetAsSource={(rootPath) =>
              void workflowActions.applySyntheticDatasetAsSource(workflowDeps, rootPath)
            }
            onLearnerSuggestionFeedback={(suggestion, feedback) =>
              void workflowActions.handleLearnerSuggestionFeedback(workflowDeps, suggestion, feedback)
            }
            onSaveLearnerDraftPreview={(draft) =>
              void workflowActions.handleSaveLearnerDraftPreview(workflowDeps, draft)
            }
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
            onSelectHistoryEntry={(entry) => workflowActions.handleSelectHistoryEntry(workflowDeps, entry)}
            onUndoSelectedRecord={() => void workflowActions.handleUndoSelectedRecord(workflowDeps)}
            onUndoSelectedSession={() => void workflowActions.handleUndoSelectedSession(workflowDeps)}
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
          onSelectPreset={workflowDeps.setSelectedPresetId}
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
          onStartNewScan={() => void workflowActions.handleStartOver(workflowDeps)}
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
          handleRunExpensiveAnalysis={() => void workflowActions.handleRunExpensiveAnalysis(workflowDeps)}
          selectedPresetId={selectedPresetId}
          setSelectedPresetId={workflowDeps.setSelectedPresetId}
          presets={presets}
          workflowPreferenceSuggestions={workflowPreferenceSuggestions}
          isBuildingPlan={isBuildingPlan}
          handleBuildPlan={() => void workflowActions.handleBuildPlan(workflowDeps)}
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
          handleExecutePlan={() => void workflowActions.handleExecutePlan(workflowDeps)}
          reviewBucketRows={reviewBucketRows}
          activeReviewBucket={activeReviewBucket}
          setActiveReviewBucket={setActiveReviewBucket}
          reviewActionPage={reviewActionPage}
          filteredActionIds={filteredPlanActions.map((action) => action.actionId)}
          handleChangeReviewPage={(nextPage) =>
            workflowActions.handleChangeReviewPage(workflowDeps, nextPage)
          }
          selectedAction={selectedAction}
          setSelectedActionId={setSelectedActionId}
          handleReviewDecision={(actionIds, decision) =>
            void workflowActions.handleReviewDecision(workflowDeps, actionIds, decision)
          }
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
          handleSetDuplicateKeeper={(group, keeperEntryId) =>
            void workflowActions.handleSetDuplicateKeeper(workflowDeps, group, keeperEntryId)
          }
          onApplyRecommendedDuplicateKeepers={() =>
            void workflowActions.handleApplyRecommendedDuplicateKeepers(workflowDeps)
          }
          onExportDuplicateWorkflowReport={
            uiMode === 'advanced'
              ? () => void workflowActions.handleExportDuplicateWorkflowReport(workflowDeps)
              : undefined
          }
          handleRevealPath={(path) => void workflowActions.handleRevealPath(workflowDeps, path)}
          draftDestinationPath={draftDestinationPath}
          destinationInput={destinationInput}
          setDestinationInput={setDestinationInput}
          handleBrowseDestination={() => void workflowActions.handleBrowseDestinationFolder(workflowDeps)}
          isBrowsingDestination={isBrowsingDestination}
          manifestPage={manifestPage}
          setManifestPageIndex={setManifestPageIndex}
          analysisDuplicatePage={analysisDuplicatePage}
          setAnalysisDuplicatePageIndex={setAnalysisDuplicatePageIndex}
          protectionPage={protectionPage}
          setProtectionPageIndex={setProtectionPageIndex}
          handleProtectPath={(path) => void workflowActions.handleProtectPath(workflowDeps, path)}
          isOverridden={(path) => workflowActions.isPathOverridden(workflowDeps, path)}
          handleApplyStructureProtection={(path, overrideKind) =>
            void workflowActions.handleApplyStructureProtection(workflowDeps, path, overrideKind)
          }
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
          onBrowseSource={() => void workflowActions.handleBrowseSourceFolder(workflowDeps)}
          onBrowseDestination={() => void workflowActions.handleBrowseDestinationFolder(workflowDeps)}
          onStartScan={() => void workflowActions.startScanFlow(workflowDeps)}
          isBrowsingSource={isBrowsingSource}
          isBrowsingDestination={isBrowsingDestination}
          isStartingScan={isStartingScan}
          canAttemptScan={canAttemptScan}
          workflowStepperActiveIndex={workflowStepperActiveIndex}
          uiMode={uiMode}
          dupSimpleMode={dupSimpleMode}
          setDupSimpleMode={setDupSimpleMode}
          dupSimpleStrictness={dupSimpleStrictness}
          setDupSimpleStrictness={setDupSimpleStrictness}
          dupKeeperPreference={dupKeeperPreference}
          setDupKeeperPreference={setDupKeeperPreference}
          dupIgnoreSmallFiles={dupIgnoreSmallFiles}
          setDupIgnoreSmallFiles={setDupIgnoreSmallFiles}
          dupIgnoreHiddenSystem={dupIgnoreHiddenSystem}
          setDupIgnoreHiddenSystem={setDupIgnoreHiddenSystem}
          dupGroupByFolder={dupGroupByFolder}
          setDupGroupByFolder={setDupGroupByFolder}
          advancedDupStrategy={advancedDupStrategy}
          setAdvancedDupStrategy={setAdvancedDupStrategy}
          advancedDupKeeper={advancedDupKeeper}
          setAdvancedDupKeeper={setAdvancedDupKeeper}
          advancedDupIncludeHidden={advancedDupIncludeHidden}
          setAdvancedDupIncludeHidden={setAdvancedDupIncludeHidden}
          advancedDupIgnoreJunk={advancedDupIgnoreJunk}
          setAdvancedDupIgnoreJunk={setAdvancedDupIgnoreJunk}
          advancedDupGroupByFolder={advancedDupGroupByFolder}
          setAdvancedDupGroupByFolder={setAdvancedDupGroupByFolder}
          advancedDupScope={advancedDupScope}
          setAdvancedDupScope={setAdvancedDupScope}
          advancedDupImages={advancedDupImages}
          setAdvancedDupImages={setAdvancedDupImages}
          advancedDupSafetyTier={advancedDupSafetyTier}
          setAdvancedDupSafetyTier={setAdvancedDupSafetyTier}
          advancedDupMaxSimilarFiles={advancedDupMaxSimilarFiles}
          setAdvancedDupMaxSimilarFiles={setAdvancedDupMaxSimilarFiles}
          advancedDupMaxPairwise={advancedDupMaxPairwise}
          setAdvancedDupMaxPairwise={setAdvancedDupMaxPairwise}
          advancedDupTimeoutMsRaw={advancedDupTimeoutMsRaw}
          setAdvancedDupTimeoutMsRaw={setAdvancedDupTimeoutMsRaw}
          duplicateScanPreviewLines={duplicateScanPreviewLines}
        />
      ) : null}

      {activeNav === 'workflow' && workflowStep === 'scanning' && scanStatus ? (
        <WorkflowScanningScreen
          scanStatus={scanStatus}
          scanProgress={scanProgress}
          onCancel={() => void workflowActions.handleCancelScan(workflowDeps)}
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
          onPresetChange={workflowDeps.setSelectedPresetId}
          onBuildPlan={() => void workflowActions.handleBuildPlan(workflowDeps)}
          isBuildingPlan={isBuildingPlan}
          onRunExpensiveAnalysis={() => void workflowActions.handleRunExpensiveAnalysis(workflowDeps)}
          isRunningExpensiveAnalysis={isRunningExpensiveAnalysis}
          activeAnalysisJobId={activeAnalysisJobId}
          onContinueToWorkspace={() => setWorkflowStep('workspace')}
          hasPlan={!!plan}
          uiMode={uiMode}
          workflowPreferenceSuggestions={workflowPreferenceSuggestions}
          aiAssistedSuggestions={analysisSummary?.aiAssistedSuggestions ?? []}
          selectedPresetIdForAi={selectedPresetId}
          onApplyAiPreset={workflowDeps.setSelectedPresetId}
          onApplyStructureProtection={(path, overrideKind) =>
            void workflowActions.handleApplyStructureProtection(workflowDeps, path, overrideKind)
          }
          isOverridden={(path) => workflowActions.isPathOverridden(workflowDeps, path)}
          workflowStepperActiveIndex={workflowStepperActiveIndex}
        />
      ) : null}
    </>
  )
}
