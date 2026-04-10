import { WORKFLOW_STEPPER_LABELS } from '../../shell/getWorkflowPhaseLabel'

type WorkflowHomeStageIntroProps = {
  uiMode: 'simple' | 'advanced'
  activeIndex: number
}

const GUIDANCE: Record<number, string> = {
  0: 'Add your source folders and destination, run readiness checks, then start the scan.',
  1: 'Safepath is scanning your folders. You can cancel if you need to stop.',
  2: 'Review what we found, pick a preset, then build a plan when you are ready.',
  3: 'Approve or adjust planned moves, resolve duplicates if needed, then execute when checks pass.',
  4: 'Approved moves are running. You will see progress until the run finishes.',
  5: 'This run finished. You can review history, undo where available, or start over from Home.',
}

export function WorkflowHomeStageIntro({ uiMode, activeIndex }: WorkflowHomeStageIntroProps) {
  if (uiMode !== 'simple' || activeIndex < 0 || activeIndex >= WORKFLOW_STEPPER_LABELS.length) {
    return null
  }

  const label = WORKFLOW_STEPPER_LABELS[activeIndex]
  const hint = GUIDANCE[activeIndex] ?? ''

  return (
    <div className="rounded-2xl border border-white/15 bg-white/5 px-5 py-4 text-center backdrop-blur-sm">
      <p className="text-xs font-medium uppercase tracking-wider text-violet-200/90">
        Step {activeIndex + 1} of {WORKFLOW_STEPPER_LABELS.length} · {label}
      </p>
      <p className="mt-2 text-sm text-white/75">{hint}</p>
    </div>
  )
}
