import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'

import type {
  AnalysisSummaryDto,
  LearnerSuggestionDto,
  PresetDefinitionDto,
  ProtectionOverrideKind,
  ScanJobStatusDto,
} from '../../types/app'
import {
  aiSuggestionActionLabel,
  describeAiSuggestion,
  describeLearnerSuggestion,
  formatAiAssistedSuggestionKind,
  formatConfidence,
  formatConfidenceBand,
  summarizeAiEvidence,
} from '../app/shared'

import { WorkflowHomeStageIntro } from './WorkflowHomeStageIntro'
import { WorkflowStepper } from './WorkflowStepper'

const STRUCTURE_CHIP_CLASS: Record<string, string> = {
  flatChaos: 'border-amber-400/35 bg-amber-500/15 text-amber-200',
  deepNesting: 'border-yellow-400/35 bg-yellow-500/15 text-yellow-100',
  mixedContent: 'border-sky-400/35 bg-sky-500/15 text-sky-100',
  hiddenClutter: 'border-violet-400/35 bg-violet-500/15 text-violet-100',
  emptyFolders: 'border-slate-400/35 bg-slate-500/15 text-slate-100',
}

type WorkflowResultsScreenProps = {
  scanStatus: ScanJobStatusDto
  analysisSummary: AnalysisSummaryDto | null
  presets: PresetDefinitionDto[]
  selectedPresetId: string
  onPresetChange: (presetId: string) => void
  onBuildPlan: () => void
  isBuildingPlan: boolean
  onRunExpensiveAnalysis: () => void
  isRunningExpensiveAnalysis: boolean
  activeAnalysisJobId: string | null
  onContinueToWorkspace: () => void
  hasPlan: boolean
  uiMode: 'simple' | 'advanced'
  workflowPreferenceSuggestions: Extract<
    LearnerSuggestionDto,
    { kind: 'presetAffinitySuggestion' | 'reviewModePreferenceSuggestion' }
  >[]
  aiAssistedSuggestions: AnalysisSummaryDto['aiAssistedSuggestions']
  selectedPresetIdForAi: string
  onApplyAiPreset: (presetId: string) => void
  onApplyStructureProtection: (path: string, kind: ProtectionOverrideKind) => void
  isOverridden: (path: string) => boolean
  workflowStepperActiveIndex: number
}

