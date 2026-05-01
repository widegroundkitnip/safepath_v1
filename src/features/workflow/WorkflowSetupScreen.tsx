import { CheckCircle2, FolderOpen, Loader2, PlayCircle, AlertCircle } from 'lucide-react'
import type { Dispatch, SetStateAction } from 'react'

import { PermissionReadinessCard } from '../../components/permissions/PermissionReadinessCard'
import type { AppStatusDto } from '../../types/app'
import type {
  DuplicateGroupScope,
  ExecutionSafetyTier,
  KeeperPreference,
  MatchingStrategy,
  SimpleDuplicateMode,
  SimpleStrictness,
} from '../../types/duplicateConfig'

import { WorkflowHomeStageIntro } from './WorkflowHomeStageIntro'
import { WorkflowStepper } from './WorkflowStepper'

type WorkflowSetupScreenProps = {
  status: AppStatusDto | null
  sourceInput: string
  destinationInput: string
  onSourceChange: (value: string) => void
  onDestinationChange: (value: string) => void
  onBrowseSource: () => void
  onBrowseDestination: () => void
  onStartScan: () => void
  isBrowsingSource: boolean
  isBrowsingDestination: boolean
  isStartingScan: boolean
  canAttemptScan: boolean
  workflowStepperActiveIndex: number
  uiMode: 'simple' | 'advanced'
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

export function WorkflowSetupScreen({
  status,
  sourceInput,
  destinationInput,
  onSourceChange,
  onDestinationChange,
  onBrowseSource,
  onBrowseDestination,
  onStartScan,
  isBrowsingSource,
  isBrowsingDestination,
  isStartingScan,
  canAttemptScan,
  workflowStepperActiveIndex,
  uiMode,
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
}: WorkflowSetupScreenProps) {
  const draftSourceLines = sourceInput
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-10">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-400 to-blue-500 shadow-xl shadow-violet-500/40">
          <FolderOpen className="h-10 w-10 text-white" aria-hidden />
        </div>
        <h2 className="text-3xl font-semibold tracking-tight text-white">Organize safely</h2>
        <p className="mt-3 text-balance text-white/70">
          Scan folders, review what Safepath proposes to move, and approve changes before anything
          happens on disk.
        </p>
      </div>

      <WorkflowStepper
        activeIndex={workflowStepperActiveIndex}
        className="w-full max-w-3xl self-center px-2"
      />

      <WorkflowHomeStageIntro uiMode={uiMode} activeIndex={workflowStepperActiveIndex} />

      <div className="rounded-3xl border border-white/15 bg-white/10 p-8 shadow-xl backdrop-blur-xl">
        <label className="mb-2 block text-sm font-medium text-white" htmlFor="wf-source-paths">
          Source folders
        </label>
        {uiMode === 'advanced' ? (
          <p className="mb-3 text-xs text-white/50">One absolute path per line</p>
        ) : (
          <p className="mb-3 text-xs text-white/50">Add the folders you want Safepath to look at.</p>
        )}
        <textarea
          id="wf-source-paths"
          value={sourceInput}
          onChange={(e) => onSourceChange(e.target.value)}
          rows={4}
          placeholder="/Users/you/Downloads"
          className="w-full resize-y rounded-2xl border border-white/15 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-white/35"
        />
        <div className="button-row button-row--compact">
          <button
            type="button"
            onClick={onBrowseSource}
            disabled={isBrowsingSource}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            {isBrowsingSource ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {isBrowsingSource ? 'Opening…' : 'Browse source folder'}
          </button>
        </div>
        {draftSourceLines.length > 0 && uiMode === 'advanced' ? (
          <p className="mt-2 text-xs text-white/50">{draftSourceLines.length} path(s) ready</p>
        ) : null}
      </div>

      <div className="rounded-3xl border border-white/15 bg-white/10 p-8 shadow-xl backdrop-blur-xl">
        <label className="mb-2 block text-sm font-medium text-white" htmlFor="wf-destination">
          Destination
        </label>
        <input
          id="wf-destination"
          type="text"
          value={destinationInput}
          onChange={(e) => onDestinationChange(e.target.value)}
          placeholder="/Users/you/Organized"
          className="w-full rounded-2xl border border-white/15 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-white/35"
        />
        <div className="button-row button-row--compact">
          <button
            type="button"
            onClick={onBrowseDestination}
            disabled={isBrowsingDestination}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            {isBrowsingDestination ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {isBrowsingDestination ? 'Opening…' : 'Browse destination folder'}
          </button>
        </div>
      </div>

      <div className="rounded-3xl border border-white/15 bg-white/10 p-8 shadow-xl backdrop-blur-xl">
        <p className="mb-1 text-sm font-medium text-white">Duplicate detection</p>
        <p className="mb-4 text-xs text-white/55">
          {uiMode === 'simple'
            ? 'These settings apply to the next scan. Simple mode stays on non-destructive safety.'
            : 'Full control over matching, grouping, and execution tier for the next scan.'}
        </p>
        {uiMode === 'simple' ? (
          <div className="flex flex-col gap-4 text-sm text-white">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-white/50">Mode</p>
              <div className="flex flex-col gap-2">
                {(
                  [
                    ['exactDuplicates', 'Exact duplicates'],
                    ['similarFiles', 'Similar files'],
                    ['mediaDuplicates', 'Media duplicates'],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value} className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="dup-simple-mode"
                      checked={dupSimpleMode === value}
                      onChange={() => setDupSimpleMode(value)}
                      className="accent-violet-400"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-white/60">Strictness</span>
              <select
                value={dupSimpleStrictness}
                onChange={(e) => setDupSimpleStrictness(e.target.value as SimpleStrictness)}
                className="rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-white"
              >
                <option value="strict">Strict</option>
                <option value="balanced">Balanced</option>
                <option value="flexible">Flexible (review-heavy)</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-white/60">Keeper preference</span>
              <select
                value={dupKeeperPreference}
                onChange={(e) => setDupKeeperPreference(e.target.value as KeeperPreference)}
                className="rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-white"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="preferOriginalFolder">Original folder (shallow path)</option>
                <option value="preferProtected">Prefer protected</option>
                <option value="shortestPath">Shortest path</option>
                <option value="largestFile">Largest file</option>
              </select>
            </label>
            <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={dupIgnoreSmallFiles}
                  onChange={(e) => setDupIgnoreSmallFiles(e.target.checked)}
                  className="accent-violet-400"
                />
                Ignore tiny files (under 4&nbsp;KB)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={dupIgnoreHiddenSystem}
                  onChange={(e) => setDupIgnoreHiddenSystem(e.target.checked)}
                  className="accent-violet-400"
                />
                Ignore system junk (.DS_Store, etc.)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={dupGroupByFolder}
                  onChange={(e) => setDupGroupByFolder(e.target.checked)}
                  className="accent-violet-400"
                />
                Group duplicates within same folder only
              </label>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 text-sm text-white">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-white/60">Matching strategy</span>
              <select
                value={advancedDupStrategy}
                onChange={(e) => setAdvancedDupStrategy(e.target.value as MatchingStrategy)}
                className="rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-white"
              >
                <option value="exactHash">Exact hash</option>
                <option value="fastNameSize">Fast (name + size)</option>
                <option value="hybrid">Hybrid (name/size + hash)</option>
                <option value="similar">Similar (experimental)</option>
                <option value="metadataOnly">Metadata only</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-white/60">Keeper preference</span>
              <select
                value={advancedDupKeeper}
                onChange={(e) => setAdvancedDupKeeper(e.target.value as KeeperPreference)}
                className="rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-white"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="preferOriginalFolder">Original folder</option>
                <option value="preferProtected">Prefer protected</option>
                <option value="shortestPath">Shortest path</option>
                <option value="largestFile">Largest file</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-white/60">Group scope</span>
              <select
                value={advancedDupScope}
                onChange={(e) => setAdvancedDupScope(e.target.value as DuplicateGroupScope)}
                className="rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-white"
              >
                <option value="external">Across sources</option>
                <option value="perSourceRoot">Per source root</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-white/60">Execution safety tier</span>
              <select
                value={advancedDupSafetyTier}
                onChange={(e) => setAdvancedDupSafetyTier(e.target.value as ExecutionSafetyTier)}
                className="rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-white"
              >
                <option value="safeHold">Safe hold (default)</option>
                <option value="reversible">Reversible</option>
                <option value="destructive">Destructive (advanced)</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={advancedDupIncludeHidden}
                onChange={(e) => setAdvancedDupIncludeHidden(e.target.checked)}
                className="accent-violet-400"
              />
              Include hidden files
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={advancedDupIgnoreJunk}
                onChange={(e) => setAdvancedDupIgnoreJunk(e.target.checked)}
                className="accent-violet-400"
              />
              Ignore system junk
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={advancedDupGroupByFolder}
                onChange={(e) => setAdvancedDupGroupByFolder(e.target.checked)}
                className="accent-violet-400"
              />
              Group within same folder
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={advancedDupImages}
                onChange={(e) => setAdvancedDupImages(e.target.checked)}
                className="accent-violet-400"
              />
              Enable image module (similarity hooks)
            </label>
            <div className="mt-2 border-t border-white/10 pt-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-white/50">
                Analysis budgets
              </p>
              <label className="mb-2 flex flex-col gap-1">
                <span className="text-xs text-white/60">Max files for similarity work</span>
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={advancedDupMaxSimilarFiles}
                  onChange={(e) => setAdvancedDupMaxSimilarFiles(Number(e.target.value) || 0)}
                  className="rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-white"
                />
              </label>
              <label className="mb-2 flex flex-col gap-1">
                <span className="text-xs text-white/60">Max pairwise comparisons</span>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={advancedDupMaxPairwise}
                  onChange={(e) => setAdvancedDupMaxPairwise(Number(e.target.value) || 0)}
                  className="rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-white"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-white/60">Analysis timeout (ms, optional)</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="e.g. 120000"
                  value={advancedDupTimeoutMsRaw}
                  onChange={(e) => setAdvancedDupTimeoutMsRaw(e.target.value)}
                  className="rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-white placeholder:text-white/35"
                />
              </label>
            </div>
          </div>
        )}
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-white/50">
            What happens when you scan
          </p>
          <ul className="list-inside list-disc space-y-1 text-xs text-white/75">
            {duplicateScanPreviewLines.map((line, index) => (
              <li key={`${index}-${line.slice(0, 24)}`}>{line}</li>
            ))}
          </ul>
        </div>
      </div>

      {status ? (
        uiMode === 'advanced' ? (
          <div className="legacy-card-wrap">
            <PermissionReadinessCard readiness={status.permissionsReadiness} />
          </div>
        ) : (
          <div className="rounded-3xl border border-white/15 bg-white/5 p-6 backdrop-blur-xl">
            <p className="text-sm font-medium text-white">Access check</p>
            <p className="mt-2 text-sm text-white/70">{status.permissionsReadiness.summary}</p>
          </div>
        )
      ) : null}

      <div className="flex flex-col items-center gap-4">
        {canAttemptScan ? (
          <div className="flex items-center gap-2 text-sm text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
            Ready to scan
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-amber-200/90">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
            Add at least one source and one destination folder
          </div>
        )}

        <div className="flex w-full max-w-md flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={onStartScan}
            disabled={!canAttemptScan || isStartingScan}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 to-blue-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/30 transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isStartingScan ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <PlayCircle className="h-4 w-4" aria-hidden />
            )}
            {isStartingScan ? 'Starting…' : 'Start scan'}
          </button>
        </div>
      </div>
    </div>
  )
}
