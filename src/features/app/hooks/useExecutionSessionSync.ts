import { useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'

import { getAppStatus, getExecutionStatus, getPlan, onExecutionCompleted, onExecutionProgress } from '../../../lib/tauri'
import type { AppStatusDto, ExecutionSessionDto, PlanDto } from '../../../types/app'

/**
 * Subscribes to Tauri execution progress/completed events and polls while a session is pending/running.
 * Keeps event-driven refreshes and polling in one place so the policy stays consistent.
 */
export interface UseExecutionSessionSyncParams {
  executionSession: ExecutionSessionDto | null
  setExecutionSession: Dispatch<SetStateAction<ExecutionSessionDto | null>>
  setIsExecutingPlan: Dispatch<SetStateAction<boolean>>
  setPlan: Dispatch<SetStateAction<PlanDto | null>>
  setStatus: Dispatch<SetStateAction<AppStatusDto | null>>
  setError: Dispatch<SetStateAction<string | null>>
}

export function useExecutionSessionSync(params: UseExecutionSessionSyncParams): void {
  const {
    executionSession,
    setExecutionSession,
    setIsExecutingPlan,
    setPlan,
    setStatus,
    setError,
  } = params

  useEffect(() => {
    if (!executionSession?.sessionId) {
      return
    }

    let active = true
    let removeProgress: (() => void) | undefined
    let removeCompleted: (() => void) | undefined

    async function refreshLiveSession(sessionId: string, syncPlan: boolean) {
      try {
        const nextSession = await getExecutionStatus(sessionId)
        if (!active || !nextSession) {
          return
        }

        setExecutionSession(nextSession)
        const stillRunning =
          nextSession.status === 'pending' || nextSession.status === 'running'
        setIsExecutingPlan(stillRunning)

        if (syncPlan) {
          const nextPlan = await getPlan(nextSession.planId)
          if (active && nextPlan) {
            setPlan(nextPlan)
          }
        }

        if (!stillRunning) {
          setStatus(await getAppStatus())
        }
      } catch (nextError) {
        if (active) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : 'Failed to refresh execution progress.',
          )
        }
      }
    }

    const sessionId = executionSession.sessionId
    onExecutionProgress((payload) => {
      if (active && payload.sessionId === sessionId) {
        void refreshLiveSession(payload.sessionId, true)
      }
    }).then((unlisten) => {
      removeProgress = unlisten
    })

    onExecutionCompleted((payload) => {
      if (active && payload.sessionId === sessionId) {
        void refreshLiveSession(payload.sessionId, true)
      }
    }).then((unlisten) => {
      removeCompleted = unlisten
    })

    return () => {
      active = false
      removeProgress?.()
      removeCompleted?.()
    }
  }, [
    executionSession?.sessionId,
    setError,
    setExecutionSession,
    setIsExecutingPlan,
    setPlan,
    setStatus,
  ])

  useEffect(() => {
    if (
      !executionSession?.sessionId ||
      (executionSession.status !== 'pending' && executionSession.status !== 'running')
    ) {
      return
    }

    const interval = window.setInterval(async () => {
      try {
        const nextSession = await getExecutionStatus(executionSession.sessionId)
        if (!nextSession) {
          return
        }

        setExecutionSession(nextSession)
        const stillRunning =
          nextSession.status === 'pending' || nextSession.status === 'running'
        setIsExecutingPlan(stillRunning)

        if (!stillRunning) {
          const nextPlan = await getPlan(nextSession.planId)
          if (nextPlan) {
            setPlan(nextPlan)
          }
          setStatus(await getAppStatus())
        }
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : 'Failed to poll execution session.',
        )
      }
    }, 900)

    return () => {
      window.clearInterval(interval)
    }
  }, [
    executionSession?.sessionId,
    executionSession?.status,
    setError,
    setExecutionSession,
    setIsExecutingPlan,
    setPlan,
    setStatus,
  ])
}