export function WorkflowResultsScreen({
  scanStatus,
  analysisSummary,
  presets,
  selectedPresetId,
  onPresetChange,
  onBuildPlan,
  isBuildingPlan,
  onRunExpensiveAnalysis,
  isRunningExpensiveAnalysis,
  activeAnalysisJobId,
  onContinueToWorkspace,
  hasPlan,
  uiMode,
  workflowPreferenceSuggestions,
  aiAssistedSuggestions,
  selectedPresetIdForAi,
  onApplyAiPreset,
  onApplyStructureProtection,
  isOverridden,
  workflowStepperActiveIndex,
}: WorkflowResultsScreenProps) {
  const dupCount = analysisSummary?.likelyDuplicateGroups.length ?? 0
  const protCount = analysisSummary?.detectedProtections.length ?? 0
  const attentionCount =
    (analysisSummary?.unknownCount ?? 0) + (analysisSummary?.noExtensionCount ?? 0)

  const expensiveRunning =
    isRunningExpensiveAnalysis || (!!activeAnalysisJobId && activeAnalysisJobId === scanStatus.jobId)

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <WorkflowStepper activeIndex={workflowStepperActiveIndex} className="px-2" />

      <WorkflowHomeStageIntro uiMode={uiMode} activeIndex={workflowStepperActiveIndex} />

      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg shadow-emerald-600/30">
          <CheckCircle2 className="h-9 w-9 text-white" aria-hidden />
        </div>
        <h2 className="text-3xl font-semibold text-white">Scan complete</h2>
        <p className="mt-2 text-white/65">
          {uiMode === 'advanced' ? (
            <>
              Review the summary, optionally run a deeper duplicate check, then build a plan from a
              preset.
            </>
          ) : (
            <>
              Here’s what Safepath noticed. Pick a preset below to build a plan you approve before
              anything moves.
            </>
          )}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-3xl border border-emerald-400/25 bg-emerald-500/10 p-6 backdrop-blur-xl">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-medium text-white">Files discovered</h3>
            <span className="rounded-full bg-emerald-400/20 px-2.5 py-0.5 text-xs font-medium text-emerald-200">
              {scanStatus.scannedFiles} files
            </span>
          </div>
          <p className="mt-2 text-sm text-white/60">
            {uiMode === 'advanced' ? (
              <>
                {scanStatus.scannedDirectories} directories under {scanStatus.discoveredEntries}{' '}
                entries indexed.
              </>
            ) : (
              <>
                {scanStatus.scannedDirectories} folders · {scanStatus.discoveredEntries} items
                cataloged.
              </>
            )}
          </p>
        </div>

        <div className="rounded-3xl border border-amber-400/25 bg-amber-500/10 p-6 backdrop-blur-xl">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-medium text-white">
              {uiMode === 'advanced' ? 'Duplicates (cheap scan)' : 'Possible duplicates'}
            </h3>
            <span className="rounded-full bg-amber-400/20 px-2.5 py-0.5 text-xs font-medium text-amber-100">
              {dupCount} groups
            </span>
          </div>
          <p className="mt-2 text-sm text-white/60">
            {uiMode === 'advanced' ? (
              <>Run deep hashing for more confidence before you finalize keepers.</>
            ) : (
              <>You’ll confirm which copy to keep when you review your plan.</>
            )}
          </p>
        </div>

        <div className="rounded-3xl border border-sky-400/25 bg-sky-500/10 p-6 backdrop-blur-xl">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-medium text-white">Protected paths</h3>
            <span className="rounded-full bg-sky-400/20 px-2.5 py-0.5 text-xs font-medium text-sky-100">
              {protCount} detected
            </span>
          </div>
          <p className="mt-2 text-sm text-white/60">Safepath will avoid these unless you change them.</p>
        </div>

        <div className="rounded-3xl border border-violet-400/25 bg-violet-500/10 p-6 backdrop-blur-xl">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-medium text-white">
              {uiMode === 'advanced' ? 'Needs attention' : 'Unusual files'}
            </h3>
            <span className="rounded-full bg-violet-400/20 px-2.5 py-0.5 text-xs font-medium text-violet-100">
              {attentionCount} signals
            </span>
          </div>
          <p className="mt-2 text-sm text-white/60">
            {uiMode === 'advanced' ? (
              <>
                Unknown types and files without extensions may need review in the plan.
              </>
            ) : (
              <>A few files may need an extra look when you review the plan.</>
            )}
          </p>
        </div>
      </div>

      {uiMode === 'advanced' && analysisSummary && analysisSummary.structureSignals.length > 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
          <h4 className="text-sm font-medium text-white">Structure signals</h4>
          <p className="mt-1 text-xs text-white/50">Patterns inferred from your sources</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {analysisSummary.structureSignals.map((signal) => (
              <span
                key={`${signal.kind}-${signal.description}`}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${
                  STRUCTURE_CHIP_CLASS[signal.kind] ??
                  'border-white/15 bg-white/10 text-white/80'
                }`}
              >
                <AlertCircle className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                {signal.description}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {uiMode === 'advanced' &&
      analysisSummary &&
      scanStatus.status === 'completed' &&
      scanStatus.discoveredEntries > 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h4 className="font-medium text-white">Deep duplicate check</h4>
              <p className="mt-1 text-sm text-white/55">
                Full content hashing — slower, higher confidence for duplicate groups.
              </p>
            </div>
            <button
              type="button"
              onClick={onRunExpensiveAnalysis}
              disabled={
                expensiveRunning || scanStatus.status !== 'completed' || scanStatus.discoveredEntries === 0
              }
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-5 py-2.5 text-sm font-medium text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {expensiveRunning ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              {expensiveRunning ? 'Hashing…' : 'Run deep duplicate check'}
            </button>
          </div>
          {analysisSummary.skippedLargeSyntheticFiles > 0 ? (
            <p className="mt-3 text-xs text-white/45">
              Skipped hashing {analysisSummary.skippedLargeSyntheticFiles} large synthetic placeholder
              file{analysisSummary.skippedLargeSyntheticFiles === 1 ? '' : 's'}.
            </p>
          ) : null}
        </div>
      ) : null}

      {uiMode === 'advanced' && analysisSummary && aiAssistedSuggestions.length > 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
          <h4 className="font-medium text-white">AI-assisted suggestions</h4>
          <p className="mt-1 text-sm text-white/55">Local, explainable hints — nothing applies unless you choose.</p>
          <ul className="mt-4 space-y-4">
            {aiAssistedSuggestions.map((suggestion) => (
              <li
                key={suggestion.suggestionId}
                className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm"
              >
                <p className="font-medium text-white">{suggestion.title}</p>
                <p className="mt-1 text-white/70">{describeAiSuggestion(suggestion, presets)}</p>
                <p className="mt-2 text-xs text-white/50">
                  {formatAiAssistedSuggestionKind(suggestion.kind)} | {formatConfidence(suggestion.confidence)} |{' '}
                  {formatConfidenceBand(suggestion.confidence)}
                </p>
                <p className="mt-1 text-white/65">{suggestion.summary}</p>
                {summarizeAiEvidence(suggestion) ? (
                  <p className="mt-1 text-xs text-white/50">{summarizeAiEvidence(suggestion)}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {suggestion.suggestedPresetId ? (
                    <button
                      type="button"
                      disabled={selectedPresetIdForAi === suggestion.suggestedPresetId}
                      onClick={() => onApplyAiPreset(suggestion.suggestedPresetId!)}
                      className="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/15 disabled:opacity-50"
                    >
                      {selectedPresetIdForAi === suggestion.suggestedPresetId
                        ? 'Using this preset'
                        : aiSuggestionActionLabel(suggestion, presets)}
                    </button>
                  ) : null}
                  {suggestion.suggestedProtectionPath && suggestion.suggestedProtectionKind ? (
                    <button
                      type="button"
                      disabled={isOverridden(suggestion.suggestedProtectionPath)}
                      onClick={() =>
                        onApplyStructureProtection(
                          suggestion.suggestedProtectionPath!,
                          suggestion.suggestedProtectionKind ?? 'userProtected',
                        )
                      }
                      className="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/15 disabled:opacity-50"
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
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
          <h4 className="font-medium text-white">Preference hints</h4>
          <p className="mt-1 text-sm text-white/55">From local history — optional.</p>
          <ul className="mt-4 space-y-3">
            {workflowPreferenceSuggestions.map((suggestion) => (
              <li
                key={suggestion.suggestionId}
                className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/80"
              >
                <p className="font-medium text-white">{suggestion.title}</p>
                <p className="mt-1">{describeLearnerSuggestion(suggestion, presets)}</p>
                {suggestion.kind === 'presetAffinitySuggestion' ? (
                  <button
                    type="button"
                    disabled={selectedPresetIdForAi === suggestion.presetId}
                    onClick={() => onApplyAiPreset(suggestion.presetId)}
                    className="mt-2 rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs hover:bg-white/15 disabled:opacity-50"
                  >
                    Use suggested preset
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-3xl border border-white/15 bg-white/10 p-8 backdrop-blur-xl">
        <label className="mb-2 block text-sm font-medium text-white" htmlFor="results-preset">
          Preset for plan
        </label>
        <select
          id="results-preset"
          value={selectedPresetId}
          onChange={(e) => onPresetChange(e.target.value)}
          className="w-full rounded-2xl border border-white/15 bg-black/35 px-4 py-3 text-sm text-white"
        >
          {presets.map((p) => (
            <option key={p.presetId} value={p.presetId}>
              {p.name}
            </option>
          ))}
        </select>
        {selectedPresetId ? (
          <p className="mt-3 text-sm text-white/60">
            {presets.find((p) => p.presetId === selectedPresetId)?.description}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onBuildPlan}
          disabled={isBuildingPlan || !scanStatus.jobId || !selectedPresetId}
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 to-blue-500 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isBuildingPlan ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {isBuildingPlan ? 'Building plan…' : 'Build plan'}
        </button>
      </div>

      {hasPlan ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onContinueToWorkspace}
            className="rounded-2xl border border-white/20 bg-white/10 px-10 py-3 text-sm font-medium text-white hover:bg-white/15"
          >
            Open review workspace
          </button>
        </div>
      ) : null}
    </div>
  )
}
