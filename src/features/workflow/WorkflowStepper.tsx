import { Check } from 'lucide-react'

import { WORKFLOW_STEPPER_LABELS } from '../../shell/getWorkflowPhaseLabel'

type WorkflowStepperProps = {
  activeIndex: number
  className?: string
  /** Tighter layout for dense chrome (e.g. plan workspace). */
  density?: 'comfortable' | 'compact'
}

export function WorkflowStepper({
  activeIndex,
  className = '',
  density = 'comfortable',
}: WorkflowStepperProps) {
  if (activeIndex < 0) {
    return null
  }

  const compact = density === 'compact'
  const steps = WORKFLOW_STEPPER_LABELS

  return (
    <nav aria-label="Workflow progress" className={className}>
      <ol
        className={`flex w-full items-center ${compact ? 'overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]' : ''}`}
      >
        {steps.map((label, i) => {
          const done = i < activeIndex
          const current = i === activeIndex
          const last = i === steps.length - 1

          return (
            <li
              key={label}
              aria-current={current ? 'step' : undefined}
              className={`flex items-center ${last ? '' : 'min-w-0 flex-1'}`}
            >
              <div className="flex shrink-0 flex-col items-center gap-1">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold tabular-nums transition-colors ${
                    done
                      ? 'border-emerald-400/50 bg-emerald-500/25 text-emerald-100'
                      : current
                        ? 'border-violet-400/80 bg-violet-500/30 text-white shadow-md shadow-violet-500/20'
                        : 'border-white/15 bg-white/5 text-white/40'
                  }`}
                >
                  {done ? <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden /> : i + 1}
                </span>
                <span
                  className={`max-w-[5.5rem] text-center leading-tight ${
                    compact ? 'text-[10px] text-white/55 sm:text-xs' : 'text-[10px] text-white/60 sm:text-xs'
                  } ${current ? 'font-medium text-white/90' : ''}`}
                >
                  <span className="sr-only">
                    {done ? 'Completed: ' : current ? 'Current step: ' : 'Not started: '}
                  </span>
                  {label}
                </span>
              </div>
              {!last ? (
                <div
                  className={`mx-1 min-h-[2px] min-w-[0.5rem] flex-1 rounded-full bg-white/20 sm:mx-2 ${compact ? 'max-w-[2.5rem]' : ''}`}
                  aria-hidden
                />
              ) : null}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
