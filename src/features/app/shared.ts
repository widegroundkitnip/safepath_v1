import type {
  AiAssistedSuggestionKind,
  AiAssistedSuggestionDto,
  LearnerObservationDto,
  LearnerSuggestionDto,
  MediaDateSource,
  PlanDto,
  PlannedActionDto,
  PresetDefinitionDto,
  ReviewMode,
  SourceProfileKind,
  SyntheticDatasetCategory,
} from '../../types/app'

export function parsePaths(value: string) {
  return value
    .split('\n')
    .map((path) => path.trim())
    .filter(Boolean)
}

export function formatTimestamp(epochMs: number | null) {
  if (epochMs === null) {
    return 'Not recorded'
  }

  return new Date(epochMs).toLocaleString()
}

export function formatMediaDateSource(source: MediaDateSource | null) {
  switch (source) {
    case 'embeddedMetadata':
      return 'Embedded metadata'
    case 'filesystemCreated':
      return 'Filesystem created time'
    case 'filesystemModified':
      return 'Filesystem modified time'
    default:
      return 'Not recorded'
  }
}

export function formatAiAssistedSuggestionKind(kind: AiAssistedSuggestionKind) {
  switch (kind) {
    case 'sourceProfile':
      return 'source profile'
    case 'presetRecommendation':
      return 'preset recommendation'
    case 'protectionRecommendation':
      return 'protection suggestion'
    default:
      return kind
  }
}

export function formatSourceProfileKind(kind: SourceProfileKind | null) {
  switch (kind) {
    case 'workspace':
      return 'workspace-like'
    case 'mediaImport':
      return 'media import'
    case 'downloadsInbox':
      return 'downloads-style inbox'
    case 'archiveBundle':
      return 'archive-heavy'
    default:
      return 'unknown'
  }
}

export function formatReviewMode(mode: ReviewMode) {
  switch (mode) {
    case 'strict':
      return 'conservative review'
    case 'duplicateFirst':
      return 'duplicate-first review'
    case 'standard':
    default:
      return 'standard review'
  }
}

export function formatConfidence(confidence: number) {
  if (!Number.isFinite(confidence)) {
    return 'Unknown confidence'
  }

  return `${Math.round(confidence * 100)}% confidence`
}

export function formatConfidenceBand(confidence: number) {
  if (!Number.isFinite(confidence)) {
    return 'unknown signal'
  }
  if (confidence >= 0.82) {
    return 'strong signal'
  }
  if (confidence >= 0.68) {
    return 'good signal'
  }
  return 'tentative signal'
}

export function describeAiSuggestion(
  suggestion: AiAssistedSuggestionDto,
  presets: PresetDefinitionDto[],
) {
  const presetName = presetNameFromId(suggestion.suggestedPresetId, presets)
  switch (suggestion.kind) {
    case 'sourceProfile':
      return `Safepath sees a ${formatSourceProfileKind(
        suggestion.sourceProfileKind,
      )} scan shape and is keeping this as a reviewable hint.`
    case 'presetRecommendation':
      return `Safepath thinks ${presetName ?? 'this preset'} is a calm starting point for this scan.`
    case 'protectionRecommendation':
      return 'Safepath recommends confirming this boundary before broader organization moves.'
    default:
      return suggestion.summary
  }
}

export function summarizeAiEvidence(suggestion: AiAssistedSuggestionDto) {
  if (suggestion.reasons.length === 0) {
    return null
  }
  return `Evidence: ${joinReadableList(suggestion.reasons)}.`
}

export function aiSuggestionActionLabel(
  suggestion: AiAssistedSuggestionDto,
  presets: PresetDefinitionDto[],
) {
  if (suggestion.suggestedPresetId) {
    return `Use ${presetNameFromId(suggestion.suggestedPresetId, presets) ?? 'suggested preset'} as starting preset`
  }
  if (suggestion.suggestedProtectionKind) {
    switch (suggestion.suggestedProtectionKind) {
      case 'projectRoot':
        return 'Confirm project root'
      case 'parentFolder':
        return 'Confirm parent boundary'
      case 'preserveBoundary':
        return 'Confirm preserve boundary'
      case 'independent':
        return 'Mark as independent'
      case 'userProtected':
      default:
        return 'Keep this protected'
    }
  }
  return 'Apply suggestion'
}

export function describeLearnerSuggestion(
  suggestion: LearnerSuggestionDto,
  presets: PresetDefinitionDto[],
) {
  const presetName = presetNameFromId(suggestion.presetId, presets) ?? suggestion.presetId
  switch (suggestion.kind) {
    case 'duplicateKeeperPolicySuggestion':
      return `${presetName} often needs closer duplicate review before Safepath's keeper suggestion is accepted.`
    case 'ruleReviewTuningSuggestion':
      return `Actions from this rule often end up rejected, so review-first handling may fit ${presetName} better.`
    case 'presetAffinitySuggestion':
      return `For ${formatSourceProfileKind(suggestion.sourceProfileKind)} scans, you usually start with ${presetName}.`
    case 'reviewModePreferenceSuggestion':
      return suggestion.suggestedReviewMode === 'strict'
        ? `Your local review history leans toward conservative review for ${presetName}.`
        : `Your local review history usually stays comfortable with standard review for ${presetName}.`
  }
}

