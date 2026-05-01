/** Mirrors `safepath_core::duplicate_config` (camelCase JSON). */

export const DUPLICATE_CONFIG_SCHEMA_VERSION = 1

export type DuplicateUiMode = 'simple' | 'advanced'
export type DuplicateProfile = 'custom' | 'safe' | 'balanced' | 'flexible'

export type MatchingStrategy =
  | 'exactHash'
  | 'fastNameSize'
  | 'hybrid'
  | 'similar'
  | 'metadataOnly'

export type ExecutionSafetyTier = 'safeHold' | 'reversible' | 'destructive'

export interface MatchingConditions {
  requireSameSize: boolean
  requireSameNormalizedNameForHeuristic: boolean
  timeWindowToleranceMs: number | null
  structureDepthMax: number | null
}

export interface ScopeFilters {
  minSizeBytes: number
  maxSizeBytes: number
  includeHidden: boolean
  ignoreSystemJunk: boolean
  groupByParentFolder: boolean
  ignoreGlobs: string[]
}

export interface MediaModuleRules {
  imagesEnabled: boolean
  audioEnabled: boolean
  videoEnabled: boolean
  documentsEnabled: boolean
}

export type DuplicateGroupScope = 'external' | 'perSourceRoot'

export interface GroupingPolicy {
  scope: DuplicateGroupScope
  treatFolderDuplicatesSeparately: boolean
}

export type KeeperPreference =
  | 'newest'
  | 'oldest'
  | 'preferOriginalFolder'
  | 'preferProtected'
  | 'shortestPath'
  | 'largestFile'

export interface KeeperStrategySettings {
  preference: KeeperPreference
  allowAutoKeeper: boolean
}

export interface DuplicateExecutionPolicy {
  safetyTier: ExecutionSafetyTier
  requireDryRunAcknowledgment: boolean
}

export interface AnalysisLimits {
  maxFilesForSimilarity: number
  maxPairwiseComparisons: number
  /** Milliseconds; null or 0 means no limit. Enforced best-effort during expensive analysis. */
  analysisTimeoutMs: number | null
}

export interface DuplicateConfig {
  version: number
  uiMode: DuplicateUiMode
  profile: DuplicateProfile
  matchingStrategy: MatchingStrategy
  conditions: MatchingConditions
  filters: ScopeFilters
  mediaModules: MediaModuleRules
  grouping: GroupingPolicy
  keeper: KeeperStrategySettings
  execution: DuplicateExecutionPolicy
  limits: AnalysisLimits
}

export type DuplicateMatchBasis =
  | 'exactContentHash'
  | 'nameSizeHeuristic'
  | 'hybridHashConfirmed'
  | 'similarity'
  | 'metadata'

export interface MemberContentHash {
  entryId: string
  hashHex: string
}

export interface DuplicateEvidence {
  primaryContentHash: string | null
  memberHashes: MemberContentHash[]
  sizeBytes: number | null
  normalizedName: string | null
  statFingerprintEpochMs: number | null
}

export interface DuplicateMatchExplanation {
  strategyUsed: string
  matchedConditions: string[]
  confidenceReasons: string[]
  humanSummary: string
}

export type SimpleDuplicateMode = 'exactDuplicates' | 'similarFiles' | 'mediaDuplicates'
export type SimpleStrictness = 'strict' | 'balanced' | 'flexible'

export function defaultDuplicateConfig(): DuplicateConfig {
  return {
    version: DUPLICATE_CONFIG_SCHEMA_VERSION,
    uiMode: 'simple',
    profile: 'balanced',
    matchingStrategy: 'hybrid',
    conditions: {
      requireSameSize: true,
      requireSameNormalizedNameForHeuristic: true,
      timeWindowToleranceMs: null,
      structureDepthMax: null,
    },
    filters: {
      minSizeBytes: 0,
      maxSizeBytes: Number.MAX_SAFE_INTEGER,
      includeHidden: true,
      ignoreSystemJunk: true,
      groupByParentFolder: false,
      ignoreGlobs: [],
    },
    mediaModules: {
      imagesEnabled: false,
      audioEnabled: false,
      videoEnabled: false,
      documentsEnabled: false,
    },
    grouping: {
      scope: 'external',
      treatFolderDuplicatesSeparately: false,
    },
    keeper: {
      preference: 'newest',
      allowAutoKeeper: true,
    },
    execution: {
      safetyTier: 'safeHold',
      requireDryRunAcknowledgment: true,
    },
    limits: {
      maxFilesForSimilarity: 5000,
      maxPairwiseComparisons: 50000,
      analysisTimeoutMs: null,
    },
  }
}

