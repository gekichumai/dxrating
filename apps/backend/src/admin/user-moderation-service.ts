import { createHash, timingSafeEqual } from 'node:crypto'
import {
  ADMIN_USER_DISPLAY_NAME_PREFIX_MIN_LENGTH,
  ADMIN_USER_HISTORY_DEFAULT_LIMIT,
  ADMIN_USER_HISTORY_MAX_LIMIT,
  ADMIN_USER_SEARCH_CURSOR_MAX_LENGTH,
  ADMIN_USER_SEARCH_DEFAULT_LIMIT,
  ADMIN_USER_SEARCH_MAX_LIMIT,
  type AdminContractOutputs,
} from '@gekichumai/admin-contract'
import type { SuperAdministratorAllowlist } from './super-administrator-allowlist.js'
import {
  createPostgresUserBanService,
  UserBanServiceFailure,
  type BanUserInput,
  type UnbanUserInput,
  type UserBanService,
} from './user-ban-service.js'
import type { EvaluatedUserBanState, StoredUserBanHistoryEvent } from './user-ban-store.js'
import {
  createPostgresUserModerationStore,
  type StoredUserModerationBanState,
  type StoredUserModerationDetail,
  type StoredUserModerationSearchItem,
  type UserModerationSearchFilters,
  type UserModerationStore,
} from './user-moderation-store.js'

export const USER_MODERATION_SEARCH_DEFAULT_LIMIT = ADMIN_USER_SEARCH_DEFAULT_LIMIT
export const USER_MODERATION_SEARCH_MAX_LIMIT = ADMIN_USER_SEARCH_MAX_LIMIT
export const USER_MODERATION_SEARCH_CURSOR_MAX_LENGTH = ADMIN_USER_SEARCH_CURSOR_MAX_LENGTH
export const USER_MODERATION_DISPLAY_NAME_MIN_LENGTH = ADMIN_USER_DISPLAY_NAME_PREFIX_MIN_LENGTH
export const USER_MODERATION_HISTORY_DEFAULT_LIMIT = ADMIN_USER_HISTORY_DEFAULT_LIMIT
export const USER_MODERATION_HISTORY_MAX_LIMIT = ADMIN_USER_HISTORY_MAX_LIMIT

const MAXIMUM_USER_ID_LENGTH = 255
const MAXIMUM_EMAIL_LENGTH = 320
const MAXIMUM_DISPLAY_NAME_LENGTH = 255

export type UserModerationServiceFailureCode = 'VALIDATION_FAILED' | 'NOT_FOUND' | 'CONFLICT'

export class UserModerationServiceFailure extends Error {
  readonly code: UserModerationServiceFailureCode

  constructor(code: UserModerationServiceFailureCode) {
    super('User moderation request failed')
    this.name = 'UserModerationServiceFailure'
    this.code = code
  }
}

export type UserModerationAccountStatus = AdminContractOutputs['searchUsers']['items'][number]['accountStatus']
export type UserModerationSearchItem = AdminContractOutputs['searchUsers']['items'][number]
export type UserModerationBanState = AdminContractOutputs['getUserModerationDetail']['banState']
export type UserModerationDetail = AdminContractOutputs['getUserModerationDetail']
export type UserModerationHistoryEvent = AdminContractOutputs['listUserBanHistory']['items'][number]

export type SearchUsersInput = UserModerationSearchFilters & {
  readonly cursor?: string
  readonly limit?: number
}

export type UserModerationMutationOutput = AdminContractOutputs['banUser']

export interface UserModerationService {
  searchUsers(input: SearchUsersInput): Promise<AdminContractOutputs['searchUsers']>
  getUserModerationDetail(userId: string): Promise<UserModerationDetail>
  listBanHistory(input: {
    readonly userId: string
    readonly cursor?: string
    readonly limit?: number
  }): Promise<AdminContractOutputs['listUserBanHistory']>
  banUser(input: BanUserInput): Promise<UserModerationMutationOutput>
  unbanUser(input: UnbanUserInput): Promise<UserModerationMutationOutput>
}

