import {
  CHART_REPORT_CATEGORY_KEYS,
  CHART_REPORT_FIELD_KEYS,
  type ChartReportValueKind,
} from '@gekichumai/api-contract'

export { CHART_REPORT_CATEGORY_KEYS, CHART_REPORT_FIELD_KEYS } from '@gekichumai/api-contract'

export const CHART_REPORT_STATES = ['open', 'closed'] as const
export type ChartReportState = (typeof CHART_REPORT_STATES)[number]

/**
 * Stable persistence keys for reportable leaf values. User-facing wording is
 * deliberately owned by the clients, not by these stored identifiers.
 */
export type ChartReportFieldKey = (typeof CHART_REPORT_FIELD_KEYS)[number]

export type ChartReportCategoryKey = (typeof CHART_REPORT_CATEGORY_KEYS)[number]

export const CHART_REPORT_PRODUCTION_CHANNEL = 'production-v1' as const
export const CHART_REPORT_EXPLANATION_MAX_LENGTH = 4_000 as const
export const CHART_REPORT_CLOSE_NOTE_MAX_LENGTH = 1_000 as const
export const CHART_REPORT_SOURCE_URL_MAX_COUNT = 5 as const
export const CHART_REPORT_SOURCE_URL_MAX_LENGTH = 2_048 as const
export const CHART_REPORT_JSON_SNAPSHOT_MAX_BYTES = 4_096 as const

const USER_ID_MAX_LENGTH = 255
const TEXT_VALUE_MAX_LENGTH = 2_048
const LEVEL_VALUE_MAX_LENGTH = 64
const PUBLIC_ID_ALPHABET = '23456789abcdefghjkmnpqrstvwxyz'
const PUBLIC_SONG_ID_PATTERN = new RegExp(`^dsng_[${PUBLIC_ID_ALPHABET}]{10}$`)
const PUBLIC_CHART_ID_PATTERN = new RegExp(`^dsht_[${PUBLIC_ID_ALPHABET}]{10}$`)
const SHA256_PATTERN = /^[0-9a-f]{64}$/
const POSITIVE_BIGINT_PATTERN = /^[1-9]\d{0,18}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const FIELD_KEYS = new Set<string>(CHART_REPORT_FIELD_KEYS)
const CATEGORY_KEYS = new Set<string>(CHART_REPORT_CATEGORY_KEYS)
const STATE_KEYS = new Set<string>(CHART_REPORT_STATES)

export type ChartReportJsonSnapshot = string | number | boolean | null | Readonly<Record<string, number>>

const isPostgresText = (value: string) => value.isWellFormed() && !value.includes('\0')

const hasAtMostThreeDecimalPlaces = (value: number) => {
  const text = value.toString()
  if (text.includes('e') || text.includes('E')) return false
  const fractional = text.split('.')[1]
  return fractional === undefined || fractional.length <= 3
}

export type ChartReportIdentity = {
  readonly stableSongId: string
  readonly stableChartId: string
}

export type ChartReportPublicationIdentity = {
  readonly channel: typeof CHART_REPORT_PRODUCTION_CHANNEL
  readonly catalogRunId: string
  readonly revision: string
  readonly fingerprintSha256: string
}

export type NewChartReport = {
  readonly id: string
  readonly reporterUserId: string
  readonly chart: ChartReportIdentity
  readonly publication: ChartReportPublicationIdentity
  readonly fieldKey: ChartReportFieldKey
  readonly category: ChartReportCategoryKey
  readonly currentValue: ChartReportJsonSnapshot
  readonly proposedValue: ChartReportJsonSnapshot
  readonly explanation: string
  readonly sourceUrls: readonly string[]
}

export type ChartReportClosure = {
  readonly actorUserId: string
  readonly closedAt: Date
  readonly internalNote: string | null
}

export type StoredChartReport = NewChartReport & {
  readonly createdAt: Date
  readonly state: ChartReportState
  readonly closure: ChartReportClosure | null
}

export type ChartReportDomainFailureCode =
  | 'INVALID_REPORT_ID'
  | 'INVALID_USER_ID'
  | 'INVALID_CHART_IDENTITY'
  | 'INVALID_PUBLICATION_IDENTITY'
  | 'INVALID_FIELD_KEY'
  | 'INVALID_CATEGORY_KEY'
  | 'INVALID_JSON_SNAPSHOT'
  | 'INVALID_EXPLANATION'
  | 'INVALID_SOURCE_URLS'
  | 'INVALID_CLOSE_NOTE'
  | 'INVALID_LIFECYCLE'

export class ChartReportDomainFailure extends Error {
  readonly code: ChartReportDomainFailureCode

