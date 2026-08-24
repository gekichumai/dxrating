import { adminAuthorizationForAction, type AdminPrimaryAuthAction } from '@gekichumai/admin-contract'
import { requireTargetAuthorization, type AdminAuthorizationContext } from './authorization.js'
import type { SuperAdministratorAllowlist } from './super-administrator-allowlist.js'
import {
  createPostgresUserBanStore,
  UserBanStoreFailure,
  type EvaluatedUserBanState,
  type StoredUserBanHistoryCursor,
  type StoredUserBanHistoryEvent,
  type UserBanStore,
} from './user-ban-store.js'

export const USER_BAN_REASON_MAX_LENGTH = 1_000 as const
export const USER_BAN_HISTORY_CURSOR_MAX_LENGTH = 1_024 as const
export const USER_BAN_HISTORY_DEFAULT_LIMIT = 50 as const
export const USER_BAN_HISTORY_MAX_LIMIT = 100 as const

const MAXIMUM_USER_ID_LENGTH = 255
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type UserBanServiceFailureCode = 'VALIDATION_FAILED' | 'CONFLICT'

export class UserBanServiceFailure extends Error {
  readonly code: UserBanServiceFailureCode

  constructor(code: UserBanServiceFailureCode) {
    super('User moderation operation failed')
    this.name = 'UserBanServiceFailure'
    this.code = code
  }
}

type UserBanMutationBase = {
  readonly context: AdminAuthorizationContext
  readonly targetUserId: string
  /** Null is valid only when the account has never had a moderation event. */
  readonly expectedStateVersion: string | null
  readonly requestCorrelationId?: string | null
}

export type BanUserInput = UserBanMutationBase &
  (
    | {
        readonly kind: 'temporary'
        readonly expiresAt: Date
        /** Disclosed only to this authenticated account when sign-in is rejected. */
        readonly reason: string
      }
    | {
        readonly kind: 'permanent'
        /** Disclosed only to this authenticated account when sign-in is rejected. */
        readonly reason: string
      }
  )

export type UnbanUserInput = UserBanMutationBase & {
  readonly reason?: string | null
}

export type UserBanTransitionResult = {
  readonly event: StoredUserBanHistoryEvent
  readonly state: EvaluatedUserBanState
  readonly revokedSessionCount: number
}

export interface UserBanService {
  getCurrentState(subjectUserId: string): Promise<EvaluatedUserBanState>
  listHistory(input: { readonly subjectUserId: string; readonly cursor?: string; readonly limit?: number }): Promise<{
    readonly items: readonly StoredUserBanHistoryEvent[]
    readonly nextCursor: string | null
  }>
  banUser(input: BanUserInput): Promise<UserBanTransitionResult>
  unbanUser(input: UnbanUserInput): Promise<UserBanTransitionResult>
}

type CursorPayload = {
  readonly version: 1
  readonly subjectUserId: string
  readonly createdAt: string
  readonly id: string
}

const validationFailure = () => new UserBanServiceFailure('VALIDATION_FAILED')
const conflictFailure = () => new UserBanServiceFailure('CONFLICT')

const validateUserId = (userId: string): string => {
  if (userId.length === 0 || userId.length > MAXIMUM_USER_ID_LENGTH || userId !== userId.trim()) {
    throw validationFailure()
  }
  return userId
}

const normalizeRequiredReason = (reason: string): string => {
  const normalized = reason.trim()
  if (normalized.length === 0 || normalized.length > USER_BAN_REASON_MAX_LENGTH) throw validationFailure()
  return normalized
}

const normalizeOptionalReason = (reason: string | null | undefined): string | null => {
  if (reason === null || reason === undefined) return null
  return normalizeRequiredReason(reason)
}

const isPositiveDecimalBigint = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length > 19 || !/^[1-9][0-9]*$/.test(value)) return false
  return BigInt(value) <= 9_223_372_036_854_775_807n
}

const validateExpectedStateVersion = (version: string | null): string | null => {
  if (version !== null && !isPositiveDecimalBigint(version)) throw validationFailure()
  return version
}

const validateCorrelationId = (requestCorrelationId: string | null | undefined): string | null => {
  if (requestCorrelationId === null || requestCorrelationId === undefined) return null
  if (!UUID_PATTERN.test(requestCorrelationId)) throw validationFailure()
  return requestCorrelationId.toLowerCase()
}

const validateExpiry = (expiresAt: Date): Date => {
  if (!(expiresAt instanceof Date) || !Number.isFinite(expiresAt.getTime())) throw validationFailure()
  return expiresAt
}

const encodeHistoryCursor = (subjectUserId: string, event: StoredUserBanHistoryEvent): string =>
  Buffer.from(
    JSON.stringify({
      version: 1,
      subjectUserId,
      createdAt: event.createdAt.toISOString(),
      id: event.id,
    } satisfies CursorPayload),
  ).toString('base64url')

const decodeHistoryCursor = (cursor: string, subjectUserId: string): StoredUserBanHistoryCursor => {
  if (cursor.length === 0 || cursor.length > USER_BAN_HISTORY_CURSOR_MAX_LENGTH || !/^[A-Za-z0-9_-]+$/.test(cursor)) {
    throw validationFailure()
  }

  let payload: unknown
  try {
    payload = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
  } catch {
    throw validationFailure()
  }
  if (!payload || typeof payload !== 'object') throw validationFailure()

  const candidate = payload as Partial<CursorPayload>
  if (
    candidate.version !== 1 ||
    candidate.subjectUserId !== subjectUserId ||
    !isPositiveDecimalBigint(candidate.id) ||
    typeof candidate.createdAt !== 'string'
  ) {
    throw validationFailure()
  }
  const createdAt = new Date(candidate.createdAt)
  if (!Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== candidate.createdAt) {
    throw validationFailure()
  }
  return { id: candidate.id, createdAt }
}

