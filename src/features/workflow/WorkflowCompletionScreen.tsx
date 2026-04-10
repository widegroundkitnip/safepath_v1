import { CheckCircle2, History, LayoutGrid, Sparkles } from 'lucide-react'

import type { ExecutionSessionDto } from '../../types/app'

import { WorkflowHomeStageIntro } from './WorkflowHomeStageIntro'
import { WorkflowStepper } from './WorkflowStepper'

type WorkflowCompletionScreenProps = {
  session: ExecutionSessionDto
  planLabel: string
  workflowStepperActiveIndex: number
  uiMode: 'simple' | 'advanced'
  onBackToReview: () => void
  onViewHistory: () => void
  onStartNewScan: () => void
}

function statusMessage(status: ExecutionSessionDto['status']): string {
  switch (status) {
    case 'completed':
      return 'Run finished successfully.'
    case 'partiallyFailed':
      return 'Run finished with some failures — check History for details.'
    case 'failed':
      return 'Run did not complete — see History for what went wrong.'
    default:
      return 'Run finished.'
  }
}

export function WorkflowCompletionScreen({
  session,
  planLabel,
  workflowStepperActiveIndex,
  uiMode,
  onBackToReview,
  onViewHistory,
  onStartNewScan,
}: WorkflowCompletionScreenProps) {
  const ok = session.status === 'completed'

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-10 py-6">
      <WorkflowStepper activeIndex={workflowStepperActiveIndex} className="w-full max-w-3xl px-2" />

      <WorkflowHomeStageIntro uiMode={uiMode} activeIndex={workflowStepperActiveIndex} />

      <div
        className={`flex h-20 w-20 items-center justify-center rounded-3xl shadow-xl ${
          ok
            ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-emerald-600/35'
            : 'bg-gradient-to-br from-amber-500 to-orange-600 shadow-orange-600/35'
        }`}
      >
        {ok ? (
          <CheckCircle2 className="h-11 w-11 text-white" aria-hidden />
        ) : (
          <Sparkles className="h-10 w-10 text-white" aria-hidden />
        )}
      </div>

      <div className="text-center">
        <h2 className="text-3xl font-semibold text-white">Done</h2>
        <p className="mt-2 text-sm text-white/65">{statusMessage(session.status)}</p>
        <p className="mt-1 text-xs text-white/45">Plan: {planLabel}</p>
      </div>

      <div className="grid w-full grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
          <div className="text-xs text-white/45">Completed</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-white">
            {session.completedActionCount}
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
          <div className="text-xs text-white/45">Failed</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-white">
            {session.failedActionCount}
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
          <div className="text-xs text-white/45">Skipped</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-white">
            {session.skippedActionCount}
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
          <div className="text-xs text-white/45">Approved total</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-white">
            {session.approvedActionCount}
          </div>
        </div>
      </div>

      <p className="text-center text-xs text-white/50">
        Undo is best-effort and depends on History. Open History to see per-action undo when
        available.
      </p>

      <div className="flex w-full flex-col gap-3">
        <button
          type="button"
          onClick={onBackToReview}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 to-blue-500 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/25"
        >
          <LayoutGrid className="h-4 w-4" aria-hidden />
          Back to review workspace
        </button>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onViewHistory}
            className="flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 py-3 text-sm text-white hover:bg-white/15"
          >
            <History className="h-4 w-4" aria-hidden />
            History
          </button>
          <button
            type="button"
            onClick={onStartNewScan}
            className="rounded-xl border border-white/15 bg-white/5 py-3 text-sm text-white/90 hover:bg-white/10"
          >
            Start new scan
          </button>
        </div>
      </div>
    </div>
  )
}