  constructor(code: ChartReportDomainFailureCode) {
    super('Chart report data is invalid')
    this.name = 'ChartReportDomainFailure'
    this.code = code
  }
}

function fail(code: ChartReportDomainFailureCode): never {
  throw new ChartReportDomainFailure(code)
}

const isExactString = (value: unknown, maximumLength: number): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= maximumLength &&
  value === value.trim() &&
  isPostgresText(value)

export const normalizeChartReportId = (value: unknown): string => {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) fail('INVALID_REPORT_ID')
  return value.toLowerCase()
}

export const normalizeChartReportUserId = (value: unknown): string => {
  if (!isExactString(value, USER_ID_MAX_LENGTH)) fail('INVALID_USER_ID')
  return value
}

export const normalizeChartReportIdentity = (value: unknown): ChartReportIdentity => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_CHART_IDENTITY')
  const candidate = value as Partial<ChartReportIdentity>
  if (
    typeof candidate.stableSongId !== 'string' ||
    !PUBLIC_SONG_ID_PATTERN.test(candidate.stableSongId) ||
    typeof candidate.stableChartId !== 'string' ||
    !PUBLIC_CHART_ID_PATTERN.test(candidate.stableChartId)
  ) {
    fail('INVALID_CHART_IDENTITY')
  }
  return Object.freeze({
    stableSongId: candidate.stableSongId,
    stableChartId: candidate.stableChartId,
  })
}

export const normalizeChartReportPublicationIdentity = (value: unknown): ChartReportPublicationIdentity => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_PUBLICATION_IDENTITY')
  const candidate = value as Partial<ChartReportPublicationIdentity>
  if (
    candidate.channel !== CHART_REPORT_PRODUCTION_CHANNEL ||
    typeof candidate.catalogRunId !== 'string' ||
    !POSITIVE_BIGINT_PATTERN.test(candidate.catalogRunId) ||
    BigInt(candidate.catalogRunId) > 9_223_372_036_854_775_807n ||
    typeof candidate.revision !== 'string' ||
    !POSITIVE_BIGINT_PATTERN.test(candidate.revision) ||
    BigInt(candidate.revision) > 9_223_372_036_854_775_807n ||
    typeof candidate.fingerprintSha256 !== 'string' ||
    !SHA256_PATTERN.test(candidate.fingerprintSha256)
  ) {
    fail('INVALID_PUBLICATION_IDENTITY')
  }
  return Object.freeze({
    channel: candidate.channel,
    catalogRunId: candidate.catalogRunId,
    revision: candidate.revision,
    fingerprintSha256: candidate.fingerprintSha256,
  })
}

export const normalizeChartReportFieldKey = (value: unknown): ChartReportFieldKey => {
  if (typeof value !== 'string' || !FIELD_KEYS.has(value)) fail('INVALID_FIELD_KEY')
  return value as ChartReportFieldKey
}

export const normalizeChartReportCategoryKey = (value: unknown): ChartReportCategoryKey => {
  if (typeof value !== 'string' || !CATEGORY_KEYS.has(value)) fail('INVALID_CATEGORY_KEY')
  return value as ChartReportCategoryKey
}

export const normalizeChartReportState = (value: unknown): ChartReportState => {
  if (typeof value !== 'string' || !STATE_KEYS.has(value)) fail('INVALID_LIFECYCLE')
  return value as ChartReportState
}

type FieldValueRule =
  | {
      readonly type: 'string'
      readonly nullable: boolean
      readonly maximumLength: number
      readonly date?: boolean
    }
  | {
      readonly type: 'number'
      readonly nullable: boolean
      readonly integer?: boolean
      readonly minimum: number
      readonly maximum: number
    }
  | { readonly type: 'boolean'; readonly nullable: boolean }
  | {
      readonly type: 'number_map'
      readonly nullable: boolean
      readonly maximumEntries: number
      readonly minimum: number
      readonly maximum: number
    }

const stringRule = (maximumLength = TEXT_VALUE_MAX_LENGTH, nullable = false): FieldValueRule => ({
  type: 'string',
  nullable,
  maximumLength,
})
const countRule = (): FieldValueRule => ({
  type: 'number',
  nullable: true,
  integer: true,
  minimum: 0,
  maximum: 1_000_000,
})

