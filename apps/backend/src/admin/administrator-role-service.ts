import {
  ADMIN_ROLE_CHANGE_REASON_MAX_LENGTH,
  ADMIN_ROLE_HISTORY_CURSOR_MAX_LENGTH,
  ADMIN_ROLE_HISTORY_DEFAULT_LIMIT,
  ADMIN_ROLE_HISTORY_MAX_LIMIT,
  adminAuthorizationForAction,
  type AdminContractOutputs,
  type AdminPrimaryAuthAction,
} from '@gekichumai/admin-contract'
import { requireTargetAuthorization, type AdminAuthorizationContext } from './authorization.js'
import {
  createPostgresAdministratorRoleStore,
  type AdministratorAccountRecord,
  type AdministratorPersistedRoleTransition,
  type AdministratorRoleStore,
  type StoredAdministratorRoleChange,
  type StoredAdministratorRoleHistoryCursor,
} from './administrator-role-store.js'
import type { SuperAdministratorAllowlist } from './super-administrator-allowlist.js'
import type { EvaluatedUserBanState } from './user-ban-store.js'

const MAXIMUM_USER_ID_LENGTH = 255

export type AdministratorRosterEntry = AdminContractOutputs['listAdministrators']['items'][number]
export type AdministratorRoleChange = AdminContractOutputs['listAdministratorRoleHistory']['items'][number]
export type AdministratorGrantChange = AdminContractOutputs['grantAdministrator']['change']
export type AdministratorRevokeChange = AdminContractOutputs['revokeAdministrator']['change']

export type AdministratorRoleServiceFailureCode = 'VALIDATION_FAILED' | 'CONFLICT'

export class AdministratorRoleServiceFailure extends Error {
  readonly code: AdministratorRoleServiceFailureCode

  constructor(code: AdministratorRoleServiceFailureCode) {
    super('Administrator role operation failed')
    this.name = 'AdministratorRoleServiceFailure'
    this.code = code
  }
}

export type AdministratorRoleMutationInput = {
  readonly context: AdminAuthorizationContext
  readonly targetUserId: string
  readonly reason: string
}

export interface AdministratorRoleService {
  listAdministrators(): Promise<{ readonly items: readonly AdministratorRosterEntry[] }>
  listRoleHistory(input: {
    readonly subjectUserId: string
    readonly cursor?: string
    readonly limit?: number
  }): Promise<{ readonly items: readonly AdministratorRoleChange[]; readonly nextCursor: string | null }>
  grantAdministrator(input: AdministratorRoleMutationInput): Promise<{ readonly change: AdministratorGrantChange }>
  revokeAdministrator(input: AdministratorRoleMutationInput): Promise<{ readonly change: AdministratorRevokeChange }>
}

type CursorPayload = {
  readonly version: 1
  readonly subjectUserId: string
  readonly changedAt: string
  readonly id: string
}

const validationFailure = () => new AdministratorRoleServiceFailure('VALIDATION_FAILED')
const conflictFailure = () => new AdministratorRoleServiceFailure('CONFLICT')

const validateUserId = (userId: string): string => {
  if (userId.length === 0 || userId.length > MAXIMUM_USER_ID_LENGTH || userId !== userId.trim()) {
    throw validationFailure()
  }
  return userId
}

const normalizeReason = (reason: string): string => {
  const normalized = reason.trim()
  if (normalized.length === 0 || normalized.length > ADMIN_ROLE_CHANGE_REASON_MAX_LENGTH) throw validationFailure()
  return normalized
}

const isPositiveDecimalBigint = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length > 19 || !/^[1-9][0-9]*$/.test(value)) return false
  return BigInt(value) <= 9_223_372_036_854_775_807n
}

const encodeHistoryCursor = (subjectUserId: string, change: StoredAdministratorRoleChange): string =>
  Buffer.from(
    JSON.stringify({
      version: 1,
      subjectUserId,
      changedAt: change.changedAt.toISOString(),
      id: change.id,
    } satisfies CursorPayload),
  ).toString('base64url')

const decodeHistoryCursor = (cursor: string, subjectUserId: string): StoredAdministratorRoleHistoryCursor => {
  if (cursor.length === 0 || cursor.length > ADMIN_ROLE_HISTORY_CURSOR_MAX_LENGTH || !/^[A-Za-z0-9_-]+$/.test(cursor)) {
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
    typeof candidate.changedAt !== 'string'
  ) {
    throw validationFailure()
  }
  const changedAt = new Date(candidate.changedAt)
  if (!Number.isFinite(changedAt.getTime()) || changedAt.toISOString() !== candidate.changedAt) {
    throw validationFailure()
  }

  return { id: candidate.id, changedAt }
}

const roleChangeBase = (change: StoredAdministratorRoleChange) => ({
  id: change.id,
  subjectUserId: change.subjectUserId,
  actorUserId: change.actorUserId,
  reason: change.reason,
  changedAt: change.changedAt.toISOString(),
})

const projectRoleChange = (change: StoredAdministratorRoleChange): AdministratorRoleChange => {
  if (change.previousRole === 'user' && change.newRole === 'admin') {
    return { ...roleChangeBase(change), previousRole: 'user', newRole: 'admin' }
  }
  if (change.previousRole === 'admin' && change.newRole === 'user') {
    return { ...roleChangeBase(change), previousRole: 'admin', newRole: 'user' }
  }
  throw new Error('Invalid stored administrator role change')
}

const projectGrantChange = (change: StoredAdministratorRoleChange): AdministratorGrantChange => {
  if (change.previousRole !== 'user' || change.newRole !== 'admin') {
    throw new Error('Invalid stored administrator grant')
  }
  return { ...roleChangeBase(change), previousRole: 'user', newRole: 'admin' }
}

