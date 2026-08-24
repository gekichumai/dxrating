import type { Pool, PoolClient } from 'pg'
import { pool } from '../db/index.js'
import type { AdminMutationAuthorizationTransaction } from './authorization.js'
import { createPostgresAdminMutationAuthorizationTransaction } from './mutation-authorization-store.js'
import type { PersistedUserRole } from './role-policy.js'
import { revokeAllUserSessionsInTransaction } from './session-transitions.js'
import { loadPostgresUserBanStates, type EvaluatedUserBanState } from './user-ban-store.js'

export type AdministratorAccountRecord = {
  readonly id: string
  readonly displayName: string
  readonly email: string
  readonly emailVerified: boolean
  readonly persistedRole: PersistedUserRole
}

export type StoredAdministratorRoleChange = {
  readonly id: string
  readonly subjectUserId: string
  readonly actorUserId: string
  readonly previousRole: PersistedUserRole
  readonly newRole: PersistedUserRole
  readonly reason: string
  readonly changedAt: Date
}

export type StoredAdministratorRoleHistoryCursor = {
  readonly id: string
  readonly changedAt: Date
}

export type StoredAdministratorRoleHistoryPage = {
  readonly items: readonly StoredAdministratorRoleChange[]
  readonly hasMore: boolean
}

export type AppliedAdministratorRoleChange = {
  readonly change: StoredAdministratorRoleChange
  readonly authorizationNotBefore: Date
  readonly revokedSessionCount: number
}

export type AdministratorPersistedRoleTransition =
  | { readonly previousRole: 'user'; readonly newRole: 'admin' }
  | { readonly previousRole: 'admin'; readonly newRole: 'user' }

export type AdministratorRoleTransaction = {
  readonly authorization: AdminMutationAuthorizationTransaction
  /**
   * The only production persistence operation that changes a user role. A
   * successful update always appends its history row before returning.
   */
  applyRoleChange(input: {
    readonly subjectUserId: string
    readonly actorUserId: string
    readonly transition: AdministratorPersistedRoleTransition
    readonly reason: string
  }): Promise<AppliedAdministratorRoleChange | undefined>
}

export interface AdministratorRoleStore {
  listDatabaseAdministrators(): Promise<readonly AdministratorAccountRecord[]>
  loadExistingUsersById(orderedUserIds: readonly string[]): Promise<readonly AdministratorAccountRecord[]>
  loadBanStatesByUserId(orderedUserIds: readonly string[]): Promise<ReadonlyMap<string, EvaluatedUserBanState>>
  listRoleHistory(input: {
    readonly subjectUserId: string
    readonly cursor?: StoredAdministratorRoleHistoryCursor
    readonly limit: number
  }): Promise<StoredAdministratorRoleHistoryPage>
  runInTransaction<Result>(operation: (transaction: AdministratorRoleTransaction) => Promise<Result>): Promise<Result>
}

type AdministratorAccountRow = {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly email_verified: boolean
  readonly role: string
}

type AdministratorRoleChangeRow = {
  readonly id: string
  readonly subject_user_id: string
  readonly actor_user_id: string
  readonly previous_role: string
  readonly new_role: string
  readonly reason: string
  readonly created_at: Date
}

const parsePersistedRole = (role: string): PersistedUserRole => {
  if (role === 'user' || role === 'admin') return role
  throw new Error('Invalid persisted administrator role')
}

const projectAccount = (row: AdministratorAccountRow): AdministratorAccountRecord => ({
  id: row.id,
  displayName: row.name,
  email: row.email,
  emailVerified: row.email_verified,
  persistedRole: parsePersistedRole(row.role),
})

const projectRoleChange = (row: AdministratorRoleChangeRow): StoredAdministratorRoleChange => ({
  id: row.id,
  subjectUserId: row.subject_user_id,
  actorUserId: row.actor_user_id,
  previousRole: parsePersistedRole(row.previous_role),
  newRole: parsePersistedRole(row.new_role),
  reason: row.reason,
  changedAt: row.created_at,
})