const FIELD_VALUE_RULES: Readonly<Record<ChartReportFieldKey, FieldValueRule>> = Object.freeze({
  'song.title': stringRule(),
  'song.artist': stringRule(),
  'song.category': stringRule(),
  'song.bpm': {
    type: 'number',
    nullable: true,
    minimum: 0.001,
    maximum: 10_000,
  },
  'song.image_name': stringRule(),
  'song.is_new': { type: 'boolean', nullable: false },
  'song.is_locked': { type: 'boolean', nullable: false },
  'song.version': stringRule(),
  'chart.type': stringRule(LEVEL_VALUE_MAX_LENGTH),
  'chart.difficulty': stringRule(LEVEL_VALUE_MAX_LENGTH),
  'chart.level': stringRule(LEVEL_VALUE_MAX_LENGTH),
  'chart.internal_level': {
    type: 'number',
    nullable: false,
    minimum: 0,
    maximum: 100,
  },
  'chart.multiver_internal_levels': {
    type: 'number_map',
    nullable: true,
    maximumEntries: 100,
    minimum: 0,
    maximum: 100,
  },
  'chart.note_designer': stringRule(TEXT_VALUE_MAX_LENGTH, true),
  'chart.note_counts.tap': countRule(),
  'chart.note_counts.hold': countRule(),
  'chart.note_counts.slide': countRule(),
  'chart.note_counts.touch': countRule(),
  'chart.note_counts.break': countRule(),
  'chart.note_counts.total': countRule(),
  'chart.regions.jp': { type: 'boolean', nullable: false },
  'chart.regions.intl': { type: 'boolean', nullable: false },
  'chart.regions.cn': { type: 'boolean', nullable: false },
  'chart.version': stringRule(),
  'chart.release_date': {
    type: 'string',
    nullable: true,
    maximumLength: 10,
    date: true,
  },
  'chart.internal_id': {
    type: 'number',
    nullable: true,
    integer: true,
    minimum: 0,
    maximum: 2_147_483_647,
  },
  'chart.is_special': { type: 'boolean', nullable: false },
  'chart.comment': stringRule(TEXT_VALUE_MAX_LENGTH, true),
})

export type ChartReportJsonValueKind = ChartReportValueKind

const valueKindForRule = (rule: FieldValueRule): ChartReportJsonValueKind => {
  if (rule.type === 'string') return rule.nullable ? 'nullable_string' : 'string'
  if (rule.type === 'number') {
    if (rule.integer) return rule.nullable ? 'nullable_integer' : 'integer'
    return rule.nullable ? 'nullable_number' : 'number'
  }
  if (rule.type === 'boolean') return 'boolean'
  return 'nullable_number_map'
}

/** Public metadata used by live-catalog validation without duplicating rules. */
export const CHART_REPORT_FIELD_VALUE_KINDS: Readonly<Record<ChartReportFieldKey, ChartReportJsonValueKind>> =
  Object.freeze(
    Object.fromEntries(
      CHART_REPORT_FIELD_KEYS.map((fieldKey) => [fieldKey, valueKindForRule(FIELD_VALUE_RULES[fieldKey])]),
    ) as Record<ChartReportFieldKey, ChartReportJsonValueKind>,
  )

const isRealCalendarDate = (value: string) => {
  if (!DATE_PATTERN.test(value) || value.startsWith('0000-')) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/** Validates a leaf snapshot against its source-controlled field key. */
export const normalizeChartReportJsonSnapshot = (
  fieldKey: ChartReportFieldKey,
  value: unknown,
): ChartReportJsonSnapshot => {
  const rule = FIELD_VALUE_RULES[fieldKey]
  if (value === null) {
    if (!rule.nullable) fail('INVALID_JSON_SNAPSHOT')
    return null
  }

  let normalized: ChartReportJsonSnapshot = value as ChartReportJsonSnapshot
  if (rule.type === 'string') {
    if (
      typeof value !== 'string' ||
      value.length > rule.maximumLength ||
      !isPostgresText(value) ||
      (rule.date && !isRealCalendarDate(value))
    ) {
      fail('INVALID_JSON_SNAPSHOT')
    }
  } else if (rule.type === 'number') {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      !hasAtMostThreeDecimalPlaces(value) ||
      (rule.integer && !Number.isInteger(value)) ||
      value < rule.minimum ||
      value > rule.maximum
    ) {
      fail('INVALID_JSON_SNAPSHOT')
    }
  } else if (rule.type === 'boolean') {
    if (typeof value !== 'boolean') fail('INVALID_JSON_SNAPSHOT')
  } else {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_JSON_SNAPSHOT')
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) fail('INVALID_JSON_SNAPSHOT')
    const entries = Object.entries(value)
    if (entries.length > rule.maximumEntries) fail('INVALID_JSON_SNAPSHOT')
    const normalizedEntries: Array<readonly [string, number]> = []
    for (const [key, nestedValue] of entries) {
      if (
        key.length === 0 ||
        key.length > 255 ||
        !isPostgresText(key) ||
        typeof nestedValue !== 'number' ||
        !Number.isFinite(nestedValue) ||
        !hasAtMostThreeDecimalPlaces(nestedValue) ||
        nestedValue < rule.minimum ||
        nestedValue > rule.maximum
      ) {
        fail('INVALID_JSON_SNAPSHOT')
      }
      normalizedEntries.push([key, nestedValue])
    }
    normalizedEntries.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    normalized = Object.freeze(Object.fromEntries(normalizedEntries))
  }

  if (rule.type !== 'number_map' && typeof value === 'object') {
    fail('INVALID_JSON_SNAPSHOT')
  }

  const serialized = JSON.stringify(normalized)
  if (serialized === undefined || Buffer.byteLength(serialized, 'utf8') > CHART_REPORT_JSON_SNAPSHOT_MAX_BYTES) {
    fail('INVALID_JSON_SNAPSHOT')
  }
  return normalized
}

