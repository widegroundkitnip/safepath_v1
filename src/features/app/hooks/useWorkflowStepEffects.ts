import { useEffect, type MutableRefObject } from 'react'
import type { Dispatch, SetStateAction } from 'react'

import type { AppNavId } from '../../../shell/AppLayout'
import type { ExecutionSessionDto, PlanDto, ScanJobStatusDto } from '../../../types/app'

export interface UseWorkflowStepEffectsParams {
  scanStatus: ScanJobStatusDto | null
  workflowStep: 'setup' | 'scanning' | 'results' | 'workspace' | 'complete'
  setWorkflowStep: Dispatch<
    SetStateAction<'setup' | 'scanning' | 'results' | 'workspace' | 'complete'>
  >
  plan: PlanDto | null
  activeNav: AppNavId
  isExecutingPlan: boolean
  executionSession: ExecutionSessionDto | null
  wasExecutingPlanRef: MutableRefObject<boolean>
}

export function useWorkflowStepEffects(params: UseWorkflowStepEffectsParams): void {
  const {
    scanStatus,
    workflowStep,
    setWorkflowStep,
    plan,
    activeNav,
    isExecutingPlan,
    executionSession,
    wasExecutingPlanRef,
  } = params

  useEffect(() => {
    const s = scanStatus?.status
    if (s === 'cancelled' || s === 'failed') {
      setWorkflowStep('setup')
      return
    }
    if (s === 'completed' && workflowStep === 'scanning') {
      setWorkflowStep('results')
    }
  }, [scanStatus?.status, setWorkflowStep, workflowStep])

  useEffect(() => {
    if (!plan && scanStatus?.status === 'completed' && workflowStep === 'workspace') {
      setWorkflowStep('results')
    }
  }, [plan, scanStatus?.status, setWorkflowStep, workflowStep])

  useEffect(() => {
    if (activeNav !== 'workflow' && activeNav !== 'review') {
      return
    }
    const s = scanStatus?.status
    if (s === 'running' || s === 'pending') {
      setWorkflowStep('scanning')
    }
  }, [activeNav, scanStatus?.status, setWorkflowStep])

  useEffect(() => {
    if (isExecutingPlan) {
      wasExecutingPlanRef.current = true
      return
    }
    if (
      wasExecutingPlanRef.current &&
      executionSession &&
      executionSession.status !== 'pending' &&
      executionSession.status !== 'running'
    ) {
      wasExecutingPlanRef.current = false
      setWorkflowStep('complete')
    }
  }, [executionSession, isExecutingPlan, setWorkflowStep, wasExecutingPlanRef])
}
