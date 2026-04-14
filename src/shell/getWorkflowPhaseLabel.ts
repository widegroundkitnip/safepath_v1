import type { AppNavId } from './AppLayout'
import type { ExecutionSessionDto, PlanDto, ScanJobStatusDto } from '../types/app'

export type WorkflowUiStep = 'setup' | 'scanning' | 'results' | 'workspace' | 'complete'

export type WorkflowPhaseLabelParams = {
  activeNav: AppNavId
  workflowStep: WorkflowUiStep
  plan: PlanDto | null
  scanStatus: ScanJobStatusDto | null
  executionSession: ExecutionSessionDto | null
  executionIsActive: boolean
  backendWorkflowPhase: string | undefined
}

export const WORKFLOW_STEPPER_LABELS = [
  'Prepare',
  'Scan',
  'Signals',
  'Plan & review',
  'Execute',
  'Complete',
] as const

function isWorkflowExecutionBusy(p: WorkflowPhaseLabelParams): boolean {
  return (
    p.executionIsActive ||
    p.executionSession?.status === 'pending' ||
    p.executionSession?.status === 'running'
  )
}

/**
 * Index of the active step for {@link WORKFLOW_STEPPER_LABELS}. Returns -1 when the stepper should be hidden
 * (Settings, History, Presets).
 */
export function getWorkflowStepperActiveIndex(p: WorkflowPhaseLabelParams): number {
  if (p.activeNav === 'history' || p.activeNav === 'settings' || p.activeNav === 'presets') {
    return -1
  }

  if (p.activeNav === 'review' && !p.plan) {
    if (p.scanStatus?.status === 'completed') {
      return 2
    }
    return 0
  }

  if (isWorkflowExecutionBusy(p)) {
    return 4
  }
  if (p.workflowStep === 'complete') {
    return 5
  }
  if (p.workflowStep === 'setup') {
    return 0
  }
  if (p.workflowStep === 'scanning') {
    return 1
  }
  if (p.workflowStep === 'results') {
    return 2
  }
  if (p.workflowStep === 'workspace' && p.plan) {
    return 3
  }
  if (p.scanStatus?.status === 'completed' && !p.plan) {
    return 2
  }
  if (p.scanStatus?.status === 'running' || p.scanStatus?.status === 'pending') {
    return 1
  }
  return 0
}

/**
 * User-facing phase text for the shell header. Wording is aligned with docs/USER_GUIDE.md.
 */
export function getWorkflowPhaseLabel(p: WorkflowPhaseLabelParams): string {
  if (p.activeNav === 'history') {
    return 'History & undo'
  }
  if (p.activeNav === 'settings') {
    return 'Settings'
  }
  if (p.activeNav === 'presets') {
    return 'Presets'
  }

  if (p.activeNav === 'review' && !p.plan) {
    return 'Review — unlocks after you build a plan'
  }

  if (isWorkflowExecutionBusy(p)) {
    return 'Executing approved moves'
  }

  if (p.workflowStep === 'complete') {
    return 'Run finished — open History for details'
  }

  if (p.workflowStep === 'setup') {
    return 'Choose sources, run checks & start scan'
  }

  if (p.workflowStep === 'scanning') {
    return 'Scanning folders'
  }

  if (p.workflowStep === 'results') {
    return 'Review scan signals & build plan'
  }

  if (p.workflowStep === 'workspace' && p.plan) {
    return 'Review plan, keepers & execution checks'
  }

  if (p.scanStatus?.status === 'completed' && !p.plan) {
    return 'Scan complete — build a plan'
  }

  if (p.scanStatus?.status === 'running' || p.scanStatus?.status === 'pending') {
    return 'Scanning folders'
  }

  if (p.backendWorkflowPhase) {
    return `Phase: ${p.backendWorkflowPhase}`
  }

  return 'Ready to organize'
}