export const normalizeChartReportExplanation = (value: unknown): string => {
  if (typeof value !== 'string') fail('INVALID_EXPLANATION')
  const normalized = value.trim()
  if (
    normalized.length === 0 ||
    normalized.length > CHART_REPORT_EXPLANATION_MAX_LENGTH ||
    !isPostgresText(normalized)
  ) {
    fail('INVALID_EXPLANATION')
  }
  return normalized
}

const normalizeSourceUrl = (value: unknown): string => {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > CHART_REPORT_SOURCE_URL_MAX_LENGTH ||
    value !== value.trim() ||
    !isPostgresText(value)
  ) {
    fail('INVALID_SOURCE_URLS')
  }

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    fail('INVALID_SOURCE_URLS')
  }
  if (
    (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
    parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    parsed.hostname.length === 0
  ) {
    fail('INVALID_SOURCE_URLS')
  }
  const normalized = parsed.toString()
  if (normalized.length > CHART_REPORT_SOURCE_URL_MAX_LENGTH) fail('INVALID_SOURCE_URLS')
  return normalized
}

export const normalizeChartReportSourceUrls = (value: unknown): readonly string[] => {
  if (!Array.isArray(value) || value.length > CHART_REPORT_SOURCE_URL_MAX_COUNT) fail('INVALID_SOURCE_URLS')
  return Object.freeze(value.map(normalizeSourceUrl))
}

export const normalizeChartReportCloseNote = (value: unknown): string | null => {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') fail('INVALID_CLOSE_NOTE')
  const normalized = value.trim()
  if (normalized.length === 0) return null
  if (normalized.length > CHART_REPORT_CLOSE_NOTE_MAX_LENGTH || !isPostgresText(normalized)) {
    fail('INVALID_CLOSE_NOTE')
  }
  return normalized
}

export const normalizeNewChartReport = (value: NewChartReport): NewChartReport => {
  const fieldKey = normalizeChartReportFieldKey(value.fieldKey)
  return Object.freeze({
    id: normalizeChartReportId(value.id),
    reporterUserId: normalizeChartReportUserId(value.reporterUserId),
    chart: normalizeChartReportIdentity(value.chart),
    publication: normalizeChartReportPublicationIdentity(value.publication),
    fieldKey,
    category: normalizeChartReportCategoryKey(value.category),
    currentValue: normalizeChartReportJsonSnapshot(fieldKey, value.currentValue),
    proposedValue: normalizeChartReportJsonSnapshot(fieldKey, value.proposedValue),
    explanation: normalizeChartReportExplanation(value.explanation),
    sourceUrls: normalizeChartReportSourceUrls(value.sourceUrls),
  })
}

const normalizeStoredDate = (value: unknown): Date => {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) fail('INVALID_LIFECYCLE')
  return Object.freeze(new Date(value.getTime()))
}

/** Enforces the only two valid persistence shapes: open/no closure or closed/full closure. */
export const normalizeStoredChartReport = (value: StoredChartReport): StoredChartReport => {
  const content = normalizeNewChartReport(value)
  const createdAt = normalizeStoredDate(value.createdAt)
  const state = normalizeChartReportState(value.state)
  if (state === 'open') {
    if (value.closure !== null) fail('INVALID_LIFECYCLE')
    return Object.freeze({ ...content, createdAt, state, closure: null })
  }
  if (!value.closure || typeof value.closure !== 'object') fail('INVALID_LIFECYCLE')
  const closedAt = normalizeStoredDate(value.closure.closedAt)
  if (closedAt.getTime() < createdAt.getTime()) fail('INVALID_LIFECYCLE')
  return Object.freeze({
    ...content,
    createdAt,
    state,
    closure: Object.freeze({
      actorUserId: normalizeChartReportUserId(value.closure.actorUserId),
      closedAt,
      internalNote: normalizeChartReportCloseNote(value.closure.internalNote),
    }),
  })
}