type SearchCursor = {
  readonly version: 1
  readonly lastUserId: string
  readonly filterDigest: string
}

const validationFailure = () => new UserModerationServiceFailure('VALIDATION_FAILED')
const notFoundFailure = () => new UserModerationServiceFailure('NOT_FOUND')
const containsAsciiControlCharacter = (value: string): boolean =>
  [...value].some((character) => {
    const codePoint = character.codePointAt(0)!
    return codePoint <= 0x1f || codePoint === 0x7f
  })

const validateUserId = (value: string): string => {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAXIMUM_USER_ID_LENGTH ||
    value !== value.trim()
  ) {
    throw validationFailure()
  }
  return value
}

const normalizeOptionalUserId = (value: string | undefined): string | undefined =>
  value === undefined ? undefined : validateUserId(value)

const normalizeOptionalEmail = (value: string | undefined): string | undefined => {
  if (value === undefined) return undefined
  const normalized = value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase()
  if (
    normalized.length === 0 ||
    normalized.length > MAXIMUM_EMAIL_LENGTH ||
    !normalized.includes('@') ||
    normalized.includes(' ') ||
    containsAsciiControlCharacter(normalized)
  ) {
    throw validationFailure()
  }
  return normalized
}

const normalizeOptionalDisplayName = (value: string | undefined): string | undefined => {
  if (value === undefined) return undefined
  const normalized = value.normalize('NFKC').trim().replace(/\s+/gu, ' ')
  if (
    normalized.length < USER_MODERATION_DISPLAY_NAME_MIN_LENGTH ||
    normalized.length > MAXIMUM_DISPLAY_NAME_LENGTH ||
    containsAsciiControlCharacter(normalized)
  ) {
    throw validationFailure()
  }
  return normalized
}

const normalizeFilters = (input: SearchUsersInput): UserModerationSearchFilters => {
  if (input.effectiveRole !== undefined && !['user', 'admin', 'super_admin'].includes(input.effectiveRole)) {
    throw validationFailure()
  }
  if (input.activeBan !== undefined && typeof input.activeBan !== 'boolean') throw validationFailure()
  return {
    userId: normalizeOptionalUserId(input.userId),
    email: normalizeOptionalEmail(input.email),
    displayName: normalizeOptionalDisplayName(input.displayName),
    effectiveRole: input.effectiveRole,
    activeBan: input.activeBan,
  }
}

const digestFilters = (filters: UserModerationSearchFilters): string =>
  createHash('sha256')
    .update(
      JSON.stringify({
        userId: filters.userId ?? null,
        email: filters.email ?? null,
        displayName: filters.displayName ?? null,
        effectiveRole: filters.effectiveRole ?? null,
        activeBan: filters.activeBan ?? null,
      }),
    )
    .digest('hex')

const encodeCursor = (lastUserId: string, filterDigest: string): string =>
  Buffer.from(JSON.stringify({ version: 1, lastUserId, filterDigest } satisfies SearchCursor)).toString('base64url')

const equalDigests = (left: string, right: string): boolean => {
  if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) return false
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'))
}

const decodeCursor = (cursor: string, expectedFilterDigest: string): string => {
  if (
    cursor.length === 0 ||
    cursor.length > USER_MODERATION_SEARCH_CURSOR_MAX_LENGTH ||
    !/^[A-Za-z0-9_-]+$/.test(cursor)
  ) {
    throw validationFailure()
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
  } catch {
    throw validationFailure()
  }
  if (!parsed || typeof parsed !== 'object') throw validationFailure()
  const candidate = parsed as Partial<SearchCursor>
  if (
    candidate.version !== 1 ||
    typeof candidate.lastUserId !== 'string' ||
    typeof candidate.filterDigest !== 'string' ||
    !equalDigests(candidate.filterDigest, expectedFilterDigest)
  ) {
    throw validationFailure()
  }
  return validateUserId(candidate.lastUserId)
}