export function learnerSuggestionEvidence(
  suggestion: LearnerSuggestionDto,
  presets: PresetDefinitionDto[],
) {
  const presetName = presetNameFromId(suggestion.presetId, presets) ?? suggestion.presetId
  switch (suggestion.kind) {
    case 'duplicateKeeperPolicySuggestion':
      return `${suggestion.disagreementCount} of ${suggestion.basedOnObservationCount} duplicate groups in ${presetName} were corrected.`
    case 'ruleReviewTuningSuggestion':
      return `${suggestion.rejectionCount} of ${suggestion.basedOnObservationCount} review decisions for rule ${suggestion.ruleId} were rejected.`
    case 'presetAffinitySuggestion':
      return `${suggestion.presetSelectionCount} of ${suggestion.basedOnObservationCount} similar scans used ${presetName}.`
    case 'reviewModePreferenceSuggestion':
      return `${suggestion.rejectionCount + suggestion.disagreementCount} of ${suggestion.basedOnObservationCount} local outcomes leaned conservative.`
    default:
      return null
  }
}

export function learnerSuggestionStatusLabel(suggestion: LearnerSuggestionDto) {
  switch (suggestion.kind) {
    case 'duplicateKeeperPolicySuggestion':
      return `${(suggestion.disagreementRate * 100).toFixed(0)}% corrected`
    case 'ruleReviewTuningSuggestion':
      return `${(suggestion.rejectionRate * 100).toFixed(0)}% rejected`
    case 'presetAffinitySuggestion':
      return `${(suggestion.presetSelectionRate * 100).toFixed(0)}% selected`
    case 'reviewModePreferenceSuggestion':
      return formatReviewMode(suggestion.suggestedReviewMode)
    default:
      return 'review hint'
  }
}

function presetNameFromId(
  presetId: string | null,
  presets: PresetDefinitionDto[],
) {
  if (!presetId) {
    return null
  }
  return presets.find((preset) => preset.presetId === presetId)?.name ?? null
}

