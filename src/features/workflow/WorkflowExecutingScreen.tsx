import { Loader2, Sparkles } from 'lucide-react'

import type { ExecutionSessionDto } from '../../types/app'

import { WorkflowHomeStageIntro } from './WorkflowHomeStageIntro'
import { WorkflowStepper } from './WorkflowStepper'

type WorkflowExecutingScreenProps = {
  session: ExecutionSessionDto
  planLabel: string
  workflowStepperActiveIndex: number
  uiMode: 'simple' | 'advanced'
}

export function WorkflowExecutingScreen({
  session,
  planLabel,
  workflowStepperActiveIndex,
  uiMode,
}: WorkflowExecutingScreenProps) {
  const done =
    session.completedActionCount + session.failedActionCount + session.skippedActionCount
  const total = Math.max(session.approvedActionCount, 1)
  const pct = Math.min(100, Math.round((done / total) * 100))

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-10 py-6">
      <WorkflowStepper activeIndex={workflowStepperActiveIndex} className="w-full max-w-3xl px-2" />

      <WorkflowHomeStageIntro uiMode={uiMode} activeIndex={workflowStepperActiveIndex} />

      <div className="text-center">
        <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-blue-600 shadow-lg shadow-violet-500/40">
          <Sparkles className="h-8 w-8 text-white" aria-hidden />
        </div>
        <h2 className="text-2xl font-semibold text-white">Organizing files</h2>
        <p className="mt-2 text-sm text-white/60">
          Plan: <span className="text-white/85">{planLabel}</span>
        </p>
      </div>

      <div
        className="relative h-40 w-40"
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label={`Execution progress ${pct} percent`}
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
            stroke="url(#execGrad)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 42}`}
            strokeDashoffset={`${2 * Math.PI * 42 * (1 - pct / 100)}`}
            className="transition-all duration-500"
          />
          <defs>
            <linearGradient id="execGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#2563eb" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <Loader2 className="mb-1 h-7 w-7 animate-spin text-white/80" aria-hidden />
          <span className="text-lg font-semibold tabular-nums text-white">{pct}%</span>
        </div>
      </div>

      <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ['Completed', session.completedActionCount],
            ['Failed', session.failedActionCount],
            ['Skipped', session.skippedActionCount],
            ['Approved', session.approvedActionCount],
          ] as const
        ).map(([label, value]) => (
          <div
            key={label}
            className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center backdrop-blur-sm"
          >
            <div className="text-xs text-white/45">{label}</div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-white">{value}</div>
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-white/40">
        Safepath is moving files with the same checks as in review. You can switch away from this
        screen, but keep the app open until it finishes.
      </p>
    </div>
  )
}