const projectAccountStatus = (item: StoredUserModerationSearchItem): UserModerationAccountStatus => {
  if (item.banState.status === 'temporary') {
    if (!item.banState.expiresAt) throw new Error('Temporary moderation state has no expiry')
    return { status: 'temporarily_banned', expiresAt: item.banState.expiresAt.toISOString() }
  }
  if (item.banState.status === 'permanent') return { status: 'permanently_banned' }
  return { status: 'active' }
}

const projectSearchItem = (item: StoredUserModerationSearchItem): UserModerationSearchItem => ({
  userId: item.userId,
  displayName: item.displayName,
  email: item.email,
  emailVerified: item.emailVerified,
  effectiveRole: item.effectiveRole,
  accountStatus: projectAccountStatus(item),
})

const projectStoredBanState = (state: StoredUserModerationBanState): UserModerationBanState => {
  const evaluatedAt = state.evaluatedAt.toISOString()

  if (state.status === 'unbanned') {
    if (
      state.reason !== null ||
      state.banStartedAt !== null ||
      state.expiresAt !== null ||
      (state.stateVersion === null) !== (state.actorUserId === null)
    ) {
      throw new Error('Inconsistent stored unbanned user moderation state')
    }
    return {
      status: 'unbanned',
      stateVersion: state.stateVersion,
      reason: null,
      actorUserId: state.actorUserId,
      banStartedAt: null,
      expiresAt: null,
      evaluatedAt,
    }
  }

  if (
    state.stateVersion === null ||
    state.reason === null ||
    state.actorUserId === null ||
    state.banStartedAt === null
  ) {
    throw new Error('Inconsistent stored banned user moderation state')
  }

  const base = {
    stateVersion: state.stateVersion,
    reason: state.reason,
    actorUserId: state.actorUserId,
    banStartedAt: state.banStartedAt.toISOString(),
    evaluatedAt,
  }
  if (state.status === 'permanent') {
    if (state.expiresAt !== null) throw new Error('Inconsistent stored permanent user moderation state')
    return { status: 'permanent', ...base, expiresAt: null }
  }
  if (state.expiresAt === null) throw new Error('Inconsistent stored temporary user moderation state')
  return { status: state.status, ...base, expiresAt: state.expiresAt.toISOString() }
}

const projectEvaluatedBanState = (state: EvaluatedUserBanState): UserModerationBanState =>
  projectStoredBanState({
    status:
      state.status === 'temporarily_banned'
        ? 'temporary'
        : state.status === 'permanently_banned'
          ? 'permanent'
          : state.status,
    stateVersion: state.stateVersion,
    reason: state.banReason,
    actorUserId: state.actorUserId,
    banStartedAt: state.banStartedAt,
    expiresAt: state.banExpiresAt,
    evaluatedAt: state.evaluatedAt,
  })

const projectDetail = (detail: StoredUserModerationDetail): UserModerationDetail => ({
  userId: detail.userId,
  displayName: detail.displayName,
  email: detail.email,
  emailVerified: detail.emailVerified,
  effectiveRole: detail.effectiveRole,
  banState: projectStoredBanState(detail.banState),
})

const projectEvent = (event: StoredUserBanHistoryEvent): UserModerationHistoryEvent => {
  const base = {
    id: event.id,
    subjectUserId: event.subjectUserId,
    actorUserId: event.actorUserId,
    previousEventId: event.previousEventId,
    createdAt: event.createdAt.toISOString(),
  }
  if (event.action === 'unban') {
    if (event.banStartedAt !== null || event.expiresAt !== null) {
      throw new Error('Inconsistent stored user unban event')
    }
    return {
      ...base,
      action: 'unban',
      kind: null,
      reason: event.reason,
      banStartedAt: null,
      expiresAt: null,
    }
  }
  if (event.reason === null || event.banStartedAt === null) {
    throw new Error('Inconsistent stored user ban event')
  }
  if (event.expiresAt !== null) {
    return {
      ...base,
      action: 'ban',
      kind: 'temporary',
      reason: event.reason,
      banStartedAt: event.banStartedAt.toISOString(),
      expiresAt: event.expiresAt.toISOString(),
    }
  }
  return {
    ...base,
    action: 'ban',
    kind: 'permanent',
    reason: event.reason,
    banStartedAt: event.banStartedAt.toISOString(),
    expiresAt: null,
  }
}

