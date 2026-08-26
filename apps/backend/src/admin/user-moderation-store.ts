import type { Pool } from 'pg'
import { pool } from '../db/index.js'
import type { PersistedUserRole } from './role-policy.js'

export type UserModerationEffectiveRole = PersistedUserRole | 'super_admin'
export type UserModerationBanStatus = 'unbanned' | 'expired' | 'temporary' | 'permanent'

export type StoredUserModerationBanState = {
  readonly status: UserModerationBanStatus
  readonly stateVersion: string | null
  readonly reason: string | null
  readonly actorUserId: string | null
  readonly banStartedAt: Date | null
  readonly expiresAt: Date | null
  readonly evaluatedAt: Date
}

export type StoredUserModerationSearchItem = {
  readonly userId: string
  readonly displayName: string
  readonly email: string
  readonly emailVerified: boolean
  readonly effectiveRole: UserModerationEffectiveRole
  readonly banState: Omit<StoredUserModerationBanState, 'reason' | 'actorUserId'>
}

export type StoredUserModerationDetail = {
  readonly userId: string
  readonly displayName: string
  readonly email: string
  readonly emailVerified: boolean
  readonly effectiveRole: UserModerationEffectiveRole
  readonly banState: StoredUserModerationBanState
}

export type UserModerationSearchFilters = {
  readonly userId?: string
  readonly email?: string
  readonly displayName?: string
  readonly effectiveRole?: UserModerationEffectiveRole
  readonly activeBan?: boolean
}

export type UserModerationSearchStoreInput = {
  readonly filters: UserModerationSearchFilters
  readonly afterUserId?: string
  readonly limit: number
  readonly allowlistedUserIds: readonly string[]
}

export type StoredUserModerationSearchPage = {
  readonly items: readonly StoredUserModerationSearchItem[]
  readonly hasMore: boolean
}

export interface UserModerationStore {
  loadExistingUsersById(orderedUserIds: readonly string[]): Promise<readonly { readonly id: string }[]>
  searchUsers(input: UserModerationSearchStoreInput): Promise<StoredUserModerationSearchPage>
  loadUserDetail(userId: string, allowlistedUserIds: readonly string[]): Promise<StoredUserModerationDetail | undefined>
}

type SearchRow = {
  readonly user_id: string
  readonly display_name: string
  readonly email: string
  readonly email_verified: boolean
  readonly effective_role: string
  readonly state_version: string | null
  readonly ban_started_at: Date | null
  readonly expires_at: Date | null
  readonly evaluated_at: Date
  readonly ban_status: string
}

type DetailRow = SearchRow & {
  readonly reason: string | null
  readonly actor_user_id: string | null
}

const parseEffectiveRole = (role: string): UserModerationEffectiveRole => {
  if (role === 'user' || role === 'admin' || role === 'super_admin') return role
  throw new Error('Invalid stored user moderation effective role')
}

const parseBanStatus = (status: string): UserModerationBanStatus => {
  if (status === 'unbanned' || status === 'expired' || status === 'temporary' || status === 'permanent') return status
  throw new Error('Invalid stored user moderation ban status')
}

const projectBanState = (
  row: SearchRow,
  privateFields?: Pick<DetailRow, 'reason' | 'actor_user_id'>,
): StoredUserModerationBanState => {
  const status = parseBanStatus(row.ban_status)
  const state = {
    status,
    stateVersion: row.state_version,
    reason: privateFields?.reason ?? null,
    actorUserId: privateFields?.actor_user_id ?? null,
    banStartedAt: row.ban_started_at,
    expiresAt: row.expires_at,
    evaluatedAt: row.evaluated_at,
  }

  const hasVersion = state.stateVersion !== null
  const hasVersionAndActor = hasVersion && state.actorUserId !== null
  if (privateFields && (state.stateVersion === null) !== (state.actorUserId === null)) {
    throw new Error('Inconsistent stored user moderation state identity')
  }
  if (status === 'temporary' || status === 'expired') {
    if (
      !hasVersion ||
      !state.banStartedAt ||
      !state.expiresAt ||
      (privateFields && (!hasVersionAndActor || !state.reason))
    ) {
      throw new Error('Inconsistent stored temporary user moderation state')
    }
  } else if (status === 'permanent') {
    if (
      !hasVersion ||
      !state.banStartedAt ||
      state.expiresAt !== null ||
      (privateFields && (!hasVersionAndActor || !state.reason))
    ) {
      throw new Error('Inconsistent stored permanent user moderation state')
    }
  } else if (state.banStartedAt !== null || state.expiresAt !== null || (privateFields && state.reason !== null)) {
    throw new Error('Inconsistent stored unbanned user moderation state')
  }

  return state
}