const applyRoleChange = async (
  transaction: PoolClient,
  input: {
    readonly subjectUserId: string
    readonly actorUserId: string
    readonly transition: AdministratorPersistedRoleTransition
    readonly reason: string
  },
): Promise<AppliedAdministratorRoleChange | undefined> => {
  const updated = await transaction.query<{
    readonly id: string
    readonly admin_authorization_not_before: Date
  }>(
    `
      /* administrator-role-store:apply-role-change */
      UPDATE "user"
      SET
        role = $2::user_role,
        admin_authorization_not_before = clock_timestamp(),
        updated_at = clock_timestamp()
      WHERE id = $1 AND role = $3::user_role
      RETURNING id, admin_authorization_not_before
    `,
    [input.subjectUserId, input.transition.newRole, input.transition.previousRole],
  )
  const updatedUser = updated.rows[0]
  if (!updatedUser) return undefined

  const revokedSessionCount =
    input.transition.newRole === 'user'
      ? (await revokeAllUserSessionsInTransaction(transaction, input.subjectUserId)).revokedSessionCount
      : 0

  const inserted = await transaction.query<AdministratorRoleChangeRow>(
    `
      INSERT INTO admin_role_change_history (
        subject_user_id,
        actor_user_id,
        previous_role,
        new_role,
        reason
      )
      VALUES ($1, $2, $3::user_role, $4::user_role, $5)
      RETURNING
        id::text,
        subject_user_id,
        actor_user_id,
        previous_role::text,
        new_role::text,
        reason,
        created_at
    `,
    [input.subjectUserId, input.actorUserId, input.transition.previousRole, input.transition.newRole, input.reason],
  )
  const historyRow = inserted.rows[0]
  if (!historyRow) throw new Error('Administrator role history insertion returned no row')

  return {
    change: projectRoleChange(historyRow),
    authorizationNotBefore: updatedUser.admin_authorization_not_before,
    revokedSessionCount,
  }
}

const createTransaction = (transaction: PoolClient): AdministratorRoleTransaction => ({
  authorization: createPostgresAdminMutationAuthorizationTransaction(transaction),
  applyRoleChange: (input) => applyRoleChange(transaction, input),
})

export const createPostgresAdministratorRoleStore = (database: Pool = pool): AdministratorRoleStore => ({
  async listDatabaseAdministrators() {
    const result = await database.query<AdministratorAccountRow>(
      `
        SELECT
          u.id,
          COALESCE(
            NULLIF(left(btrim(p.display_name), 255), ''),
            NULLIF(left(btrim(u.name), 255), ''),
            left(u.id, 255)
          ) AS name,
          u.email,
          u.email_verified,
          u.role::text
        FROM "user" u
        LEFT JOIN profiles p ON p.id = u.id
        WHERE u.role = 'admin'
        ORDER BY u.id
      `,
    )
    return result.rows.map(projectAccount)
  },

  async loadExistingUsersById(orderedUserIds) {
    if (orderedUserIds.length === 0) return []
    const result = await database.query<AdministratorAccountRow>(
      `
        SELECT
          u.id,
          COALESCE(
            NULLIF(left(btrim(p.display_name), 255), ''),
            NULLIF(left(btrim(u.name), 255), ''),
            left(u.id, 255)
          ) AS name,
          u.email,
          u.email_verified,
          u.role::text
        FROM "user" u
        LEFT JOIN profiles p ON p.id = u.id
        WHERE u.id = ANY($1::text[])
        ORDER BY u.id
      `,
      [[...orderedUserIds]],
    )
    return result.rows.map(projectAccount)
  },

  loadBanStatesByUserId(orderedUserIds) {
    return loadPostgresUserBanStates(database, orderedUserIds)
  },

  async listRoleHistory({ subjectUserId, cursor, limit }) {
    const parameters: unknown[] = [subjectUserId]
    const cursorPredicate = cursor
      ? (() => {
          parameters.push(cursor.changedAt, cursor.id)
          return 'AND (created_at, id) < ($2::timestamptz, $3::bigint)'
        })()
      : ''
    parameters.push(limit + 1)
    const limitParameter = `$${parameters.length}`
    const result = await database.query<AdministratorRoleChangeRow>(
      `
        SELECT
          id::text,
          subject_user_id,
          actor_user_id,
          previous_role::text,
          new_role::text,
          reason,
          created_at
        FROM admin_role_change_history
        WHERE subject_user_id = $1
        ${cursorPredicate}
        ORDER BY created_at DESC, id DESC
        LIMIT ${limitParameter}
      `,
      parameters,
    )
    return {
      items: result.rows.slice(0, limit).map(projectRoleChange),
      hasMore: result.rows.length > limit,
    }
  },

  async runInTransaction(operation) {
    const transaction = await database.connect()
    try {
      await transaction.query('BEGIN')
      const result = await operation(createTransaction(transaction))
      await transaction.query('COMMIT')
      return result
    } catch (error) {
      try {
        await transaction.query('ROLLBACK')
      } catch {
        // Preserve the operation or commit failure.
      }
      throw error
    } finally {
      transaction.release()
    }
  },
})