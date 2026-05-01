import { useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'

import { getExecutionStatus, getHistoryPage } from '../../../lib/tauri'
import type { AppNavId } from '../../../shell/AppLayout'
import type { ExecutionSessionDto, HistoryPageDto } from '../../../types/app'
import { HISTORY_PAGE_SIZE } from '../shared'

export interface UseHistoryTabEffectsParams {
  activeNav: AppNavId
  historyPageIndex: number
  setIsLoadingHistory: Dispatch<SetStateAction<boolean>>
  setHistoryPage: Dispatch<SetStateAction<HistoryPageDto | null>>
  setError: Dispatch<SetStateAction<string | null>>
  historyPage: HistoryPageDto | null
  selectedHistoryRecordId: string | null
  setSelectedHistoryRecordId: Dispatch<SetStateAction<string | null>>
  setSelectedHistorySessionId: Dispatch<SetStateAction<string | null>>
  selectedHistorySessionId: string | null
  setSelectedHistorySession: Dispatch<SetStateAction<ExecutionSessionDto | null>>
}

export function useHistoryTabEffects(params: UseHistoryTabEffectsParams): void {
  const {
    activeNav,
    historyPageIndex,
    setIsLoadingHistory,
    setHistoryPage,
    setError,
    historyPage,
    selectedHistoryRecordId,
    setSelectedHistoryRecordId,
    setSelectedHistorySessionId,
    selectedHistorySessionId,
    setSelectedHistorySession,
  } = params

  useEffect(() => {
    if (activeNav !== 'history') {
      return
    }

    let active = true
    setIsLoadingHistory(true)

    getHistoryPage(historyPageIndex, HISTORY_PAGE_SIZE)
      .then((page) => {
        if (active) {
          setHistoryPage(page)
        }
      })
      .catch((nextError) => {
        if (active) {
          setError(nextError instanceof Error ? nextError.message : 'Failed to load history page.')
        }
      })
      .finally(() => {
        if (active) {
          setIsLoadingHistory(false)
        }
      })

    return () => {
      active = false
    }
  }, [activeNav, historyPageIndex, setError, setHistoryPage, setIsLoadingHistory])

  useEffect(() => {
    if (!historyPage) {
      setSelectedHistoryRecordId(null)
      setSelectedHistorySessionId(null)
      return
    }

    if (
      !selectedHistoryRecordId ||
      !historyPage.entries.some((entry) => entry.recordId === selectedHistoryRecordId)
    ) {
      const firstEntry = historyPage.entries[0] ?? null
      setSelectedHistoryRecordId(firstEntry?.recordId ?? null)
      setSelectedHistorySessionId(firstEntry?.sessionId ?? null)
    }
  }, [
    historyPage,
    selectedHistoryRecordId,
    setSelectedHistoryRecordId,
    setSelectedHistorySessionId,
  ])

  useEffect(() => {
    if (!selectedHistorySessionId || activeNav !== 'history') {
      setSelectedHistorySession(null)
      return
    }

    let active = true
    getExecutionStatus(selectedHistorySessionId)
      .then((session) => {
        if (active) {
          setSelectedHistorySession(session)
        }
      })
      .catch((nextError) => {
        if (active) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : 'Failed to load execution session history.',
          )
        }
      })

    return () => {
      active = false
    }
  }, [activeNav, selectedHistorySessionId, setError, setSelectedHistorySession])
}
