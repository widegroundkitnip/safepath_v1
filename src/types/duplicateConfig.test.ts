import { describe, expect, it } from 'vitest'

import {
  defaultDuplicateConfig,
  duplicateConfigFromAdvancedForm,
  duplicateConfigFromSimple,
} from './duplicateConfig'

describe('duplicateConfigFromSimple', () => {
  it('maps exact + strict to exact hash and safe profile', () => {
    const c = duplicateConfigFromSimple(
      'exactDuplicates',
      'strict',
      'oldest',
      false,
      true,
      false,
    )
    expect(c.uiMode).toBe('simple')
    expect(c.matchingStrategy).toBe('exactHash')
    expect(c.profile).toBe('safe')
    expect(c.keeper.preference).toBe('oldest')
    expect(c.filters.includeHidden).toBe(false)
  })

  it('raises min size when ignoring small files', () => {
    const c = duplicateConfigFromSimple(
      'exactDuplicates',
      'balanced',
      'newest',
      true,
      true,
      false,
    )
    expect(c.filters.minSizeBytes).toBe(4096)
  })

  it('similar-files mode disables auto keeper and enables images module', () => {
    const c = duplicateConfigFromSimple(
      'similarFiles',
      'balanced',
      'newest',
      false,
      true,
      false,
    )
    expect(c.matchingStrategy).toBe('hybrid')
    expect(c.mediaModules.imagesEnabled).toBe(true)
    expect(c.keeper.allowAutoKeeper).toBe(false)
  })
})

describe('duplicateConfigFromAdvancedForm', () => {
  it('marks advanced + custom profile and applies toggles', () => {
    const c = duplicateConfigFromAdvancedForm({
      matchingStrategy: 'exactHash',
      keeperPreference: 'shortestPath',
      includeHidden: false,
      ignoreSystemJunk: false,
      groupByParentFolder: true,
      scope: 'perSourceRoot',
      imagesModule: true,
      safetyTier: 'reversible',
      maxFilesForSimilarity: 100,
      maxPairwiseComparisons: 1000,
      analysisTimeoutMs: 5000,
    })
    expect(c.uiMode).toBe('advanced')
    expect(c.profile).toBe('custom')
    expect(c.matchingStrategy).toBe('exactHash')
    expect(c.keeper.preference).toBe('shortestPath')
    expect(c.filters.includeHidden).toBe(false)
    expect(c.filters.ignoreSystemJunk).toBe(false)
    expect(c.filters.groupByParentFolder).toBe(true)
    expect(c.grouping.scope).toBe('perSourceRoot')
    expect(c.mediaModules.imagesEnabled).toBe(true)
    expect(c.execution.safetyTier).toBe('reversible')
    expect(c.keeper.allowAutoKeeper).toBe(false)
    expect(c.limits.maxFilesForSimilarity).toBe(100)
    expect(c.limits.maxPairwiseComparisons).toBe(1000)
    expect(c.limits.analysisTimeoutMs).toBe(5000)
  })

  it('safeHold tier allows auto keeper like default simple path', () => {
    const c = duplicateConfigFromAdvancedForm({
      matchingStrategy: defaultDuplicateConfig().matchingStrategy,
      keeperPreference: 'newest',
      includeHidden: true,
      ignoreSystemJunk: true,
      groupByParentFolder: false,
      scope: 'external',
      imagesModule: false,
      safetyTier: 'safeHold',
      maxFilesForSimilarity: 2000,
      maxPairwiseComparisons: 20000,
      analysisTimeoutMs: null,
    })
    expect(c.keeper.allowAutoKeeper).toBe(true)
  })
})
