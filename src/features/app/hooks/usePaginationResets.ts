import { useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'

import type { AnalysisSummaryDto, ExecutionSessionDto } from '../../../types/app'

export interface UsePaginationResetsParams {
  selectedHistorySession: ExecutionSessionDto | null
  setHistorySessionRecordPageIndex: Dispatch<SetStateAction<number>>
  executionSession: ExecutionSessionDto | null
  setExecutionRecordPageIndex: Dispatch<SetStateAction<number>>
  analysisSummary: AnalysisSummaryDto | null
  setAnalysisDuplicatePageIndex: Dispatch<SetStateAction<number>>
  setProtectionPageIndex: Dispatch<SetStateAction<number>>
}

export function usePaginationResets(params: UsePaginationResetsParams): void {
  const {
    selectedHistorySession,
    setHistorySessionRecordPageIndex,
    executionSession,
    setExecutionRecordPageIndex,
    analysisSummary,
    setAnalysisDuplicatePageIndex,
    setProtectionPageIndex,
  } = params

  useEffect(() => {
    setHistorySessionRecordPageIndex(0)
  }, [selectedHistorySession?.sessionId, setHistorySessionRecordPageIndex])

  useEffect(() => {
    setExecutionRecordPageIndex(0)
  }, [executionSession?.sessionId, setExecutionRecordPageIndex])

  useEffect(() => {
    setAnalysisDuplicatePageIndex(0)
    setProtectionPageIndex(0)
  }, [analysisSummary?.jobId, setAnalysisDuplicatePageIndex, setProtectionPageIndex])
}
