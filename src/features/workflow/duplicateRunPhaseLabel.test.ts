import { describe, expect, it } from 'vitest'

import type { DuplicateRunPhase } from '../../types/app'
import { duplicateRunPhaseLabel } from './duplicateRunPhaseLabel'

const allPhases: DuplicateRunPhase[] = [
  'idle',
  'discovering',
  'analyzingDuplicates',
  'hashingDuplicateContent',
  'sketchingImageSimilarity',
  'finalizingAnalysis',
  'reviewReady',
]

describe('duplicateRunPhaseLabel', () => {
  it('returns null for idle and undefined', () => {
    expect(duplicateRunPhaseLabel(undefined)).toBeNull()
    expect(duplicateRunPhaseLabel('idle')).toBeNull()
  })

  it('maps every non-idle phase to a non-empty string', () => {
    for (const phase of allPhases) {
      if (phase === 'idle') continue
      const label = duplicateRunPhaseLabel(phase)
      expect(label, phase).toBeTruthy()
      expect(label!.length).toBeGreaterThan(2)
    }
  })

  it('uses stable copy for similarity phase', () => {
    expect(duplicateRunPhaseLabel('sketchingImageSimilarity')).toBe('Comparing image similarity (dHash)')
  })
})