const projectRevokeChange = (change: StoredAdministratorRoleChange): AdministratorRevokeChange => {
  if (change.previousRole !== 'admin' || change.newRole !== 'user') {
    throw new Error('Invalid stored administrator revocation')
  }
  return { ...roleChangeBase(change), previousRole: 'admin', newRole: 'user' }
}

const projectRosterEntry = (
  account: AdministratorAccountRecord,
  superAdministrators: SuperAdministratorAllowlist,
  banState: EvaluatedUserBanState,
): AdministratorRosterEntry => {
  const deploymentRole = superAdministrators.hasExactUserId(account.id)
  const accountStatus =
    banState.status === 'temporarily_banned' && banState.banExpiresAt
      ? { status: 'temporarily_banned' as const, expiresAt: banState.banExpiresAt.toISOString() }
      : banState.status === 'permanently_banned'
        ? { status: 'permanently_banned' as const }
        : { status: 'active' as const }
  const identity = {
    userId: account.id,
    displayName: account.displayName,
    email: account.email,
    emailVerified: account.emailVerified,
    accountStatus,
  }
  if (deploymentRole) {
    return { ...identity, effectiveRole: 'super_admin', roleSource: 'deployment' }
  }
  return { ...identity, effectiveRole: 'admin', roleSource: 'database' }
}

const mutationPolicy = (action: Extract<AdminPrimaryAuthAction, 'administrator.grant' | 'administrator.revoke'>) =>
  adminAuthorizationForAction(action, {
    minimumRole: 'super_admin',
    targetAction: 'manage_administrator_role',
  })

const GRANT_POLICY = mutationPolicy('administrator.grant')
const REVOKE_POLICY = mutationPolicy('administrator.revoke')

export const createAdministratorRoleService = ({
  store,
  superAdministrators,
}: {
  readonly store: AdministratorRoleStore
  readonly superAdministrators: SuperAdministratorAllowlist
}): AdministratorRoleService => {
  const mutateRole = async <Change extends AdministratorRoleChange>({
    input,
    action,
    transition,
    projectChange,
  }: {
    readonly input: AdministratorRoleMutationInput
    readonly action: 'administrator.grant' | 'administrator.revoke'
    readonly transition: AdministratorPersistedRoleTransition
    readonly projectChange: (change: StoredAdministratorRoleChange) => Change
  }): Promise<{ readonly change: Change }> => {
    const targetUserId = validateUserId(input.targetUserId)
    const reason = normalizeReason(input.reason)
    const policy = action === 'administrator.grant' ? GRANT_POLICY : REVOKE_POLICY

    return store.runInTransaction(async (transaction) => {
      const authorization = await requireTargetAuthorization({
        context: input.context,
        targetUserId,
        action: 'manage_administrator_role',
        policy,
        transaction: transaction.authorization,
        superAdministrators,
      })
      if (authorization.target.role !== transition.previousRole) throw conflictFailure()

      const applied = await transaction.applyRoleChange({
        subjectUserId: authorization.target.id,
        actorUserId: authorization.actor.id,
        transition,
        reason,
      })
      if (!applied) throw conflictFailure()
      return { change: projectChange(applied.change) }
    })
  }

  return {
    async listAdministrators() {
      const [databaseAdministrators, configuredAdministrators] = await Promise.all([
        store.listDatabaseAdministrators(),
        superAdministrators.resolveExistingConfiguredUsers((orderedUserIds) =>
          store.loadExistingUsersById(orderedUserIds),
        ),
      ])
      const accountsById = new Map<string, AdministratorAccountRecord>()
      for (const account of [...databaseAdministrators, ...configuredAdministrators]) {
        accountsById.set(account.id, account)
      }
      const orderedAccounts = [...accountsById.values()].sort((left, right) => left.id.localeCompare(right.id, 'en'))
      const banStates = await store.loadBanStatesByUserId(orderedAccounts.map((account) => account.id))

      return {
        items: orderedAccounts.map((account) => {
          const banState = banStates.get(account.id)
          if (!banState) throw new Error('Missing evaluated administrator ban state')
          return projectRosterEntry(account, superAdministrators, banState)
        }),
      }
    },

    async listRoleHistory({ subjectUserId: rawSubjectUserId, cursor: rawCursor, limit: rawLimit }) {
      const subjectUserId = validateUserId(rawSubjectUserId)
      const limit = rawLimit ?? ADMIN_ROLE_HISTORY_DEFAULT_LIMIT
      if (!Number.isInteger(limit) || limit < 1 || limit > ADMIN_ROLE_HISTORY_MAX_LIMIT) throw validationFailure()
      const cursor = rawCursor === undefined ? undefined : decodeHistoryCursor(rawCursor, subjectUserId)
      const page = await store.listRoleHistory({ subjectUserId, cursor, limit })
      const lastItem = page.items.at(-1)

      return {
        items: page.items.map(projectRoleChange),
        nextCursor: page.hasMore && lastItem ? encodeHistoryCursor(subjectUserId, lastItem) : null,
      }
    },

    grantAdministrator(input) {
      return mutateRole({
        input,
        action: 'administrator.grant',
        transition: { previousRole: 'user', newRole: 'admin' },
        projectChange: projectGrantChange,
      })
    },

    revokeAdministrator(input) {
      return mutateRole({
        input,
        action: 'administrator.revoke',
        transition: { previousRole: 'admin', newRole: 'user' },
        projectChange: projectRevokeChange,
      })
    },
  }
}

export const createPostgresAdministratorRoleService = ({
  superAdministrators,
  store = createPostgresAdministratorRoleStore(),
}: {
  readonly superAdministrators: SuperAdministratorAllowlist
  readonly store?: AdministratorRoleStore
}): AdministratorRoleService => createAdministratorRoleService({ store, superAdministrators })