/** Simple-mode controls → full config (aligned with Rust `duplicate_config_from_simple`). */
export function duplicateConfigFromSimple(
  mode: SimpleDuplicateMode,
  strictness: SimpleStrictness,
  keeper: KeeperPreference,
  ignoreSmallFiles: boolean,
  ignoreHiddenSystem: boolean,
  groupByFolder: boolean,
): DuplicateConfig {
  const config = defaultDuplicateConfig()
  config.uiMode = 'simple'
  config.execution.safetyTier = 'safeHold'
  config.execution.requireDryRunAcknowledgment = true
  config.keeper.preference = keeper
  config.filters.groupByParentFolder = groupByFolder
  config.filters.ignoreSystemJunk = ignoreHiddenSystem
  if (ignoreSmallFiles) {
    config.filters.minSizeBytes = 4096
  }

  switch (mode) {
    case 'exactDuplicates':
      config.profile = strictness === 'strict' ? 'safe' : 'balanced'
      config.matchingStrategy = 'exactHash'
      break
    case 'similarFiles':
      config.profile = 'flexible'
      config.matchingStrategy =
        strictness === 'strict' || strictness === 'balanced' ? 'hybrid' : 'similar'
      config.mediaModules.imagesEnabled = true
      config.keeper.allowAutoKeeper = false
      break
    case 'mediaDuplicates':
      config.profile = 'balanced'
      config.matchingStrategy = 'hybrid'
      config.mediaModules = {
        imagesEnabled: true,
        audioEnabled: true,
        videoEnabled: true,
        documentsEnabled: false,
      }
      break
    default:
      break
  }

  if (strictness === 'strict') {
    config.filters.includeHidden = false
    if (mode === 'exactDuplicates') {
      config.matchingStrategy = 'exactHash'
    }
  } else if (strictness === 'flexible') {
    config.keeper.allowAutoKeeper = false
  }

  return config
}

/** Advanced panel: start from default and override strategy + key toggles. */
export function duplicateConfigFromAdvancedForm(input: {
  matchingStrategy: MatchingStrategy
  keeperPreference: KeeperPreference
  includeHidden: boolean
  ignoreSystemJunk: boolean
  groupByParentFolder: boolean
  scope: DuplicateGroupScope
  imagesModule: boolean
  safetyTier: ExecutionSafetyTier
  maxFilesForSimilarity: number
  maxPairwiseComparisons: number
  analysisTimeoutMs: number | null
}): DuplicateConfig {
  const config = defaultDuplicateConfig()
  config.uiMode = 'advanced'
  config.profile = 'custom'
  config.matchingStrategy = input.matchingStrategy
  config.keeper.preference = input.keeperPreference
  config.filters.includeHidden = input.includeHidden
  config.filters.ignoreSystemJunk = input.ignoreSystemJunk
  config.filters.groupByParentFolder = input.groupByParentFolder
  config.grouping.scope = input.scope
  config.mediaModules.imagesEnabled = input.imagesModule
  config.execution.safetyTier = input.safetyTier
  config.keeper.allowAutoKeeper = input.safetyTier === 'safeHold'
  config.limits.maxFilesForSimilarity = Math.max(0, Math.floor(input.maxFilesForSimilarity))
  config.limits.maxPairwiseComparisons = Math.max(0, Math.floor(input.maxPairwiseComparisons))
  config.limits.analysisTimeoutMs = input.analysisTimeoutMs
  return config
}