const projectSearchItem = (row: SearchRow): StoredUserModerationSearchItem => {
  const state = projectBanState(row)
  return {
    userId: row.user_id,
    displayName: row.display_name,
    email: row.email,
    emailVerified: row.email_verified,
    effectiveRole: parseEffectiveRole(row.effective_role),
    banState: {
      status: state.status,
      stateVersion: state.stateVersion,
      banStartedAt: state.banStartedAt,
      expiresAt: state.expiresAt,
      evaluatedAt: state.evaluatedAt,
    },
  }
}

const projectDetail = (row: DetailRow): StoredUserModerationDetail => ({
  userId: row.user_id,
  displayName: row.display_name,
  email: row.email,
  emailVerified: row.email_verified,
  effectiveRole: parseEffectiveRole(row.effective_role),
  banState: projectBanState(row, row),
})

const escapeLikePrefix = (value: string) => `${value.replace(/[\\%_]/g, '\\$&')}%`

type ParameterBuilder = {
  readonly parameters: unknown[]
  add(value: unknown, cast?: string): string
}

const createParameterBuilder = (): ParameterBuilder => {
  const parameters: unknown[] = []
  return {
    parameters,
    add(value, cast = '') {
      parameters.push(value)
      return `$${parameters.length}${cast}`
    },
  }
}

const currentStateColumns = `
  state.established_by_event_id::text AS state_version,
  state.ban_started_at,
  state.ban_expires_at AS expires_at,
  evaluation_clock.evaluated_at,
  CASE
    WHEN state.established_action IS DISTINCT FROM 'ban' THEN 'unbanned'
    WHEN state.ban_expires_at IS NOT NULL
      AND state.ban_expires_at <= evaluation_clock.evaluated_at THEN 'expired'
    WHEN state.ban_expires_at IS NULL THEN 'permanent'
    ELSE 'temporary'
  END AS ban_status`

const normalizedDisplaySearchText = (expression: string): string => `btrim(regexp_replace(
  normalize(${expression}, NFKC),
  '[[:space:]]+',
  ' ',
  'g'
))`

const normalizedProfileDisplayName = normalizedDisplaySearchText('profile.display_name')
const normalizedUserName = normalizedDisplaySearchText('users.name')
const canonicalDisplayName = `COALESCE(
  CASE WHEN NULLIF(${normalizedProfileDisplayName}, '') IS NOT NULL
    THEN left(btrim(profile.display_name), 255) END,
  CASE WHEN NULLIF(${normalizedUserName}, '') IS NOT NULL
    THEN left(btrim(users.name), 255) END,
  left(users.id, 255)
)`