const mapBanServiceFailure = (error: unknown): never => {
  if (error instanceof UserBanServiceFailure) {
    throw new UserModerationServiceFailure(error.code)
  }
  throw error
}

export const createUserModerationService = ({
  store,
  bans,
  superAdministrators,
}: {
  readonly store: UserModerationStore
  readonly bans: UserBanService
  readonly superAdministrators: SuperAdministratorAllowlist
}): UserModerationService => {
  const resolveExistingAllowlistedUserIds = async (): Promise<readonly string[]> =>
    (
      await superAdministrators.resolveExistingConfiguredUsers((orderedUserIds) =>
        store.loadExistingUsersById(orderedUserIds),
      )
    ).map((user) => user.id)

  const loadDetail = async (rawUserId: string): Promise<StoredUserModerationDetail> => {
    const userId = validateUserId(rawUserId)
    const detail = await store.loadUserDetail(userId, superAdministrators.hasExactUserId(userId) ? [userId] : [])
    if (!detail) throw notFoundFailure()
    return detail
  }

  return {
    async searchUsers(input) {
      const filters = normalizeFilters(input)
      const limit = input.limit ?? USER_MODERATION_SEARCH_DEFAULT_LIMIT
      if (!Number.isInteger(limit) || limit < 1 || limit > USER_MODERATION_SEARCH_MAX_LIMIT) {
        throw validationFailure()
      }
      const filterDigest = digestFilters(filters)
      const afterUserId = input.cursor === undefined ? undefined : decodeCursor(input.cursor, filterDigest)
      const allowlistedUserIds = await resolveExistingAllowlistedUserIds()
      const page = await store.searchUsers({ filters, afterUserId, limit, allowlistedUserIds })
      const lastItem = page.items.at(-1)
      return {
        items: page.items.map(projectSearchItem),
        nextCursor: page.hasMore && lastItem ? encodeCursor(lastItem.userId, filterDigest) : null,
      }
    },

    async getUserModerationDetail(userId) {
      return projectDetail(await loadDetail(userId))
    },

    async listBanHistory({ userId, cursor, limit }) {
      const detail = await loadDetail(userId)
      const pageLimit = limit ?? USER_MODERATION_HISTORY_DEFAULT_LIMIT
      if (!Number.isInteger(pageLimit) || pageLimit < 1 || pageLimit > USER_MODERATION_HISTORY_MAX_LIMIT) {
        throw validationFailure()
      }
      try {
        const page = await bans.listHistory({ subjectUserId: detail.userId, cursor, limit: pageLimit })
        return { items: page.items.map(projectEvent), nextCursor: page.nextCursor }
      } catch (error) {
        return mapBanServiceFailure(error)
      }
    },

    async banUser(input) {
      try {
        const result = await bans.banUser(input)
        return { state: projectEvaluatedBanState(result.state), event: projectEvent(result.event) }
      } catch (error) {
        return mapBanServiceFailure(error)
      }
    },

    async unbanUser(input) {
      try {
        const result = await bans.unbanUser(input)
        return { state: projectEvaluatedBanState(result.state), event: projectEvent(result.event) }
      } catch (error) {
        return mapBanServiceFailure(error)
      }
    },
  }
}

export const createPostgresUserModerationService = ({
  superAdministrators,
  store = createPostgresUserModerationStore(),
  bans = createPostgresUserBanService({ superAdministrators }),
}: {
  readonly superAdministrators: SuperAdministratorAllowlist
  readonly store?: UserModerationStore
  readonly bans?: UserBanService
}): UserModerationService => createUserModerationService({ store, bans, superAdministrators })