const mutationPolicy = (action: Extract<AdminPrimaryAuthAction, 'user.ban' | 'user.unban'>) =>
  adminAuthorizationForAction(action, {
    minimumRole: 'admin',
    targetAction: 'moderate',
  })

const BAN_POLICY = mutationPolicy('user.ban')
const UNBAN_POLICY = mutationPolicy('user.unban')

export const createUserBanService = ({
  store,
  superAdministrators,
}: {
  readonly store: UserBanStore
  readonly superAdministrators: SuperAdministratorAllowlist
}): UserBanService => {
  const runMutation = async ({
    context,
    targetUserId: rawTargetUserId,
    expectedStateVersion: rawExpectedStateVersion,
    requestCorrelationId: rawRequestCorrelationId,
    action,
    reason,
    expiresAt,
  }: UserBanMutationBase & {
    readonly action: 'ban' | 'unban'
    readonly reason: string | null
    readonly expiresAt: Date | null
  }): Promise<UserBanTransitionResult> => {
    const targetUserId = validateUserId(rawTargetUserId)
    const expectedStateVersion = validateExpectedStateVersion(rawExpectedStateVersion)
    const requestCorrelationId = validateCorrelationId(rawRequestCorrelationId)
    const policy = action === 'ban' ? BAN_POLICY : UNBAN_POLICY

    try {
      return await store.runInTransaction(async (transaction) => {
        const authorization = await requireTargetAuthorization({
          context,
          targetUserId,
          action: 'moderate',
          policy,
          transaction: transaction.authorization,
          superAdministrators,
        })
        const currentState = await transaction.loadCurrentState(authorization.target.id)

        // Version comparison deliberately precedes equivalence/no-op checks so
        // stale clients cannot mistake a later ABA-looking state for their own.
        if (currentState.stateVersion !== expectedStateVersion) throw conflictFailure()

        if (action === 'unban') {
          if (!currentState.active) throw conflictFailure()
        } else {
          if (reason === null) throw validationFailure()
          if (expiresAt && expiresAt.getTime() <= currentState.evaluatedAt.getTime()) throw validationFailure()

          const equivalentExpiry =
            (currentState.banExpiresAt === null && expiresAt === null) ||
            (currentState.banExpiresAt !== null &&
              expiresAt !== null &&
              currentState.banExpiresAt.getTime() === expiresAt.getTime())
          if (currentState.active && currentState.banReason === reason && equivalentExpiry) {
            throw conflictFailure()
          }
        }

        const applied = await transaction.applyTransition({
          subjectUserId: authorization.target.id,
          actorUserId: authorization.actor.id,
          expectedStateVersion,
          action,
          reason,
          // Replacements retain the uninterrupted start. Re-bans after an
          // expiry or explicit unban receive a fresh database event time.
          banStartedAt: action === 'ban' && currentState.active ? currentState.banStartedAt : null,
          expiresAt,
          requestCorrelationId,
        })
        if (!applied) throw conflictFailure()
        return applied
      })
    } catch (error) {
      if (error instanceof UserBanStoreFailure && error.code === 'INVALID_EXPIRY') throw validationFailure()
      if (error instanceof UserBanStoreFailure && error.code === 'CONFLICT') throw conflictFailure()
      throw error
    }
  }

  return {
    getCurrentState(subjectUserId) {
      return store.loadCurrentState(validateUserId(subjectUserId))
    },

    async listHistory({ subjectUserId: rawSubjectUserId, cursor: rawCursor, limit: rawLimit }) {
      const subjectUserId = validateUserId(rawSubjectUserId)
      const limit = rawLimit ?? USER_BAN_HISTORY_DEFAULT_LIMIT
      if (!Number.isInteger(limit) || limit < 1 || limit > USER_BAN_HISTORY_MAX_LIMIT) throw validationFailure()
      const cursor = rawCursor === undefined ? undefined : decodeHistoryCursor(rawCursor, subjectUserId)
      const page = await store.listHistory({ subjectUserId, cursor, limit })
      const lastItem = page.items.at(-1)
      return {
        items: page.items,
        nextCursor: page.hasMore && lastItem ? encodeHistoryCursor(subjectUserId, lastItem) : null,
      }
    },

    async banUser(input) {
      const reason = normalizeRequiredReason(input.reason)
      const expiresAt = input.kind === 'temporary' ? validateExpiry(input.expiresAt) : null
      return runMutation({ ...input, action: 'ban', reason, expiresAt })
    },

    async unbanUser(input) {
      const reason = normalizeOptionalReason(input.reason)
      return runMutation({ ...input, action: 'unban', reason, expiresAt: null })
    },
  }
}

export const createPostgresUserBanService = ({
  superAdministrators,
  store = createPostgresUserBanStore(),
}: {
  readonly superAdministrators: SuperAdministratorAllowlist
  readonly store?: UserBanStore
}): UserBanService => createUserBanService({ store, superAdministrators })