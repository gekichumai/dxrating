import {
  AdminChartIdSchema,
  AdminCommentHistoryCursorSchema,
  AdminCommentIdSchema,
  AdminCommentThreadCursorSchema,
  AdminRecentCommentCursorSchema,
  AdminRecentCommentStatusSchema,
  AdminUserHistoryCursorSchema,
  AdminUserIdSchema,
  AdminUtcDateTimeSchema,
} from '@gekichumai/admin-contract'

export const COMMENT_LIST_SORT = 'newest' as const

export type CommentListSearch = {
  readonly sort: typeof COMMENT_LIST_SORT
  readonly authorUserId?: string
  readonly chartId?: string
  readonly status?: 'active' | 'deleted'
  readonly createdAtFromInclusive?: string
  readonly createdAtBeforeExclusive?: string
  readonly cursor?: string
  readonly commentId?: string
  readonly threadCursor?: string
  readonly commentHistoryCursor?: string
  readonly authorBanHistoryCursor?: string
}

export type CommentListFilters = Pick<
  CommentListSearch,
  'sort' | 'authorUserId' | 'chartId' | 'status' | 'createdAtFromInclusive' | 'createdAtBeforeExclusive'
>

export type CommentListFilterDraft = {
  readonly authorUserId: string
  readonly chartId: string
  readonly status: '' | NonNullable<CommentListSearch['status']>
  readonly createdAtFromInclusive: string
  readonly createdAtBeforeExclusive: string
}

export type CommentListFilterField = keyof CommentListFilterDraft
export type CommentListFilterError = 'invalid' | 'order'

export type CommentListFilterDraftResult =
  | { readonly success: true; readonly value: CommentListFilters }
  | {
      readonly success: false
      readonly errors: Partial<Readonly<Record<CommentListFilterField, CommentListFilterError>>>
    }

const readSingleString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)

const readCommentIdString = (value: unknown): string | undefined => {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value)
  return readSingleString(value)
}

const parseField = <T>(
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } },
  value: unknown,
): T | undefined => {
  const result = schema.safeParse(value)
  return result.success ? result.data : undefined
}

const parseOptionalString = <T>(
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } },
  value: unknown,
): T | undefined => {
  const candidate = readSingleString(value)
  return candidate === undefined ? undefined : parseField(schema, candidate)
}

const parseUtcInstant = (value: unknown): string | undefined => {
  const parsed = parseOptionalString(AdminUtcDateTimeSchema, value)
  return parsed === undefined ? undefined : new Date(parsed).toISOString()
}

const hasOrderedBounds = (from: string | undefined, before: string | undefined): boolean =>
  from === undefined || before === undefined || Date.parse(from) < Date.parse(before)

export const validateCommentListSearch = (search: Record<string, unknown>): CommentListSearch => {
  const authorUserId = parseOptionalString(AdminUserIdSchema, search.authorUserId)
  const chartId = parseOptionalString(AdminChartIdSchema, search.chartId)
  const status = parseOptionalString(AdminRecentCommentStatusSchema, search.status)
  let createdAtFromInclusive = parseUtcInstant(search.createdAtFromInclusive)
  let createdAtBeforeExclusive = parseUtcInstant(search.createdAtBeforeExclusive)
  const cursor = parseOptionalString(AdminRecentCommentCursorSchema, search.cursor)
  const commentId = parseField(AdminCommentIdSchema, readCommentIdString(search.commentId))
  const threadCursor =
    commentId === undefined ? undefined : parseOptionalString(AdminCommentThreadCursorSchema, search.threadCursor)
  const commentHistoryCursor =
    commentId === undefined
      ? undefined
      : parseOptionalString(AdminCommentHistoryCursorSchema, search.commentHistoryCursor)
  const authorBanHistoryCursor =
    commentId === undefined
      ? undefined
      : parseOptionalString(AdminUserHistoryCursorSchema, search.authorBanHistoryCursor)

  if (!hasOrderedBounds(createdAtFromInclusive, createdAtBeforeExclusive)) {
    createdAtFromInclusive = undefined
    createdAtBeforeExclusive = undefined
  }

  return {
    sort: COMMENT_LIST_SORT,
    ...(authorUserId === undefined ? {} : { authorUserId }),
    ...(chartId === undefined ? {} : { chartId }),
    ...(status === undefined ? {} : { status }),
    ...(createdAtFromInclusive === undefined ? {} : { createdAtFromInclusive }),
    ...(createdAtBeforeExclusive === undefined ? {} : { createdAtBeforeExclusive }),
    ...(cursor === undefined ? {} : { cursor }),
    ...(commentId === undefined ? {} : { commentId }),
    ...(threadCursor === undefined ? {} : { threadCursor }),
    ...(commentHistoryCursor === undefined ? {} : { commentHistoryCursor }),
    ...(authorBanHistoryCursor === undefined ? {} : { authorBanHistoryCursor }),
  }
}

export const commentListFiltersFromSearch = (search: CommentListSearch): CommentListFilters => ({
  sort: COMMENT_LIST_SORT,
  ...(search.authorUserId === undefined ? {} : { authorUserId: search.authorUserId }),
  ...(search.chartId === undefined ? {} : { chartId: search.chartId }),
  ...(search.status === undefined ? {} : { status: search.status }),
  ...(search.createdAtFromInclusive === undefined ? {} : { createdAtFromInclusive: search.createdAtFromInclusive }),
  ...(search.createdAtBeforeExclusive === undefined
    ? {}
    : { createdAtBeforeExclusive: search.createdAtBeforeExclusive }),
})