function joinReadableList(values: string[]) {
  if (values.length === 1) {
    return values[0]
  }
  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`
  }
  return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return 'Unknown size'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }

  return `${value.toFixed(value >= 100 || index === 0 ? 0 : 1)} ${units[index]}`
}

export type ReviewBucket =
  | 'all'
  | 'blocked'
  | 'protected'
  | 'duplicates'
  | 'unknown'
  | 'approved'
  | 'rejected'
  | 'needsChoice'

export function actionMatchesBucket(action: PlannedActionDto, bucket: ReviewBucket) {
  switch (bucket) {
    case 'blocked':
      return action.reviewState === 'blocked'
    case 'protected':
      return action.explanation.safetyFlags.includes('protected')
    case 'duplicates':
      return action.duplicateGroupId !== null
    case 'unknown':
      return (
        action.explanation.safetyFlags.includes('unknownFile') ||
        action.explanation.safetyFlags.includes('noExtension')
      )
    case 'approved':
      return action.reviewState === 'approved'
    case 'rejected':
      return action.reviewState === 'rejected'
    case 'needsChoice':
      return action.reviewState === 'needsChoice'
    default:
      return true
  }
}

export function countBucket(plan: PlanDto, bucket: ReviewBucket) {
  return plan.actions.filter((action) => actionMatchesBucket(action, bucket)).length
}

export function formatExecutionStrategy(strategy: string) {
  switch (strategy) {
    case 'sameVolumeMove':
      return 'Same-volume move'
    case 'crossVolumeSafeMove':
      return 'Cross-volume safe move'
    case 'copyOnly':
      return 'Copy-only'
    case 'duplicateConsolidate':
      return 'Duplicate consolidate'
    case 'deleteToTrash':
      return 'Safepath trash hold'
    default:
      return strategy
  }
}

export interface DestinationFolderPreview {
  folderPath: string
  relativeFolderPath: string
  itemCount: number
}

export interface DestinationImpactPreview {
  affectedFolderCount: number
  routedActionCount: number
  moveActionCount: number
  reviewCopyActionCount: number
  unresolvedActionCount: number
  folders: DestinationFolderPreview[]
}

export function buildDestinationImpactPreview(plan: PlanDto): DestinationImpactPreview {
  const folderCounts = new Map<string, number>()
  const normalizedRoot = normalizePath(plan.destinationRoot)
  let moveActionCount = 0
  let reviewCopyActionCount = 0

  for (const action of plan.actions) {
    if (!action.destinationPath) {
      continue
    }

    const destinationPath = normalizePath(action.destinationPath)
    const lastSlash = destinationPath.lastIndexOf('/')
    const folderPath = lastSlash > 0 ? destinationPath.slice(0, lastSlash) : destinationPath
    folderCounts.set(folderPath, (folderCounts.get(folderPath) ?? 0) + 1)

    if (action.actionKind === 'move') {
      moveActionCount += 1
    } else if (action.actionKind === 'review') {
      reviewCopyActionCount += 1
    }
  }

  const folders = [...folderCounts.entries()]
    .map(([folderPath, itemCount]) => ({
      folderPath,
      relativeFolderPath: relativeFolderPath(normalizedRoot, folderPath),
      itemCount,
    }))
    .sort((left, right) => right.itemCount - left.itemCount || left.folderPath.localeCompare(right.folderPath))

  return {
    affectedFolderCount: folders.length,
    routedActionCount: moveActionCount + reviewCopyActionCount,
    moveActionCount,
    reviewCopyActionCount,
    unresolvedActionCount: plan.summary.totalActions - (moveActionCount + reviewCopyActionCount),
    folders,
  }
}

function relativeFolderPath(destinationRoot: string, folderPath: string) {
  if (folderPath === destinationRoot) {
    return 'Destination root'
  }

  const rootPrefix = `${destinationRoot}/`
  if (folderPath.startsWith(rootPrefix)) {
    return folderPath.slice(rootPrefix.length)
  }

  return folderPath
}

function normalizePath(path: string) {
  return path.replaceAll('\\', '/').replace(/\/+$/, '')
}

export const SYNTHETIC_CATEGORY_OPTIONS: Array<{
  category: SyntheticDatasetCategory
  label: string
  description: string
}> = [
  { category: 'documents', label: 'Documents', description: 'Notes, docs, text, and pages files.' },
  { category: 'pdfs', label: 'PDFs', description: 'Invoices, manuals, reports, and scans.' },
  {
    category: 'spreadsheets',
    label: 'Spreadsheets',
    description: 'Budgets, CSV exports, and tracking sheets.',
  },
  { category: 'images', label: 'Images', description: 'JPEG, PNG, and edited image exports.' },
  {
    category: 'rawImages',
    label: 'RAW images',
    description: 'Camera originals with larger photo placeholder files.',
  },
  { category: 'videos', label: 'Videos', description: 'Movies, clips, exports, and large media.' },
  { category: 'archives', label: 'Archives', description: 'ZIP, RAR, tar, and backup bundles.' },
  { category: 'audio', label: 'Audio', description: 'Voice memos, music, and long recordings.' },
  {
    category: 'codeProjects',
    label: 'Code/projects',
    description: 'Scripts, configs, manifests, and repo-like files.',
  },
  {
    category: 'mixedClutter',
    label: 'Mixed clutter',
    description: 'Messy leftovers, installers, old exports, and random files.',
  },
]

export function formatSyntheticCategory(category: SyntheticDatasetCategory) {
  return SYNTHETIC_CATEGORY_OPTIONS.find((option) => option.category === category)?.label ?? category
}

export const SYNTHETIC_SIZE_OPTIONS = [
  { label: '250 GB apparent size', bytes: 250 * 1024 ** 3 },
  { label: '1 TB apparent size', bytes: 1024 ** 4 },
  { label: '3 TB apparent size', bytes: 3 * 1024 ** 4 },
  { label: '10 TB apparent size', bytes: 10 * 1024 ** 4 },
]

export const MANIFEST_PAGE_SIZE = 25
export const HISTORY_PAGE_SIZE = 12
export const REVIEW_ACTION_PAGE_SIZE = 8
export const REVIEW_GROUP_PAGE_SIZE = 4
export const HISTORY_SESSION_RECORD_PAGE_SIZE = 8
export const EXECUTION_RECORD_PAGE_SIZE = 6
export const ANALYSIS_DUPLICATE_PAGE_SIZE = 4
export const PROTECTION_PAGE_SIZE = 4

export function paginateItems<T>(items: T[], requestedPage: number, pageSize: number) {
  const totalItems = items.length
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize)
  const page = totalPages === 0 ? 0 : Math.min(Math.max(requestedPage, 0), totalPages - 1)
  const startIndex = page * pageSize
  const pageItems = items.slice(startIndex, startIndex + pageSize)
  const rangeStart = pageItems.length === 0 ? 0 : startIndex + 1
  const rangeEnd = pageItems.length === 0 ? 0 : startIndex + pageItems.length

  return {
    items: pageItems,
    page,
    totalItems,
    totalPages,
    rangeStart,
    rangeEnd,
  }
}

export function isDuplicateKeeperObservation(
  observation: LearnerObservationDto,
): observation is Extract<LearnerObservationDto, { kind: 'duplicateKeeperSelection' }> {
  return observation.kind === 'duplicateKeeperSelection'
}

export function isPlannedActionReviewDecisionObservation(
  observation: LearnerObservationDto,
): observation is Extract<LearnerObservationDto, { kind: 'plannedActionReviewDecision' }> {
  return observation.kind === 'plannedActionReviewDecision'
}

export function isSuggestionFeedbackObservation(
  observation: LearnerObservationDto,
): observation is Extract<LearnerObservationDto, { kind: 'suggestionFeedback' }> {
  return observation.kind === 'suggestionFeedback'
}
