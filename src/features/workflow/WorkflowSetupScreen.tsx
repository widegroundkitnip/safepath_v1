import { CheckCircle2, FolderOpen, Loader2, PlayCircle, AlertCircle } from 'lucide-react'

import { PermissionReadinessCard } from '../../components/permissions/PermissionReadinessCard'
import type { AppStatusDto } from '../../types/app'

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
