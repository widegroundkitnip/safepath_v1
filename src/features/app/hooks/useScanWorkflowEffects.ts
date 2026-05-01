import { useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'

import {
  getAnalysisSummary,
  getAppStatus,
  getManifestPage,
  getScanStatus,
  onAnalysisProgress,
  onDuplicateRunProgress,
  onJobFailed,
  onPlanReady,
  onScanPageReady,
  onScanProgress,
  onScanStarted,
} from '../../../lib/tauri'
import type {
  AnalysisSummaryDto,
  AppStatusDto,
  ManifestPageDto,
  ScanJobStatusDto,
  ScanProgressEvent,
} from '../../../types/app'
import { MANIFEST_PAGE_SIZE } from '../shared'

export interface UseScanWorkflowEffectsParams {
  scanStatus: ScanJobStatusDto | null
  setScanStatus: Dispatch<SetStateAction<ScanJobStatusDto | null>>
  setScanProgress: Dispatch<SetStateAction<ScanProgressEvent | null>>
  setError: Dispatch<SetStateAction<string | null>>
  manifestPageIndex: number
  setManifestPage: Dispatch<SetStateAction<ManifestPageDto | null>>
  setManifestPageIndex: Dispatch<SetStateAction<number>>
  setAnalysisSummary: Dispatch<SetStateAction<AnalysisSummaryDto | null>>
  setStatus: Dispatch<SetStateAction<AppStatusDto | null>>
  activeAnalysisJobId: string | null
  setActiveAnalysisJobId: Dispatch<SetStateAction<string | null>>
  setIsRunningExpensiveAnalysis: Dispatch<SetStateAction<boolean>>
}

export function useScanWorkflowEffects(params: UseScanWorkflowEffectsParams): void {
  const {
    scanStatus,
    setScanStatus,
    setScanProgress,
    setError,
    manifestPageIndex,
    setManifestPage,
    setManifestPageIndex,
    setAnalysisSummary,
    setStatus,
    activeAnalysisJobId,
    setActiveAnalysisJobId,
    setIsRunningExpensiveAnalysis,
  } = params

  useEffect(() => {
    if (!scanStatus?.jobId) {
      return
    }

    let active = true
    let removeListener: (() => void) | undefined

    onScanProgress((payload) => {
      if (active && payload.jobId === scanStatus.jobId) {
        setScanProgress(payload)
      }
    }).then((unlisten) => {
      removeListener = unlisten
    })

    return () => {
      active = false
      removeListener?.()
    }
  }, [scanStatus?.jobId, setScanProgress])

  useEffect(() => {
    let active = true
    let removeScanStarted: (() => void) | undefined
    let removeScanPageReady: (() => void) | undefined
    let removeDuplicateRun: (() => void) | undefined
    let removeAnalysisProgress: (() => void) | undefined
    let removePlanReady: (() => void) | undefined
    let removeJobFailed: (() => void) | undefined

    onDuplicateRunProgress((payload) => {
      if (!active || payload.jobId !== scanStatus?.jobId) {
        return
      }
      setScanStatus((prev) =>
        prev && prev.jobId === payload.jobId
          ? { ...prev, duplicateRunPhase: payload.phase }
          : prev,
      )
    }).then((unlisten) => {
      removeDuplicateRun = unlisten
    })

    onScanStarted((payload) => {
      if (!active || payload.jobId !== scanStatus?.jobId) {
        return
      }
      setError(null)
    }).then((unlisten) => {
      removeScanStarted = unlisten
    })

    onScanPageReady((payload) => {
      if (!active || payload.jobId !== scanStatus?.jobId || payload.page !== manifestPageIndex) {
        return
      }

      void getManifestPage(payload.jobId, payload.page, payload.pageSize)
        .then((page) => {
          if (active) {
            setManifestPage(page)
          }
        })
        .catch((nextError) => {
          if (active) {
            setError(nextError instanceof Error ? nextError.message : 'Failed to load manifest page.')
          }
        })
    }).then((unlisten) => {
      removeScanPageReady = unlisten
    })

    onAnalysisProgress((payload) => {
      if (!active || payload.jobId !== activeAnalysisJobId || payload.stage !== 'completed') {
        return
      }

      setIsRunningExpensiveAnalysis(false)
      setActiveAnalysisJobId(null)
      void getAnalysisSummary(payload.jobId)
        .then((summary) => {
          if (active && summary) {
            setAnalysisSummary(summary)
          }
        })
        .catch((nextError) => {
          if (active) {
            setError(
              nextError instanceof Error
                ? nextError.message
                : 'Failed to refresh analysis summary.',
            )
          }
        })
      void getAppStatus()
        .then((nextStatus) => {
          if (active) {
            setStatus(nextStatus)
          }
        })
        .catch(() => {})
    }).then((unlisten) => {
      removeAnalysisProgress = unlisten
    })

    onPlanReady((payload) => {
      if (!active || payload.jobId !== scanStatus?.jobId) {
        return
      }

      void getAppStatus()
        .then((nextStatus) => {
          if (active) {
            setStatus(nextStatus)
          }
        })
        .catch(() => {})
    }).then((unlisten) => {
      removePlanReady = unlisten
    })

    onJobFailed((payload) => {
      if (!active) {
        return
      }

      if (payload.jobId === activeAnalysisJobId) {
        setIsRunningExpensiveAnalysis(false)
        setActiveAnalysisJobId(null)
      }
      setError(payload.message)
      void getAppStatus()
        .then((nextStatus) => {
          if (active) {
            setStatus(nextStatus)
          }
        })
        .catch(() => {})
    }).then((unlisten) => {
      removeJobFailed = unlisten
    })

    return () => {
      active = false
      removeScanStarted?.()
      removeScanPageReady?.()
      removeDuplicateRun?.()
      removeAnalysisProgress?.()
      removePlanReady?.()
      removeJobFailed?.()
    }
  }, [
    activeAnalysisJobId,
    manifestPageIndex,
    scanStatus?.jobId,
    setActiveAnalysisJobId,
    setAnalysisSummary,
    setError,
    setIsRunningExpensiveAnalysis,
    setManifestPage,
    setScanStatus,
    setStatus,
  ])

  useEffect(() => {
    if (!scanStatus?.jobId) {
      return
    }

    if (scanStatus.status !== 'running' && scanStatus.status !== 'pending') {
      return
    }

    const interval = window.setInterval(async () => {
      try {
        const nextStatus = await getScanStatus(scanStatus.jobId)
        if (nextStatus) {
          setScanStatus(nextStatus)
          setStatus(await getAppStatus())
        }
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'Failed to poll scan status.')
      }
    }, 700)

    return () => {
      window.clearInterval(interval)
    }
  }, [scanStatus, setError, setScanStatus, setStatus])

  useEffect(() => {
    setManifestPageIndex(0)
  }, [scanStatus?.jobId, setManifestPageIndex])

  useEffect(() => {
    if (!scanStatus?.jobId) {
      return
    }

    if (scanStatus.discoveredEntries === 0) {
      setManifestPage(null)
      return
    }

    getManifestPage(scanStatus.jobId, manifestPageIndex, MANIFEST_PAGE_SIZE)
      .then((page) => {
        setManifestPage(page)
      })
      .catch((nextError) => {
        setError(nextError instanceof Error ? nextError.message : 'Failed to load manifest page.')
      })
  }, [manifestPageIndex, scanStatus?.discoveredEntries, scanStatus?.jobId, setError, setManifestPage])

  useEffect(() => {
    if (!scanStatus?.jobId) {
      return
    }

    getAnalysisSummary(scanStatus.jobId)
      .then((summary) => {
        setAnalysisSummary(summary)
      })
      .catch((nextError) => {
        setError(nextError instanceof Error ? nextError.message : 'Failed to load analysis summary.')
      })
  }, [
    scanStatus?.discoveredEntries,
    scanStatus?.jobId,
    scanStatus?.status,
    setAnalysisSummary,
    setError,
  ])
}
