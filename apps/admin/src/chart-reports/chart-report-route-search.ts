import {
  AdminChartReportCategoryKeySchema,
  AdminChartReportChartIdSchema,
  AdminChartReportCursorSchema,
  AdminChartReportDateBoundSchema,
  AdminChartReportFieldKeySchema,
  AdminChartReportPublicationRevisionSchema,
  AdminChartReportStateSchema,
  AdminUserIdSchema,
  type AdminChartReportCategoryKey,
  type AdminChartReportFieldKey,
} from '@gekichumai/admin-contract'

export const CHART_REPORT_QUEUE_ORDER = 'open-first-newest' as const

export type ChartReportListSearch = {
  readonly state?: 'open' | 'closed'
  readonly chartId?: string
  readonly fieldKey?: AdminChartReportFieldKey
  readonly category?: AdminChartReportCategoryKey
  readonly reporterUserId?: string
  readonly submittedAtFromInclusive?: string
  readonly submittedAtBeforeExclusive?: string
  readonly publicationRevision?: string
  readonly cursor?: string
}

export type ChartReportListFilters = Omit<ChartReportListSearch, 'cursor'>

export type ChartReportListFilterDraft = {
  readonly state: '' | NonNullable<ChartReportListSearch['state']>
  readonly chartId: string
  readonly fieldKey: '' | AdminChartReportFieldKey
  readonly category: '' | AdminChartReportCategoryKey
  readonly reporterUserId: string
  readonly submittedAtFromInclusive: string
  readonly submittedAtBeforeExclusive: string
  readonly publicationRevision: string
}

export type ChartReportListFilterField = keyof ChartReportListFilterDraft
export type ChartReportListFilterError = 'invalid' | 'order'

export type ChartReportListFilterDraftResult =
  | { readonly success: true; readonly value: ChartReportListFilters }
  | {
      readonly success: false
      readonly errors: Partial<Readonly<Record<ChartReportListFilterField, ChartReportListFilterError>>>
    }

type RuntimeSchema<T> = {
  readonly safeParse: (value: unknown) => { readonly success: true; readonly data: T } | { readonly success: false }
}

const readSingleString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)

const readPublicationRevision = (value: unknown): string | undefined => {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value)
  return readSingleString(value)
}

const parseField = <T>(schema: RuntimeSchema<T>, value: unknown): T | undefined => {
  try {
    const result = schema.safeParse(value)
    return result.success ? result.data : undefined
  } catch {
    return undefined
  }
}

const parseOptionalString = <T>(schema: RuntimeSchema<T>, value: unknown): T | undefined => {
  const candidate = readSingleString(value)
  return candidate === undefined ? undefined : parseField(schema, candidate)
}

const parseUtcInstant = (value: unknown): string | undefined => {
  const parsed = parseOptionalString(AdminChartReportDateBoundSchema, value)
  return parsed === undefined ? undefined : new Date(parsed).toISOString()
}

const hasOrderedBounds = (from: string | undefined, before: string | undefined): boolean =>
  from === undefined || before === undefined || Date.parse(from) < Date.parse(before)

export const validateChartReportListSearch = (search: Record<string, unknown>): ChartReportListSearch => {
  const state = parseOptionalString(AdminChartReportStateSchema, search.state)
  const chartId = parseOptionalString(AdminChartReportChartIdSchema, search.chartId)
  const fieldKey = parseOptionalString(AdminChartReportFieldKeySchema, search.fieldKey)
  const category = parseOptionalString(AdminChartReportCategoryKeySchema, search.category)
  const reporterUserId = parseOptionalString(AdminUserIdSchema, search.reporterUserId)
  let submittedAtFromInclusive = parseUtcInstant(search.submittedAtFromInclusive)
  let submittedAtBeforeExclusive = parseUtcInstant(search.submittedAtBeforeExclusive)
  const publicationRevision = parseField(
    AdminChartReportPublicationRevisionSchema,
    readPublicationRevision(search.publicationRevision),
  )
  const cursor = parseOptionalString(AdminChartReportCursorSchema, search.cursor)

  if (!hasOrderedBounds(submittedAtFromInclusive, submittedAtBeforeExclusive)) {
    submittedAtFromInclusive = undefined
    submittedAtBeforeExclusive = undefined
  }

  return {
    ...(state === undefined ? {} : { state }),
    ...(chartId === undefined ? {} : { chartId }),
    ...(fieldKey === undefined ? {} : { fieldKey }),
    ...(category === undefined ? {} : { category }),
    ...(reporterUserId === undefined ? {} : { reporterUserId }),
    ...(submittedAtFromInclusive === undefined ? {} : { submittedAtFromInclusive }),
    ...(submittedAtBeforeExclusive === undefined ? {} : { submittedAtBeforeExclusive }),
    ...(publicationRevision === undefined ? {} : { publicationRevision }),
    ...(cursor === undefined ? {} : { cursor }),
  }
}

export const chartReportListFiltersFromSearch = (search: ChartReportListSearch): ChartReportListFilters => {
  const { cursor: _cursor, ...filters } = search
  return filters
}

export const chartReportListQueryFromSearch = (search: ChartReportListSearch): ChartReportListSearch => ({ ...search })

