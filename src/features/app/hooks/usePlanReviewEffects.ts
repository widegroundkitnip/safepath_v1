import { useEffect, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'

import { getDuplicateReviewGroupDetails } from '../../../lib/tauri'
import type {
  DuplicateReviewGroupDetailsDto,
  PlanDto,
  PlanDuplicateGroupDto,
  PlannedActionDto,
  PreflightIssueDto,
} from '../../../types/app'
import type { ReviewBucket } from '../shared'

export interface UsePlanReviewEffectsParams {
  plan: PlanDto | null
  filteredPlanActions: PlannedActionDto[]
  selectedActionId: string | null
  setSelectedActionId: Dispatch<SetStateAction<string | null>>
  setExecutionPreflightIssues: Dispatch<SetStateAction<PreflightIssueDto[]>>
  setSelectedDuplicateGroupId: Dispatch<SetStateAction<string | null>>
  setDuplicateGroupDetails: Dispatch<SetStateAction<DuplicateReviewGroupDetailsDto | null>>
  setReviewPageIndex: Dispatch<SetStateAction<number>>
  setReviewGroupPageIndex: Dispatch<SetStateAction<number>>
  setShowAllDestinationPreviewFolders: Dispatch<SetStateAction<boolean>>
  reviewGroupPageItems: PlanDuplicateGroupDto[]
  selectedDuplicateGroupId: string | null
  selectedDuplicateGroup: PlanDuplicateGroupDto | null
  setIsLoadingDuplicateGroupDetails: Dispatch<SetStateAction<boolean>>
  setError: Dispatch<SetStateAction<string | null>>
  approvedActionCount: number
  executionIsActive: boolean
  loadExecutionPreflight: (planId: string, surfaceErrors?: boolean) => Promise<unknown>
  activeReviewBucket: ReviewBucket
  uiMode: 'simple' | 'advanced'
  setActiveReviewBucket: Dispatch<SetStateAction<ReviewBucket>>
}

export function usePlanReviewEffects(params: UsePlanReviewEffectsParams): void {
  const {
    plan,
    filteredPlanActions,
    selectedActionId,
    setSelectedActionId,
    setExecutionPreflightIssues,
    setSelectedDuplicateGroupId,
    setDuplicateGroupDetails,
    setReviewPageIndex,
    setReviewGroupPageIndex,
    setShowAllDestinationPreviewFolders,
    reviewGroupPageItems,
    selectedDuplicateGroupId,
    selectedDuplicateGroup,
    setIsLoadingDuplicateGroupDetails,
    setError,
    approvedActionCount,
    executionIsActive,
    loadExecutionPreflight,
    activeReviewBucket,
    uiMode,
    setActiveReviewBucket,
  } = params

  const loadPreflightRef = useRef(loadExecutionPreflight)
  useEffect(() => {
    loadPreflightRef.current = loadExecutionPreflight
  }, [loadExecutionPreflight])

  useEffect(() => {
    if (!plan) {
      setSelectedActionId(null)
      setExecutionPreflightIssues([])
      setSelectedDuplicateGroupId(null)
      setDuplicateGroupDetails(null)
      return
    }

    if (!selectedActionId || !filteredPlanActions.some((action) => action.actionId === selectedActionId)) {
      setSelectedActionId(filteredPlanActions[0]?.actionId ?? null)
    }
  }, [
    filteredPlanActions,
    plan,
    selectedActionId,
    setDuplicateGroupDetails,
    setExecutionPreflightIssues,
    setSelectedActionId,
    setSelectedDuplicateGroupId,
  ])

  useEffect(() => {
    setReviewPageIndex(0)
    setReviewGroupPageIndex(0)
    setShowAllDestinationPreviewFolders(false)
  }, [plan?.planId, setReviewGroupPageIndex, setReviewPageIndex, setShowAllDestinationPreviewFolders])

  useEffect(() => {
    if (reviewGroupPageItems.length === 0) {
      setSelectedDuplicateGroupId(null)
      setDuplicateGroupDetails(null)
      return
    }

    if (
      !selectedDuplicateGroupId ||
      !reviewGroupPageItems.some((group) => group.groupId === selectedDuplicateGroupId)
    ) {
      setSelectedDuplicateGroupId(reviewGroupPageItems[0]?.groupId ?? null)
    }
  }, [
    reviewGroupPageItems,
    selectedDuplicateGroupId,
    setDuplicateGroupDetails,
    setSelectedDuplicateGroupId,
  ])

  useEffect(() => {
    if (!plan?.planId || !selectedDuplicateGroup?.groupId) {
      setDuplicateGroupDetails(null)
      return
    }

    let active = true
    setIsLoadingDuplicateGroupDetails(true)
    getDuplicateReviewGroupDetails(plan.planId, selectedDuplicateGroup.groupId)
      .then((details) => {
        if (active) {
          setDuplicateGroupDetails(details)
        }
      })
      .catch((nextError) => {
        if (active) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : 'Failed to load duplicate review details.',
          )
        }
      })
      .finally(() => {
        if (active) {
          setIsLoadingDuplicateGroupDetails(false)
        }
      })

    return () => {
      active = false
    }
  }, [
    plan?.planId,
    selectedDuplicateGroup?.groupId,
    selectedDuplicateGroup?.recommendedKeeperEntryId,
    selectedDuplicateGroup?.selectedKeeperEntryId,
    setDuplicateGroupDetails,
    setError,
    setIsLoadingDuplicateGroupDetails,
  ])

  useEffect(() => {
    if (!plan?.planId || executionIsActive) {
      return
    }

    if (approvedActionCount === 0) {
      setExecutionPreflightIssues([])
      return
    }

    void loadPreflightRef.current(plan.planId, false)
  }, [approvedActionCount, executionIsActive, plan, setExecutionPreflightIssues])

  useEffect(() => {
    setReviewPageIndex(0)
  }, [activeReviewBucket, setReviewPageIndex])

  useEffect(() => {
    if (uiMode !== 'simple') {
      return
    }
    const allowed: ReviewBucket[] = ['all', 'duplicates', 'needsChoice', 'approved']
    if (!allowed.includes(activeReviewBucket)) {
      setActiveReviewBucket('all')
    }
  }, [activeReviewBucket, setActiveReviewBucket, uiMode])
}
