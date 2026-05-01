import { useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'

import {
  getAiEvaluationSnapshot,
  getAppStatus,
  getLearnerDraftPreviews,
  getLearnerObservations,
  getLearnerSuggestions,
  getPresets,
  isDesktopRuntimeAvailable,
} from '../../../lib/tauri'
import type {
  AiEvaluationSnapshotDto,
  AppStatusDto,
  LearnerDraftPreviewDto,
  LearnerObservationDto,
  LearnerSuggestionDto,
  PresetDefinitionDto,
} from '../../../types/app'

export interface UseAppBootstrapParams {
  setStatus: Dispatch<SetStateAction<AppStatusDto | null>>
  setError: Dispatch<SetStateAction<string | null>>
  setSourceInput: Dispatch<SetStateAction<string>>
  setDestinationInput: Dispatch<SetStateAction<string>>
  setPresets: Dispatch<SetStateAction<PresetDefinitionDto[]>>
  setSelectedPresetId: Dispatch<SetStateAction<string>>
  setLearnerObservations: Dispatch<SetStateAction<LearnerObservationDto[]>>
  setLearnerSuggestions: Dispatch<SetStateAction<LearnerSuggestionDto[]>>
  setLearnerDraftPreviews: Dispatch<SetStateAction<LearnerDraftPreviewDto[]>>
  setAiEvaluationSnapshot: Dispatch<SetStateAction<AiEvaluationSnapshotDto | null>>
}

export function useAppBootstrap(params: UseAppBootstrapParams): void {
  const {
    setStatus,
    setError,
    setSourceInput,
    setDestinationInput,
    setPresets,
    setSelectedPresetId,
    setLearnerObservations,
    setLearnerSuggestions,
    setLearnerDraftPreviews,
    setAiEvaluationSnapshot,
  } = params

  useEffect(() => {
    let active = true

    getAppStatus()
      .then((nextStatus) => {
        if (active) {
          setStatus(nextStatus)
          setSourceInput(nextStatus.sourcePaths.join('\n'))
          setDestinationInput(nextStatus.destinationPaths[0] ?? '')
        }
      })
      .catch((nextError) => {
        if (active) {
          setError(nextError instanceof Error ? nextError.message : 'Unknown error')
        }
      })

    if (isDesktopRuntimeAvailable()) {
      getPresets()
        .then((nextPresets) => {
          if (active) {
            setPresets(nextPresets)
            setSelectedPresetId((current) => current || nextPresets[0]?.presetId || '')
          }
        })
        .catch((nextError) => {
          if (active) {
            setError(nextError instanceof Error ? nextError.message : 'Failed to load presets.')
          }
        })

      Promise.all([
        getLearnerObservations(16),
        getLearnerSuggestions(200, 8),
        getLearnerDraftPreviews(200, 8),
        getAiEvaluationSnapshot(5000),
      ])
        .then(([observations, suggestions, drafts, evaluationSnapshot]) => {
          if (active) {
            setLearnerObservations(observations)
            setLearnerSuggestions(suggestions)
            setLearnerDraftPreviews(drafts)
            setAiEvaluationSnapshot(evaluationSnapshot)
          }
        })
        .catch((nextError) => {
          if (active) {
            setError(
              nextError instanceof Error ? nextError.message : 'Failed to load learner insights.',
            )
          }
        })
    }

    return () => {
      active = false
    }
  }, [
    setAiEvaluationSnapshot,
    setDestinationInput,
    setError,
    setLearnerDraftPreviews,
    setLearnerObservations,
    setLearnerSuggestions,
    setPresets,
    setSelectedPresetId,
    setSourceInput,
    setStatus,
  ])
}
