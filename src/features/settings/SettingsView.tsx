import { useState } from 'react'

import { AppStatusSummary } from '../../components/layout/AppStatusSummary'
import type {
  AiEvaluationSnapshotDto,
  AppStatusDto,
  GenerateSyntheticDatasetResultDto,
  LearnerDraftPreviewDto,
  LearnerObservationDto,
  LearnerSuggestionDto,
  PresetDefinitionDto,
  SyntheticDatasetCategory,
} from '../../types/app'
import {
  describeLearnerSuggestion,
  formatAiEvaluationStatus,
  formatBytes,
  formatRatePercent,
  formatReviewMode,
  formatSourceProfileKind,
  formatSyntheticCategory,
  formatTimestamp,
  learnerSuggestionEvidence,
  learnerSuggestionStatusLabel,
  SYNTHETIC_CATEGORY_OPTIONS,
} from '../app/shared'

interface SettingsViewProps {
  aiEvaluationSnapshot: AiEvaluationSnapshotDto | null
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
  learnerDraftPreviews: LearnerDraftPreviewDto[]
  duplicateKeeperObservations: Extract<LearnerObservationDto, { kind: 'duplicateKeeperSelection' }>[]
  ruleReviewDecisionObservations: Extract<
    LearnerObservationDto,
    { kind: 'plannedActionReviewDecision' }
  >[]
  learnerSuggestionFeedbackEvents: Extract<LearnerObservationDto, { kind: 'suggestionFeedback' }>[]
  activeLearnerSuggestionId: string | null
  activeLearnerDraftId: string | null
  onSyntheticOutputRootChange: (value: string) => void
  onBrowseSyntheticOutputRoot: () => void
  onSyntheticDatasetNameChange: (value: string) => void
  onSyntheticTargetSizeChange: (value: number) => void
  onSyntheticMaxDepthChange: (value: number) => void
  onSyntheticMessinessLevelChange: (value: number) => void
  onSyntheticDuplicateRateChange: (value: number) => void
  onSyntheticIncludeHiddenFilesChange: (value: boolean) => void
  onSyntheticIncludeEmptyFoldersChange: (value: boolean) => void
  onToggleSyntheticCategory: (category: SyntheticDatasetCategory) => void
  onGenerateSyntheticDataset: () => void
  onGenerateAndScanSyntheticDataset: () => void
  onApplySyntheticDatasetAsSource: (rootPath: string) => void
  onLearnerSuggestionFeedback: (
    suggestion: LearnerSuggestionDto,
    feedback: 'acceptedForLater' | 'suppressed',
  ) => void
  onSaveLearnerDraftPreview: (draft: LearnerDraftPreviewDto) => void
}