export const createPostgresUserModerationStore = (database: Pool = pool): UserModerationStore => ({
  async loadExistingUsersById(orderedUserIds) {
    if (orderedUserIds.length === 0) return []
    const result = await database.query<{ readonly id: string }>(
      `SELECT id FROM "user" WHERE id = ANY($1::text[]) ORDER BY id`,
      [[...orderedUserIds]],
    )
    return result.rows
  },

  async searchUsers({ filters, afterUserId, limit, allowlistedUserIds }) {
    const parameter = createParameterBuilder()
    const allowlisted = parameter.add([...allowlistedUserIds], '::text[]')
    const predicates: string[] = []

    if (afterUserId !== undefined) predicates.push(`users.id > ${parameter.add(afterUserId)}`)
    if (filters.userId !== undefined) predicates.push(`users.id = ${parameter.add(filters.userId)}`)
    if (filters.email !== undefined) {
      predicates.push(`lower(btrim(normalize(users.email, NFKC))) = ${parameter.add(filters.email)}`)
    }

    let displayNameCandidates = ''
    let displayNameJoin = ''
    if (filters.displayName !== undefined) {
      const pattern = parameter.add(escapeLikePrefix(filters.displayName))
      const normalizedProfileMatch = normalizedDisplaySearchText('profile_match.display_name')
      const normalizedAuthMatch = normalizedDisplaySearchText('auth_match.name')
      const normalizedHiddenProfile = normalizedDisplaySearchText('hidden_profile.display_name')
      displayNameCandidates = `,
        matching_display_names AS MATERIALIZED (
          SELECT profile_match.id
          FROM profiles profile_match
          WHERE NULLIF(${normalizedProfileMatch}, '') IS NOT NULL
            AND lower(${normalizedProfileMatch}) LIKE lower(${pattern}) ESCAPE '\\'

          UNION ALL

          SELECT auth_match.id
          FROM "user" auth_match
          WHERE NULLIF(${normalizedAuthMatch}, '') IS NOT NULL
            AND lower(${normalizedAuthMatch}) LIKE lower(${pattern}) ESCAPE '\\'
            AND NOT EXISTS (
              SELECT 1
              FROM profiles hidden_profile
              WHERE hidden_profile.id = auth_match.id
                AND NULLIF(${normalizedHiddenProfile}, '') IS NOT NULL
            )
        )`
      displayNameJoin = 'INNER JOIN matching_display_names display_match ON display_match.id = users.id'
    }

    if (filters.effectiveRole === 'super_admin') {
      predicates.push('allowlisted.id IS NOT NULL')
    } else if (filters.effectiveRole) {
      predicates.push(`allowlisted.id IS NULL AND users.role = ${parameter.add(filters.effectiveRole)}::user_role`)
    }

    const activeBanPredicate = `state.established_action = 'ban'
      AND (state.ban_expires_at IS NULL OR state.ban_expires_at > evaluation_clock.evaluated_at)`
    const stateJoin =
      filters.activeBan === true
        ? `INNER JOIN admin_user_ban_state state
            ON state.subject_user_id = users.id
           AND state.established_action = 'ban'
           AND (state.ban_expires_at IS NULL OR state.ban_expires_at > evaluation_clock.evaluated_at)`
        : 'LEFT JOIN admin_user_ban_state state ON state.subject_user_id = users.id'
    if (filters.activeBan === false) predicates.push(`NOT COALESCE(${activeBanPredicate}, FALSE)`)

    const pageLimit = parameter.add(limit + 1, '::integer')
    const result = await database.query<SearchRow>(
      `
        /* user-moderation-store:search */
        WITH
          evaluation_clock AS MATERIALIZED (
            SELECT clock_timestamp()::timestamptz(3) AS evaluated_at
          ),
          allowlisted AS MATERIALIZED (
            SELECT id FROM unnest(${allowlisted}) AS configured(id)
          )
          ${displayNameCandidates}
        SELECT
          users.id AS user_id,
          ${canonicalDisplayName} AS display_name,
          users.email,
          users.email_verified,
          CASE WHEN allowlisted.id IS NULL THEN users.role::text ELSE 'super_admin' END AS effective_role,
          ${currentStateColumns}
        FROM "user" users
        CROSS JOIN evaluation_clock
        LEFT JOIN profiles profile ON profile.id = users.id
        LEFT JOIN allowlisted ON allowlisted.id = users.id
        ${displayNameJoin}
        ${stateJoin}
        ${predicates.length ? `WHERE ${predicates.join('\n          AND ')}` : ''}
        ORDER BY users.id ASC
        LIMIT ${pageLimit}
      `,
      parameter.parameters,
    )

    return {
      items: result.rows.slice(0, limit).map(projectSearchItem),
      hasMore: result.rows.length > limit,
    }
  },

  async loadUserDetail(userId, allowlistedUserIds) {
    const result = await database.query<DetailRow>(
      `
        /* user-moderation-store:detail */
        WITH
          evaluation_clock AS MATERIALIZED (
            SELECT clock_timestamp()::timestamptz(3) AS evaluated_at
          ),
          allowlisted AS MATERIALIZED (
            SELECT id FROM unnest($2::text[]) AS configured(id)
          )
        SELECT
          users.id AS user_id,
          ${canonicalDisplayName} AS display_name,
          users.email,
          users.email_verified,
          CASE WHEN allowlisted.id IS NULL THEN users.role::text ELSE 'super_admin' END AS effective_role,
          ${currentStateColumns},
          state.ban_reason AS reason,
          state.actor_user_id
        FROM "user" users
        CROSS JOIN evaluation_clock
        LEFT JOIN profiles profile ON profile.id = users.id
        LEFT JOIN allowlisted ON allowlisted.id = users.id
        LEFT JOIN admin_user_ban_state state ON state.subject_user_id = users.id
        WHERE users.id = $1
        LIMIT 1
      `,
      [userId, [...allowlistedUserIds]],
    )
    const row = result.rows[0]
    return row ? projectDetail(row) : undefined
  },
})