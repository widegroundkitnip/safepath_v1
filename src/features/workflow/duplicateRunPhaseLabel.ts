import type { DuplicateRunPhase } from '../../types/app'

/** User-visible hint for duplicate-detection sub-phases during scan / expensive analysis. */
export function duplicateRunPhaseLabel(phase: DuplicateRunPhase | undefined): string | null {
  if (!phase || phase === 'idle') {
    return null
  }
  const labels: Partial<Record<DuplicateRunPhase, string>> = {
    discovering: 'Discovering files',
    analyzingDuplicates: 'Analyzing duplicate candidates',
    hashingDuplicateContent: 'Hashing duplicate content',
    sketchingImageSimilarity: 'Comparing image similarity (dHash)',
    finalizingAnalysis: 'Finalizing analysis',
    reviewReady: 'Review ready',
  }
  return labels[phase] ?? null
}
