import {
  AdminCommentIdSchema,
  AdminRecentCommentCursorSchema,
  AdminUserDisplayNamePrefixSchema,
  AdminUserEffectiveRoleSchema,
  AdminUserHistoryCursorSchema,
  AdminUserIdSchema,
  AdminUserSearchCursorSchema,
  AdminUserSearchEmailSchema,
} from '@gekichumai/admin-contract'

export type UserListSearch = {
  readonly userId?: string
  readonly displayName?: string
  readonly email?: string
  readonly effectiveRole?: 'user' | 'admin' | 'super_admin'
  readonly activeBan?: boolean
  readonly cursor?: string
}

export type UserListFilters = Omit<UserListSearch, 'cursor'>

export type UserDetailSearch = {
  readonly commentsCursor?: string
  readonly banHistoryCursor?: string
  readonly sourceCommentId?: string
}

export type UserListFilterDraft = {
  readonly userId: string
  readonly displayName: string
  readonly email: string
  readonly effectiveRole: '' | NonNullable<UserListSearch['effectiveRole']>
  readonly activeBan: '' | 'true' | 'false'
}

export type UserListFilterField = keyof UserListFilterDraft

export type UserListFilterDraftResult =
  | { readonly success: true; readonly value: UserListFilters }
  | {
      readonly success: false
      readonly errors: Partial<Readonly<Record<UserListFilterField, 'invalid'>>>
    }

const readSingleString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)

const readCommentIdString = (value: unknown): string | undefined => {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value)
  return readSingleString(value)
}

const parseField = <T>(
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } },
  value: unknown,
) => {
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

const parseActiveBan = (value: unknown): boolean | undefined => {
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  return undefined
}

export const validateUserListSearch = (search: Record<string, unknown>): UserListSearch => {
  const userId = parseOptionalString(AdminUserIdSchema, search.userId)
  const displayName = parseOptionalString(AdminUserDisplayNamePrefixSchema, search.displayName)
  const email = parseOptionalString(AdminUserSearchEmailSchema, search.email)
  const effectiveRole = parseOptionalString(AdminUserEffectiveRoleSchema, search.effectiveRole)
  const activeBan = parseActiveBan(search.activeBan)
  const cursor = parseOptionalString(AdminUserSearchCursorSchema, search.cursor)

  return {
    ...(userId === undefined ? {} : { userId }),
    ...(displayName === undefined ? {} : { displayName }),
    ...(email === undefined ? {} : { email }),
    ...(effectiveRole === undefined ? {} : { effectiveRole }),
    ...(activeBan === undefined ? {} : { activeBan }),
    ...(cursor === undefined ? {} : { cursor }),
  }
}

export const validateUserDetailSearch = (search: Record<string, unknown>): UserDetailSearch => {
  const commentsCursor = parseOptionalString(AdminRecentCommentCursorSchema, search.commentsCursor)
  const banHistoryCursor = parseOptionalString(AdminUserHistoryCursorSchema, search.banHistoryCursor)
  const sourceCommentId = parseField(AdminCommentIdSchema, readCommentIdString(search.sourceCommentId))

  return {
    ...(commentsCursor === undefined ? {} : { commentsCursor }),
    ...(banHistoryCursor === undefined ? {} : { banHistoryCursor }),
    ...(sourceCommentId === undefined ? {} : { sourceCommentId }),
  }
}

export const userListFilterDraftFromSearch = (search: UserListSearch): UserListFilterDraft => ({
  userId: search.userId ?? '',
  displayName: search.displayName ?? '',
  email: search.email ?? '',
  effectiveRole: search.effectiveRole ?? '',
  activeBan: search.activeBan === undefined ? '' : search.activeBan ? 'true' : 'false',
})

export const parseUserListFilterDraft = (draft: UserListFilterDraft): UserListFilterDraftResult => {
  const errors: Partial<Record<UserListFilterField, 'invalid'>> = {}
  const filters: {
    userId?: string
    displayName?: string
    email?: string
    effectiveRole?: NonNullable<UserListSearch['effectiveRole']>
    activeBan?: boolean
  } = {}

  const parseDraftString = <T>(
    field: 'userId' | 'displayName' | 'email',
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

  const userId = parseDraftString('userId', AdminUserIdSchema)
  const displayName = parseDraftString('displayName', AdminUserDisplayNamePrefixSchema)
  const email = parseDraftString('email', AdminUserSearchEmailSchema)
  if (userId !== undefined) filters.userId = userId
  if (displayName !== undefined) filters.displayName = displayName
  if (email !== undefined) filters.email = email

  if (draft.effectiveRole !== '') {
    const effectiveRole = AdminUserEffectiveRoleSchema.safeParse(draft.effectiveRole)
    if (effectiveRole.success) filters.effectiveRole = effectiveRole.data
    else errors.effectiveRole = 'invalid'
  }

  if (draft.activeBan !== '') {
    const activeBan = parseActiveBan(draft.activeBan)
    if (activeBan === undefined) errors.activeBan = 'invalid'
    else filters.activeBan = activeBan
  }

  return Object.keys(errors).length === 0 ? { success: true, value: filters } : { success: false, errors }
}

export const userListSearchWithoutCursor = (search: UserListSearch): UserListFilters => {
  const { cursor: _cursor, ...filters } = search
  return filters
}

export const hasUserListFilters = (search: UserListSearch): boolean =>
  Object.keys(userListSearchWithoutCursor(search)).length > 0