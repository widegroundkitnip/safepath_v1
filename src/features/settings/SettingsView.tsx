import { AppStatusSummary } from '../../components/layout/AppStatusSummary'
import type {
  AppStatusDto,
  GenerateSyntheticDatasetResultDto,
  LearnerDraftPreviewDto,
  LearnerObservationDto,
  LearnerSuggestionDto,
  SyntheticDatasetCategory,
} from '../../types/app'
import { formatBytes, formatSyntheticCategory, formatTimestamp, SYNTHETIC_CATEGORY_OPTIONS, SYNTHETIC_SIZE_OPTIONS } from '../app/shared'

interface SettingsViewProps {
  status: AppStatusDto | null
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
  status,
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
        <div className="status-card">
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
                Apparent size target
              </label>
              <select
                id="synthetic-size-target"
                className="text-input"
                onChange={(event) => onSyntheticTargetSizeChange(Number(event.target.value))}
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
                onChange={(event) => onSyntheticMaxDepthChange(Number(event.target.value))}
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
                onChange={(event) => onSyntheticMessinessLevelChange(Number(event.target.value))}
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
                onChange={(event) => onSyntheticDuplicateRateChange(Number(event.target.value) || 0)}
                type="number"
                value={syntheticDuplicateRatePercent}
              />
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
          <div className="synthetic-category-grid">
            {SYNTHETIC_CATEGORY_OPTIONS.map((option) => {
              const selected = syntheticCategories.includes(option.category)
              return (
                <button
                  key={option.category}
                  className={`synthetic-category-chip ${
                    selected ? 'synthetic-category-chip--selected' : ''
                  }`}
                  onClick={() => onToggleSyntheticCategory(option.category)}
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
              onClick={onGenerateSyntheticDataset}
              type="button"
            >
              {isGeneratingSyntheticData ? 'Generating...' : 'Generate dataset'}
            </button>
            <button
              className="action-button action-button--secondary"
              disabled={isGeneratingSyntheticData || !draftDestinationPath}
              onClick={onGenerateAndScanSyntheticDataset}
              type="button"
            >
              {isGeneratingSyntheticData ? 'Preparing scan...' : 'Generate and scan'}
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
        <div className="status-card">
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
            Phase 7 now turns both duplicate-keeper corrections and repeated rule rejections into
            reviewable suggestions. Nothing is auto-applied yet; you can only save them for later or
            suppress them.
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
                        preset {suggestion.presetId} | {suggestion.disagreementCount} corrections out
                        of {suggestion.basedOnObservationCount} observations
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
              <p>Suggestions appear after repeated duplicate-keeper corrections establish a clear pattern.</p>
            </div>
          )}
        </div>
        <div className="status-card">
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
        <div className="status-card">
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
        <div className="status-card">
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