export function SettingsView({
  aiEvaluationSnapshot,
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
  learnerDraftPreviews,
  duplicateKeeperObservations,
  ruleReviewDecisionObservations,
  learnerSuggestionFeedbackEvents,
  activeLearnerSuggestionId,
  activeLearnerDraftId,
  onSyntheticOutputRootChange,
  onBrowseSyntheticOutputRoot,
  onSyntheticDatasetNameChange,
  onSyntheticTargetSizeChange,
  onSyntheticMaxDepthChange,
  onSyntheticMessinessLevelChange,
  onSyntheticDuplicateRateChange,
  onSyntheticIncludeHiddenFilesChange,
  onSyntheticIncludeEmptyFoldersChange,
  onToggleSyntheticCategory,
  onGenerateSyntheticDataset,
  onGenerateAndScanSyntheticDataset,
  onApplySyntheticDatasetAsSource,
  onLearnerSuggestionFeedback,
  onSaveLearnerDraftPreview,
}: SettingsViewProps) {
  const [activeSettingsTab, setActiveSettingsTab] = useState<
    'mockData' | 'ai' | 'learner' | 'observations'
  >('mockData')
  const syntheticTargetGb = Math.round(syntheticTargetApparentSizeBytes / 1024 ** 3)
  const syntheticTargetLabel =
    syntheticTargetGb >= 1024
      ? `${(syntheticTargetGb / 1024).toFixed(syntheticTargetGb % 1024 === 0 ? 0 : 1)} TB apparent size`
      : `${syntheticTargetGb} GB apparent size`
  const messinessDescriptions: Record<number, string> = {
    1: 'Light: mostly clean folders with occasional out-of-place files.',
    2: 'Moderate: adds mixed naming and a few misplaced files.',
    3: 'Busy: more mixed content and uneven folder structure.',
    4: 'Messy: frequent clutter pockets and noisy folder layouts.',
    5: 'Chaotic: heavy disorder, cross-category scatter, and naming drift.',
  }
  const duplicateRateDescription =
    syntheticDuplicateRatePercent <= 5
      ? 'Very low duplicate pressure. Most generated files are unique.'
      : syntheticDuplicateRatePercent <= 20
        ? 'Low duplicate pressure. A small set of repeated files is injected.'
        : syntheticDuplicateRatePercent <= 45
          ? 'Medium duplicate pressure. Duplicate groups appear regularly.'
          : 'High duplicate pressure. Duplicate clusters become a major review signal.'
  return (
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
            This view is where Safepath collects reusable controls that apply across scans and review
            sessions. Today it surfaces learner suggestions, saved draft presets, and observation
            history while the workflow view handles live scan, review, and execution tasks.
          </p>
        </div>
        <div className="button-row button-row--compact">
          <button
            type="button"
            className={`action-button action-button--secondary ${
              activeSettingsTab === 'mockData' ? 'action-button--active' : ''
            }`}
            onClick={() => setActiveSettingsTab('mockData')}
            aria-pressed={activeSettingsTab === 'mockData'}
          >
            Mock data
          </button>
          <button
            type="button"
            className={`action-button action-button--secondary ${
              activeSettingsTab === 'ai' ? 'action-button--active' : ''
            }`}
            onClick={() => setActiveSettingsTab('ai')}
            aria-pressed={activeSettingsTab === 'ai'}
          >
            AI
          </button>
          <button
            type="button"
            className={`action-button action-button--secondary ${
              activeSettingsTab === 'learner' ? 'action-button--active' : ''
            }`}
            onClick={() => setActiveSettingsTab('learner')}
            aria-pressed={activeSettingsTab === 'learner'}
          >
            Learner
          </button>
          <button
            type="button"
            className={`action-button action-button--secondary ${
              activeSettingsTab === 'observations' ? 'action-button--active' : ''
            }`}
            onClick={() => setActiveSettingsTab('observations')}
            aria-pressed={activeSettingsTab === 'observations'}
          >
            Observations
          </button>
        </div>
        <div className={`status-card ${activeSettingsTab === 'ai' ? '' : 'hidden'}`}>
          <header className="status-card__header">
            <div>
              <p className="status-card__eyebrow">AI evaluation snapshot</p>
              <h3>
                {aiEvaluationSnapshot ? `${aiEvaluationSnapshot.tasks.length} tracked evaluation task${aiEvaluationSnapshot.tasks.length === 1 ? '' : 's'}` : 'No evaluation snapshot yet'}
              </h3>
            </div>
            <span className="status-pill status-pill--neutral">research aid</span>
          </header>
          <p className="status-card__summary">
            This is a local research view for deciding when ML is justified at all. It does not
            enable new defaults by itself and exists to compare heuristics against narrow candidate
            models conservatively.
          </p>
          {aiEvaluationSnapshot ? (
            <>
              <p className="status-card__summary">
                {aiEvaluationSnapshot.totalObservationCount} stored observation
                {aiEvaluationSnapshot.totalObservationCount === 1 ? '' : 's'} analyzed on{' '}
                {formatTimestamp(aiEvaluationSnapshot.generatedAtEpochMs)}.
              </p>
              <ul className="manifest-list">
                {aiEvaluationSnapshot.tasks.map((task) => (
                  <li key={task.taskId} className="manifest-list__item manifest-list__item--stacked">
                    <div>
                      <strong>{task.title}</strong>
                      <p>{task.summary}</p>
                      <p>Baseline: {task.baselineName}</p>
                      {task.candidateName ? <p>Candidate: {task.candidateName}</p> : null}
                      <p>
                        {task.observationCount} observations | baseline {formatRatePercent(task.baselineMatchRate)} | candidate {formatRatePercent(task.candidateMatchRate)}
                      </p>
                      <p>
                        candidate coverage {task.candidateCoverageCount} / {task.observationCount}
                      </p>
                      <p>{task.recommendation}</p>
                      <p>{task.confidenceGuidance}</p>
                      {task.trustNotes.length > 0 ? (
                        <p>Trust notes: {task.trustNotes.join(' | ')}</p>
                      ) : null}
                    </div>
                    <span
                      className={`status-pill ${
                        task.status === 'candidatePromising'
                          ? 'status-pill--ready'
                          : task.status === 'keepHeuristic'
                            ? 'status-pill--neutral'
                            : 'status-pill--needsAttention'
                      }`}
                    >
                      {formatAiEvaluationStatus(task.status)}
                    </span>
                  </li>
                ))}
              </ul>
              {aiEvaluationSnapshot.notes.length > 0 ? (
                <div className="empty-card">
                  <strong>Snapshot notes</strong>
                  <p>{aiEvaluationSnapshot.notes.join(' | ')}</p>
                </div>
              ) : null}
            </>
          ) : (
            <div className="empty-card">
              <strong>No evaluation snapshot yet</strong>
              <p>
                The snapshot appears after Safepath can read local learner observations and build a
                comparison between baseline heuristics and candidate signals.
              </p>
            </div>
          )}
        </div>
        <div className={`status-card ${activeSettingsTab === 'mockData' ? '' : 'hidden'}`}>
          <header className="status-card__header">
            <div>
              <p className="status-card__eyebrow">Synthetic test data</p>
              <h3>Generate messy fake datasets for scanning</h3>
            </div>
            <span className="status-pill status-pill--neutral">testing utility</span>
          </header>
          <p className="status-card__summary">
            Create a realistic, messy folder tree with fake files and sparse large placeholders. The
            generated root can then be used as a scan source without consuming the real disk space
            suggested by the apparent file sizes. The output root folder is created if it does not
            exist yet.
          </p>
          <label className="field-label" htmlFor="synthetic-output-root">
            Output root folder
          </label>
          <input
            id="synthetic-output-root"
            className="text-input"
            onChange={(event) => onSyntheticOutputRootChange(event.target.value)}
            placeholder="/Users/name/Downloads/Testdata (created if missing)"
            type="text"
            value={syntheticOutputRoot}
          />
          <div className="button-row button-row--compact">
            <button
              className="action-button action-button--secondary"
              onClick={onBrowseSyntheticOutputRoot}
              type="button"
            >
              Browse
            </button>
            <button
              className="action-button action-button--secondary"
              onClick={() => onSyntheticOutputRootChange(draftDestinationPath)}
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
            onChange={(event) => onSyntheticDatasetNameChange(event.target.value)}
            type="text"
            value={syntheticDatasetName}
          />
          <div className="synthetic-settings-grid">
            <div>
              <label className="field-label" htmlFor="synthetic-size-target">
                Apparent size of target
              </label>
              <input
                id="synthetic-size-target"
                max={10 * 1024}
                min={0}
                onChange={(event) => onSyntheticTargetSizeChange(Number(event.target.value) * 1024 ** 3)}
                step={10}
                type="range"
                value={syntheticTargetGb}
              />
              <p className="mt-2 text-xs text-white/70">{syntheticTargetLabel}</p>
            </div>
            <div>
              <label className="field-label" htmlFor="synthetic-depth">
                Max folder depth
              </label>
              <select
                id="synthetic-depth"
                className="text-input"
                onChange={(event) => onSyntheticMaxDepthChange(Number(event.target.value))}
                value={syntheticMaxDepth}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((depth) => (
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
                onChange={(event) => onSyntheticMessinessLevelChange(Number(event.target.value))}
                value={syntheticMessinessLevel}
              >
                <option value={1}>Light</option>
                <option value={2}>Moderate</option>
                <option value={3}>Busy</option>
                <option value={4}>Messy</option>
                <option value={5}>Chaotic</option>
              </select>
              <p className="mt-2 text-xs text-white/70">
                {messinessDescriptions[syntheticMessinessLevel] ?? messinessDescriptions[4]}
              </p>
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
                onChange={(event) => onSyntheticDuplicateRateChange(Number(event.target.value) || 0)}
                type="number"
                value={syntheticDuplicateRatePercent}
              />
              <p className="mt-2 text-xs text-white/70">{duplicateRateDescription}</p>
            </div>
          </div>
          <div className="synthetic-toggle-list">
            <label className="synthetic-checkbox">
              <input
                checked={syntheticIncludeHiddenFiles}
                onChange={(event) => onSyntheticIncludeHiddenFilesChange(event.target.checked)}
                type="checkbox"
              />
              Include hidden clutter files
            </label>
            <label className="synthetic-checkbox">
              <input
                checked={syntheticIncludeEmptyFolders}
                onChange={(event) => onSyntheticIncludeEmptyFoldersChange(event.target.checked)}
                type="checkbox"
              />
              Include empty folders
            </label>
          </div>
          <p className="status-card__summary">
            Categories decide which kinds of files appear in the generated tree.
          </p>
          <div className="synthetic-toggle-list">
            {SYNTHETIC_CATEGORY_OPTIONS.map((option) => {
              const selected = syntheticCategories.includes(option.category)
              return (
                <label key={option.category} className="synthetic-checkbox">
                  <input
                    checked={selected}
                    onChange={() => onToggleSyntheticCategory(option.category)}
                    type="checkbox"
                  />
                  <span>
                    <strong>{option.label}</strong> - {option.description}
                  </span>
                </label>
              )
            })}
          </div>
          <div className="button-row">
            <button
              className="action-button"
              disabled={isGeneratingSyntheticData}
              onClick={onGenerateSyntheticDataset}
              type="button"
            >
              {isGeneratingSyntheticData ? 'Generating...' : 'Generate Dataset'}
            </button>
            <button
              className="action-button action-button--secondary"
              disabled={isGeneratingSyntheticData || !draftDestinationPath}
              onClick={onGenerateAndScanSyntheticDataset}
              type="button"
            >
              {isGeneratingSyntheticData ? 'Preparing scan...' : 'Generate Dataset and Scan'}
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
                  onClick={() => onApplySyntheticDatasetAsSource(syntheticDatasetResult.rootPath)}
                  type="button"
                >
                  {isSyntheticSourcePending ? 'Applying...' : 'Use as scan source'}
                </button>
              </div>
            </div>
          ) : null}
        </div>
        <div className={`status-card ${activeSettingsTab === 'learner' ? '' : 'hidden'}`}>
          <header className="status-card__header">
            <div>
              <p className="status-card__eyebrow">Learner suggestions</p>
              <h3>
                {learnerSuggestions.length} reviewable suggestion
                {learnerSuggestions.length === 1 ? '' : 's'}
              </h3>
            </div>
          </header>
          <p className="status-card__summary">
            Learner suggestions now combine duplicate corrections, repeated rule rejections, preset
            choices, and review tendencies into optional local hints. Nothing is auto-applied; you can
            save them for later or suppress them.
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
                    <p>{describeLearnerSuggestion(suggestion, presets)}</p>
                    {suggestion.kind === 'duplicateKeeperPolicySuggestion' ? (
                      <p>
                        preset {suggestion.presetId} | {suggestion.disagreementCount} corrections out
                        of {suggestion.basedOnObservationCount} observations
                      </p>
                    ) : suggestion.kind === 'ruleReviewTuningSuggestion' ? (
                      <p>
                        preset {suggestion.presetId} | rule {suggestion.ruleId} |{' '}
                        {suggestion.rejectionCount} rejects out of{' '}
                        {suggestion.basedOnObservationCount} review decisions
                      </p>
                    ) : suggestion.kind === 'presetAffinitySuggestion' ? (
                      <p>
                        preset {suggestion.presetId} | {formatSourceProfileKind(suggestion.sourceProfileKind)}{' '}
                        profile | {suggestion.presetSelectionCount} selections out of{' '}
                        {suggestion.basedOnObservationCount} similar scans
                      </p>
                    ) : (
                      <p>
                        preset {suggestion.presetId} | suggested {formatReviewMode(suggestion.suggestedReviewMode)}{' '}
                        | {suggestion.rejectionCount + suggestion.disagreementCount} conservative
                        signals out of {suggestion.basedOnObservationCount} outcomes
                      </p>
                    )}
                    <p>{suggestion.rationale}</p>
                    <p>{suggestion.suggestedAdjustment}</p>
                    {learnerSuggestionEvidence(suggestion, presets) ? (
                      <p>{learnerSuggestionEvidence(suggestion, presets)}</p>
                    ) : null}
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
                        onClick={() => onLearnerSuggestionFeedback(suggestion, 'acceptedForLater')}
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
                        onClick={() => onLearnerSuggestionFeedback(suggestion, 'suppressed')}
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
                      : learnerSuggestionStatusLabel(suggestion)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-card">
              <strong>No learner suggestions yet</strong>
              <p>
                Suggestions appear after Safepath sees repeated local patterns in preset choice,
                review outcomes, or duplicate corrections.
              </p>
            </div>
          )}
        </div>
        <div className={`status-card ${activeSettingsTab === 'learner' ? '' : 'hidden'}`}>
          <header className="status-card__header">
            <div>
              <p className="status-card__eyebrow">Draft change previews</p>
              <h3>
                {learnerDraftPreviews.length} previewable preset/rule draft
                {learnerDraftPreviews.length === 1 ? '' : 's'}
              </h3>
            </div>
          </header>
          <p className="status-card__summary">
            These are computed before/after previews tied to active learner suggestions. They are not
            written back to presets and exist only as review material for now.
          </p>
          {learnerDraftPreviews.length > 0 ? (
            <ul className="manifest-list">
              {learnerDraftPreviews.map((draft) => (
                <li key={draft.draftId} className="manifest-list__item manifest-list__item--stacked">
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
                        onClick={() => onSaveLearnerDraftPreview(draft)}
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
                Draft previews appear when an active learner suggestion can be mapped to a concrete
                preset or rule change.
              </p>
            </div>
          )}
        </div>
        <div className={`status-card ${activeSettingsTab === 'observations' ? '' : 'hidden'}`}>
          <header className="status-card__header">
            <div>
              <p className="status-card__eyebrow">Learner observations</p>
              <h3>{duplicateKeeperObservations.length} recent duplicate-keeper observations</h3>
            </div>
          </header>
          <p className="status-card__summary">
            Safepath keeps the raw evidence behind those suggestions here so you can inspect what the
            learner has seen before we add any preset-writing behavior.
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
        <div className={`status-card ${activeSettingsTab === 'observations' ? '' : 'hidden'}`}>
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
            Safepath now records when planned actions are explicitly approved or rejected, tied back
            to the matched planner rule when one exists.
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
        <div className={`status-card ${activeSettingsTab === 'observations' ? '' : 'hidden'}`}>
          <header className="status-card__header">
            <div>
              <p className="status-card__eyebrow">Learner feedback</p>
              <h3>
                {learnerSuggestionFeedbackEvents.length} recent suggestion feedback event
                {learnerSuggestionFeedbackEvents.length === 1 ? '' : 's'}
              </h3>
            </div>
          </header>
          <p className="status-card__summary">
            Suggestion responses are stored as learner observations too, so the system can remember
            which prompts were saved for later and which were suppressed.
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
                    {observation.feedback === 'acceptedForLater' ? 'saved for later' : 'suppressed'}
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
  )
}
