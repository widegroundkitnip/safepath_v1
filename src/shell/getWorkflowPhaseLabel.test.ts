import { describe, expect, it } from 'vitest'

import type { ExecutionSessionDto, PlanDto } from '../types/app'
import { getWorkflowPhaseLabel, getWorkflowStepperActiveIndex } from './getWorkflowPhaseLabel'

const stubPlan = { planId: 'plan-1' } as PlanDto
const stubRunningSession = { status: 'running' } as ExecutionSessionDto

const base = {
  plan: null,
  scanStatus: null,
  executionSession: null,
  executionIsActive: false,
  backendWorkflowPhase: undefined as string | undefined,
}

describe('getWorkflowPhaseLabel', () => {
  it('labels secondary nav areas', () => {
    expect(
      getWorkflowPhaseLabel({
        ...base,
        activeNav: 'history',
        workflowStep: 'setup',
      }),
    ).toBe('History & undo')
    expect(
      getWorkflowPhaseLabel({
        ...base,
        activeNav: 'settings',
        workflowStep: 'workspace',
      }),
    ).toBe('Settings')
    expect(
      getWorkflowPhaseLabel({
        ...base,
        activeNav: 'presets',
        workflowStep: 'results',
      }),
    ).toBe('Presets')
  })

  it('labels review when no plan yet', () => {
    expect(
      getWorkflowPhaseLabel({
        ...base,
        activeNav: 'review',
        workflowStep: 'setup',
      }),
    ).toBe('Review — unlocks after you build a plan')
  })

  it('prefers execution state on Home when a session is running', () => {
    expect(
      getWorkflowPhaseLabel({
        ...base,
        activeNav: 'workflow',
        workflowStep: 'workspace',
        plan: stubPlan,
        executionSession: stubRunningSession,
        executionIsActive: true,
      }),
    ).toBe('Executing approved moves')
  })

  it('maps workflow steps on Home', () => {
    expect(
      getWorkflowPhaseLabel({
        ...base,
        activeNav: 'workflow',
        workflowStep: 'setup',
      }),
    ).toBe('Choose sources, run checks & start scan')
    expect(
      getWorkflowPhaseLabel({
        ...base,
        activeNav: 'workflow',
        workflowStep: 'results',
      }),
    ).toBe('Review scan signals & build plan')
    expect(
      getWorkflowPhaseLabel({
        ...base,
        activeNav: 'workflow',
        workflowStep: 'workspace',
        plan: stubPlan,
      }),
    ).toBe('Review plan, keepers & execution checks')
  })
})

describe('getWorkflowStepperActiveIndex', () => {
  it('returns -1 outside the guided workflow nav', () => {
    expect(
      getWorkflowStepperActiveIndex({
        ...base,
        activeNav: 'history',
        workflowStep: 'workspace',
      }),
    ).toBe(-1)
    expect(
      getWorkflowStepperActiveIndex({
        ...base,
        activeNav: 'settings',
        workflowStep: 'setup',
      }),
    ).toBe(-1)
  })

  it('tracks Home steps', () => {
    expect(
      getWorkflowStepperActiveIndex({
        ...base,
        activeNav: 'workflow',
        workflowStep: 'setup',
      }),
    ).toBe(0)
    expect(
      getWorkflowStepperActiveIndex({
        ...base,
        activeNav: 'workflow',
        workflowStep: 'scanning',
      }),
    ).toBe(1)
    expect(
      getWorkflowStepperActiveIndex({
        ...base,
        activeNav: 'workflow',
        workflowStep: 'results',
      }),
    ).toBe(2)
    expect(
      getWorkflowStepperActiveIndex({
        ...base,
        activeNav: 'workflow',
        workflowStep: 'workspace',
        plan: stubPlan,
      }),
    ).toBe(3)
    expect(
      getWorkflowStepperActiveIndex({
        ...base,
        activeNav: 'workflow',
        workflowStep: 'complete',
      }),
    ).toBe(5)
  })

  it('uses step 4 while executing', () => {
    expect(
      getWorkflowStepperActiveIndex({
        ...base,
        activeNav: 'workflow',
        workflowStep: 'workspace',
        plan: stubPlan,
        executionSession: stubRunningSession,
        executionIsActive: true,
      }),
    ).toBe(4)
  })
})