export const commentListQueryFromSearch = (
  search: CommentListSearch,
): Omit<
  CommentListSearch,
  'sort' | 'commentId' | 'threadCursor' | 'commentHistoryCursor' | 'authorBanHistoryCursor'
> => ({
  ...(search.authorUserId === undefined ? {} : { authorUserId: search.authorUserId }),
  ...(search.chartId === undefined ? {} : { chartId: search.chartId }),
  ...(search.status === undefined ? {} : { status: search.status }),
  ...(search.createdAtFromInclusive === undefined ? {} : { createdAtFromInclusive: search.createdAtFromInclusive }),
  ...(search.createdAtBeforeExclusive === undefined
    ? {}
    : { createdAtBeforeExclusive: search.createdAtBeforeExclusive }),
  ...(search.cursor === undefined ? {} : { cursor: search.cursor }),
})

export const commentDetailQueryFromSearch = (
  search: CommentListSearch,
): Pick<CommentListSearch, 'threadCursor' | 'commentHistoryCursor' | 'authorBanHistoryCursor'> => ({
  ...(search.threadCursor === undefined ? {} : { threadCursor: search.threadCursor }),
  ...(search.commentHistoryCursor === undefined ? {} : { commentHistoryCursor: search.commentHistoryCursor }),
  ...(search.authorBanHistoryCursor === undefined ? {} : { authorBanHistoryCursor: search.authorBanHistoryCursor }),
})

const padLocalPart = (value: number): string => String(value).padStart(2, '0')

export const instantToLocalDateTimeInput = (value: string | undefined): string => {
  if (value === undefined) return ''
  const date = new Date(value)
  return `${String(date.getFullYear()).padStart(4, '0')}-${padLocalPart(date.getMonth() + 1)}-${padLocalPart(
    date.getDate(),
  )}T${padLocalPart(date.getHours())}:${padLocalPart(date.getMinutes())}`
}

export const commentListFilterDraftFromSearch = (search: CommentListSearch): CommentListFilterDraft => ({
  authorUserId: search.authorUserId ?? '',
  chartId: search.chartId ?? '',
  status: search.status ?? '',
  createdAtFromInclusive: instantToLocalDateTimeInput(search.createdAtFromInclusive),
  createdAtBeforeExclusive: instantToLocalDateTimeInput(search.createdAtBeforeExclusive),
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

export const parseCommentListFilterDraft = (draft: CommentListFilterDraft): CommentListFilterDraftResult => {
  const errors: Partial<Record<CommentListFilterField, CommentListFilterError>> = {}
  const filters: {
    authorUserId?: string
    chartId?: string
    status?: NonNullable<CommentListSearch['status']>
    createdAtFromInclusive?: string
    createdAtBeforeExclusive?: string
  } = {}

  const parseDraftString = <T>(
    field: 'authorUserId' | 'chartId',
    schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } },
  ) => {
    const candidate = draft[field]
    if (candidate.length === 0) return undefined
    const result = schema.safeParse(candidate)
    if (!result.success) {
      errors[field] = 'invalid'
      return undefined
    }
    return result.data
  }

  const authorUserId = parseDraftString('authorUserId', AdminUserIdSchema)
  const chartId = parseDraftString('chartId', AdminChartIdSchema)
  if (authorUserId !== undefined) filters.authorUserId = authorUserId
  if (chartId !== undefined) filters.chartId = chartId

  if (draft.status !== '') {
    const status = AdminRecentCommentStatusSchema.safeParse(draft.status)
    if (status.success) filters.status = status.data
    else errors.status = 'invalid'
  }

  const parseDraftInstant = (field: 'createdAtFromInclusive' | 'createdAtBeforeExclusive') => {
    const candidate = draft[field]
    if (candidate.length === 0) return undefined
    const instant = localDateTimeToInstant(candidate)
    if (instant === undefined) errors[field] = 'invalid'
    return instant
  }

  const createdAtFromInclusive = parseDraftInstant('createdAtFromInclusive')
  const createdAtBeforeExclusive = parseDraftInstant('createdAtBeforeExclusive')
  if (createdAtFromInclusive !== undefined) filters.createdAtFromInclusive = createdAtFromInclusive
  if (createdAtBeforeExclusive !== undefined) filters.createdAtBeforeExclusive = createdAtBeforeExclusive

  if (
    createdAtFromInclusive !== undefined &&
    createdAtBeforeExclusive !== undefined &&
    !hasOrderedBounds(createdAtFromInclusive, createdAtBeforeExclusive)
  ) {
    errors.createdAtBeforeExclusive = 'order'
  }

  return Object.keys(errors).length === 0
    ? { success: true, value: { sort: COMMENT_LIST_SORT, ...filters } }
    : { success: false, errors }
}

export const hasCommentListFilters = (search: CommentListSearch): boolean =>
  Object.keys(commentListFiltersFromSearch(search)).some((key) => key !== 'sort')

export const selectCommentInSearch = (search: CommentListSearch, commentId?: string): CommentListSearch => {
  const {
    commentId: _commentId,
    threadCursor: _threadCursor,
    commentHistoryCursor: _commentHistoryCursor,
    authorBanHistoryCursor: _authorBanHistoryCursor,
    ...preserved
  } = search
  return { ...preserved, ...(commentId === undefined ? {} : { commentId }) }
}