const padLocalPart = (value: number): string => String(value).padStart(2, '0')

export const chartReportInstantToLocalDateTimeInput = (value: string | undefined): string => {
  if (value === undefined) return ''
  const date = new Date(value)
  return `${String(date.getFullYear()).padStart(4, '0')}-${padLocalPart(date.getMonth() + 1)}-${padLocalPart(
    date.getDate(),
  )}T${padLocalPart(date.getHours())}:${padLocalPart(date.getMinutes())}`
}

export const chartReportListFilterDraftFromSearch = (search: ChartReportListSearch): ChartReportListFilterDraft => ({
  state: search.state ?? '',
  chartId: search.chartId ?? '',
  fieldKey: search.fieldKey ?? '',
  category: search.category ?? '',
  reporterUserId: search.reporterUserId ?? '',
  submittedAtFromInclusive: chartReportInstantToLocalDateTimeInput(search.submittedAtFromInclusive),
  submittedAtBeforeExclusive: chartReportInstantToLocalDateTimeInput(search.submittedAtBeforeExclusive),
  publicationRevision: search.publicationRevision ?? '',
})

const localDateTimeToInstant = (value: string): string | undefined => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (match === null) return undefined
  const [, yearText, monthText, dayText, hourText, minuteText] = match
  const [year, month, day, hour, minute] = [yearText, monthText, dayText, hourText, minuteText].map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ]
  if (year < 1 || year > 9999) return undefined

  const date = new Date(year < 100 ? 100 : year, month - 1, day, hour, minute, 0, 0)
  if (year < 100) date.setFullYear(year)
  if (
    !Number.isFinite(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return undefined
  }
  return date.toISOString()
}

export const parseChartReportListFilterDraft = (
  draft: ChartReportListFilterDraft,
): ChartReportListFilterDraftResult => {
  const errors: Partial<Record<ChartReportListFilterField, ChartReportListFilterError>> = {}
  const filters: {
    state?: NonNullable<ChartReportListSearch['state']>
    chartId?: string
    fieldKey?: AdminChartReportFieldKey
    category?: AdminChartReportCategoryKey
    reporterUserId?: string
    submittedAtFromInclusive?: string
    submittedAtBeforeExclusive?: string
    publicationRevision?: string
  } = {}

  const parseDraftString = <T>(
    field: 'chartId' | 'reporterUserId' | 'publicationRevision',
    schema: RuntimeSchema<T>,
  ): T | undefined => {
    const candidate = draft[field]
    if (candidate.length === 0) return undefined
    const result = schema.safeParse(candidate)
    if (!result.success) {
      errors[field] = 'invalid'
      return undefined
    }
    return result.data
  }

  const chartId = parseDraftString('chartId', AdminChartReportChartIdSchema)
  const reporterUserId = parseDraftString('reporterUserId', AdminUserIdSchema)
  const publicationRevision = parseDraftString('publicationRevision', AdminChartReportPublicationRevisionSchema)
  if (chartId !== undefined) filters.chartId = chartId
  if (reporterUserId !== undefined) filters.reporterUserId = reporterUserId
  if (publicationRevision !== undefined) filters.publicationRevision = publicationRevision

  if (draft.state !== '') {
    const state = AdminChartReportStateSchema.safeParse(draft.state)
    if (state.success) filters.state = state.data
    else errors.state = 'invalid'
  }

  if (draft.fieldKey !== '') {
    const fieldKey = AdminChartReportFieldKeySchema.safeParse(draft.fieldKey)
    if (fieldKey.success) filters.fieldKey = fieldKey.data
    else errors.fieldKey = 'invalid'
  }

  if (draft.category !== '') {
    const category = AdminChartReportCategoryKeySchema.safeParse(draft.category)
    if (category.success) filters.category = category.data
    else errors.category = 'invalid'
  }

  const parseDraftInstant = (field: 'submittedAtFromInclusive' | 'submittedAtBeforeExclusive') => {
    const candidate = draft[field]
    if (candidate.length === 0) return undefined
    const instant = localDateTimeToInstant(candidate)
    if (instant === undefined) errors[field] = 'invalid'
    return instant
  }

  const submittedAtFromInclusive = parseDraftInstant('submittedAtFromInclusive')
  const submittedAtBeforeExclusive = parseDraftInstant('submittedAtBeforeExclusive')
  if (submittedAtFromInclusive !== undefined) filters.submittedAtFromInclusive = submittedAtFromInclusive
  if (submittedAtBeforeExclusive !== undefined) filters.submittedAtBeforeExclusive = submittedAtBeforeExclusive

  if (
    submittedAtFromInclusive !== undefined &&
    submittedAtBeforeExclusive !== undefined &&
    !hasOrderedBounds(submittedAtFromInclusive, submittedAtBeforeExclusive)
  ) {
    errors.submittedAtBeforeExclusive = 'order'
  }

  return Object.keys(errors).length === 0 ? { success: true, value: filters } : { success: false, errors }
}

export const hasChartReportListFilters = (search: ChartReportListSearch): boolean =>
  Object.keys(chartReportListFiltersFromSearch(search)).length > 0