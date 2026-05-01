import { Loader2, Sparkles } from 'lucide-react'

import type { ScanJobStatusDto, ScanProgressEvent } from '../../types/app'
import { duplicateRunPhaseLabel } from './duplicateRunPhaseLabel'
import { WorkflowHomeStageIntro } from './WorkflowHomeStageIntro'
import { WorkflowStepper } from './WorkflowStepper'

type WorkflowScanningScreenProps = {
  scanStatus: ScanJobStatusDto
  scanProgress: ScanProgressEvent | null
  onCancel: () => void
  isCancelling?: boolean
  workflowStepperActiveIndex: number
  uiMode: 'simple' | 'advanced'
}

export function WorkflowScanningScreen({
  scanStatus,
  scanProgress,
  onCancel,
  isCancelling = false,
  workflowStepperActiveIndex,
  uiMode,
}: WorkflowScanningScreenProps) {
  const total = Math.max(scanStatus.discoveredEntries, 1)
  const done = scanStatus.scannedFiles + scanStatus.scannedDirectories
  const pct = Math.min(100, Math.round((done / total) * 100))
  const phaseHint = duplicateRunPhaseLabel(scanStatus.duplicateRunPhase)

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-10 py-8">
      <WorkflowStepper activeIndex={workflowStepperActiveIndex} className="w-full max-w-3xl px-2" />

      <WorkflowHomeStageIntro uiMode={uiMode} activeIndex={workflowStepperActiveIndex} />

      <div
        className="relative h-44 w-44"
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label={`Scan progress ${pct} percent`}
      >
        <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100" aria-hidden>
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="8"
          />
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="url(#scanGrad)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 42}`}
            strokeDashoffset={`${2 * Math.PI * 42 * (1 - pct / 100)}`}
            className="transition-all duration-300"
          />
          <defs>
            <linearGradient id="scanGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#a78bfa" />
              <stop offset="100%" stopColor="#3b82f6" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <Sparkles className="mb-1 h-8 w-8 text-white/90" aria-hidden />
          <span className="text-2xl font-semibold tabular-nums text-white">{pct}%</span>
        </div>
      </div>

      <div className="text-center">
        <h2 className="text-2xl font-semibold text-white">Scanning files</h2>
        {phaseHint ? (
          <p className="mt-1 text-sm font-medium text-violet-200/90">{phaseHint}</p>
        ) : null}
        <p className="mt-2 text-sm text-white/60">
          {uiMode === 'simple'
            ? scanProgress?.latestPath
              ? 'Working through your folders…'
              : 'Discovering files and building the manifest…'
            : scanProgress?.latestPath
              ? `Latest: ${scanProgress.latestPath}`
              : 'Discovering files and building the manifest…'}
        </p>
      </div>

      <div className="grid w-full grid-cols-3 gap-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center backdrop-blur-sm">
          <div className="text-xs text-white/45">Files</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-white">
            {scanStatus.scannedFiles}
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center backdrop-blur-sm">
          <div className="text-xs text-white/45">Dirs</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-white">
            {scanStatus.scannedDirectories}
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center backdrop-blur-sm">
          <div className="text-xs text-white/45">Discovered</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-white">
            {scanStatus.discoveredEntries}
          </div>
        </div>
      </div>

      {uiMode === 'advanced' ? (
        <p className="text-center text-xs text-white/40">
          Job <span className="font-mono text-white/55">{scanStatus.jobId}</span>
        </p>
      ) : null}

      <button
        type="button"
        onClick={onCancel}
        disabled={isCancelling || scanStatus.status !== 'running'}
        className="w-full max-w-xs rounded-2xl border border-white/15 bg-white/10 py-3 text-sm font-medium text-white transition-colors hover:bg-white/15 disabled:opacity-40"
      >
        {isCancelling ? (
          <span className="inline-flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Cancelling…
          </span>
        ) : (
          'Cancel scan'
        )}
      </button>
    </div>
  )
}
