import type {
  AiAssistedSuggestionKind,
  LearnerObservationDto,
  MediaDateSource,
  PlanDto,
  PlannedActionDto,
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
