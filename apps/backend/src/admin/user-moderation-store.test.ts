import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanDatabase, setupTestServer, teardownTestServer } from '../test/setup.js'
import { createPostgresUserModerationStore } from './user-moderation-store.js'

const insertUser = async (
  database: pg.Pool,
  {
    id,
    name,
    email = `${id}@example.test`,
    role = 'user',
    emailVerified = false,
    profile,
  }: {
    id: string
    name: string
    email?: string
    role?: 'user' | 'admin'
    emailVerified?: boolean
    profile?: string
  },
) => {
  await database.query(
    `INSERT INTO "user" (id, name, email, email_verified, role)
     VALUES ($1, $2, $3, $4, $5::user_role)`,
    [id, name, email, emailVerified, role],
  )
  if (profile !== undefined) {
    await database.query(`INSERT INTO profiles (id, display_name) VALUES ($1, $2)`, [id, profile])
  }
}

const banUser = async (database: pg.Pool, subjectUserId: string, reason: string, expiresAt: Date | null = null) => {
  const event = await database.query<{ readonly id: string }>(
    `INSERT INTO admin_user_ban_history
       (subject_user_id, actor_user_id, action, reason, ban_started_at, expires_at)
     VALUES ($1, 'moderator', 'ban', $2, clock_timestamp(), $3)
     RETURNING id::text`,
    [subjectUserId, reason, expiresAt],
  )
  await database.query(
    `INSERT INTO admin_user_ban_state
       (subject_user_id, established_action, ban_started_at, ban_expires_at,
        ban_reason, actor_user_id, established_by_event_id)
     SELECT subject_user_id, action, ban_started_at, expires_at, reason, actor_user_id, id
     FROM admin_user_ban_history
     WHERE id = $1`,
    [event.rows[0]!.id],
  )
  return event.rows[0]!.id
}

const banUserUntilSoon = async (database: pg.Pool, subjectUserId: string, reason: string) => {
  const event = await database.query<{ readonly id: string; readonly expires_at: Date }>(
    `INSERT INTO admin_user_ban_history
       (subject_user_id, actor_user_id, action, reason, ban_started_at, expires_at)
     VALUES ($1, 'moderator', 'ban', $2, clock_timestamp(), clock_timestamp() + interval '100 milliseconds')
     RETURNING id::text, expires_at`,
    [subjectUserId, reason],
  )
  await database.query(
    `INSERT INTO admin_user_ban_state
       (subject_user_id, established_action, ban_started_at, ban_expires_at,
        ban_reason, actor_user_id, established_by_event_id)
     SELECT subject_user_id, action, ban_started_at, expires_at, reason, actor_user_id, id
     FROM admin_user_ban_history
     WHERE id = $1`,
    [event.rows[0]!.id],
  )
  await database.query(`SELECT pg_sleep(0.15)`)
  return event.rows[0]!
}

describe('PostgreSQL user moderation store', () => {
  const database = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const store = createPostgresUserModerationStore(database)

  beforeAll(setupTestServer)
  afterAll(async () => {
    await database.end()
    await teardownTestServer()
  })
  beforeEach(async () => {
    await cleanDatabase()
    await insertUser(database, { id: 'moderator', name: 'Moderator', role: 'admin' })
  })

  it('searches exact identity fields and only the visible canonical display-name prefix', async () => {
    await insertUser(database, {
      id: 'alpha-user',
      name: 'Hidden Auth Needle',
      email: 'Mixed.Email@Example.Test',
      emailVerified: true,
      profile: '  Ｖｉｓｉｂｌｅ   %   Alias  ',
    })
    await insertUser(database, { id: 'beta-user', name: '  Ｖｉｓｉｂｌｅ   X Alias  ' })
    await insertUser(database, {
      id: 'gamma-user',
      name: 'Normalized Fallback',
      profile: '\u00a0　',
    })
    await insertUser(database, {
      id: 'delta-user',
      name: '\u00a0　',
      profile: '\u00a0　',
    })
    await insertUser(database, { id: 'ALPHA-USER', name: 'Case-distinct ID' })

    const byId = await store.searchUsers({
      filters: { userId: 'alpha-user' },
      limit: 25,
      allowlistedUserIds: [],
    })
    expect(byId.items.map(({ userId }) => userId)).toEqual(['alpha-user'])

    const wrongIdCase = await store.searchUsers({
      filters: { userId: 'Alpha-User' },
      limit: 25,
      allowlistedUserIds: [],
    })
    expect(wrongIdCase.items).toEqual([])

    const byEmail = await store.searchUsers({
      filters: { email: 'mixed.email@example.test' },
      limit: 25,
      allowlistedUserIds: [],
    })
    expect(byEmail.items).toMatchObject([
      {
        userId: 'alpha-user',
        displayName: 'Ｖｉｓｉｂｌｅ   %   Alias',
        email: 'Mixed.Email@Example.Test',
        emailVerified: true,
      },
    ])

    const hiddenName = await store.searchUsers({
      filters: { displayName: 'hidden' },
      limit: 25,
      allowlistedUserIds: [],
    })
    expect(hiddenName.items).toEqual([])

    const literalWildcard = await store.searchUsers({
      filters: { displayName: 'visible % alias' },
      limit: 25,
      allowlistedUserIds: [],
    })
    expect(literalWildcard.items.map(({ userId }) => userId)).toEqual(['alpha-user'])

    const normalizedAuthName = await store.searchUsers({
      filters: { displayName: 'VISIBLE X' },
      limit: 25,
      allowlistedUserIds: [],
    })
    expect(normalizedAuthName.items.map(({ userId }) => userId)).toEqual(['beta-user'])

    const normalizedBlankProfile = await store.searchUsers({
      filters: { displayName: 'NORMALIZED FALL' },
      limit: 25,
      allowlistedUserIds: [],
    })
    expect(normalizedBlankProfile.items).toMatchObject([{ userId: 'gamma-user', displayName: 'Normalized Fallback' }])

    const blankCanonicalNameById = await store.searchUsers({
      filters: { userId: 'delta-user' },
      limit: 25,
      allowlistedUserIds: [],
    })
    expect(blankCanonicalNameById.items).toMatchObject([{ userId: 'delta-user', displayName: 'delta-user' }])

    const userIdIsNotADisplayName = await store.searchUsers({
      filters: { displayName: 'delta' },
      limit: 25,
      allowlistedUserIds: [],
    })
    expect(userIdIsNotADisplayName.items).toEqual([])
  })

  it('applies effective-role, active-ban, and immutable-ID keyset filters with one database clock', async () => {
    await insertUser(database, { id: 'a-user', name: 'A User' })
    await insertUser(database, { id: 'b-admin', name: 'B Admin', role: 'admin' })
    await insertUser(database, { id: 'c-super', name: 'C Super' })
    await insertUser(database, { id: 'd-banned', name: 'D Banned' })
    await insertUser(database, { id: 'e-expired', name: 'E Expired' })
    await insertUser(database, { id: 'f-never-banned', name: 'F Never Banned' })
    await banUser(database, 'd-banned', 'Private active reason', null)
    const expiredEvent = await banUserUntilSoon(database, 'e-expired', 'Private expired reason')

    const administrators = await store.searchUsers({
      filters: { effectiveRole: 'admin' },
      limit: 25,
      allowlistedUserIds: ['c-super'],
    })
    expect(administrators.items.map(({ userId }) => userId)).toEqual(['b-admin', 'moderator'])

    const superAdministrators = await store.searchUsers({
      filters: { effectiveRole: 'super_admin' },
      limit: 25,
      allowlistedUserIds: ['c-super'],
    })
    expect(superAdministrators.items).toMatchObject([{ userId: 'c-super', effectiveRole: 'super_admin' }])

    const activeBans = await store.searchUsers({
      filters: { activeBan: true },
      limit: 25,
      allowlistedUserIds: ['c-super'],
    })
    expect(activeBans.items).toMatchObject([
      {
        userId: 'd-banned',
        banState: { status: 'permanent', expiresAt: null },
      },
    ])

    const expiredActiveBans = await store.searchUsers({
      filters: { userId: 'e-expired', activeBan: true },
      limit: 25,
      allowlistedUserIds: ['c-super'],
    })
    expect(expiredActiveBans.items).toEqual([])

    const expiredInactiveBans = await store.searchUsers({
      filters: { userId: 'e-expired', activeBan: false },
      limit: 25,
      allowlistedUserIds: ['c-super'],
    })
    expect(expiredInactiveBans.items).toMatchObject([
      {
        userId: 'e-expired',
        banState: {
          status: 'expired',
          stateVersion: expiredEvent.id,
          expiresAt: expiredEvent.expires_at,
        },
      },
    ])

    const neverBannedInactive = await store.searchUsers({
      filters: { userId: 'f-never-banned', activeBan: false },
      limit: 25,
      allowlistedUserIds: ['c-super'],
    })
    expect(neverBannedInactive.items).toMatchObject([
      {
        userId: 'f-never-banned',
        banState: { status: 'unbanned', stateVersion: null, expiresAt: null },
      },
    ])

    const expiredDetail = await store.loadUserDetail('e-expired', [])
    expect(expiredDetail).toMatchObject({
      userId: 'e-expired',
      banState: {
        status: 'expired',
        stateVersion: expiredEvent.id,
        reason: 'Private expired reason',
        actorUserId: 'moderator',
        expiresAt: expiredEvent.expires_at,
      },
    })
    expect(expiredDetail!.banState.evaluatedAt.getTime()).toBeGreaterThanOrEqual(expiredEvent.expires_at.getTime())

    const page = await store.searchUsers({
      filters: {},
      afterUserId: 'b-admin',
      limit: 2,
      allowlistedUserIds: ['c-super'],
    })
    expect(page.items.map(({ userId }) => userId)).toEqual(['c-super', 'd-banned'])
    expect(page.hasMore).toBe(true)
    expect(new Set(page.items.map(({ banState }) => banState.evaluatedAt.toISOString())).size).toBe(1)
  })

  it('loads one consistent approved detail projection and never selects authentication secrets', async () => {
    await insertUser(database, {
      id: 'detail-user',
      name: 'Authentication Name',
      email: 'detail@example.test',
      profile: 'Moderation Display',
    })
    await database.query(
      `INSERT INTO account
         (id, account_id, provider_id, user_id, access_token, refresh_token, id_token, password, updated_at)
       VALUES
         ('private-account', 'private-provider-account', 'credential', 'detail-user',
          'private-access-token', 'private-refresh-token', 'private-id-token', 'private-password-hash', clock_timestamp())`,
    )
    await database.query(
      `INSERT INTO passkey
         (id, public_key, user_id, credential_id, counter, device_type, backed_up)
      VALUES ('private-passkey', 'private-public-key', 'detail-user', 'private-credential', 0, 'singleDevice', false)`,
    )
    const stateVersion = await banUser(database, 'detail-user', 'Private detail reason', null)

    const detail = await store.loadUserDetail('detail-user', [])
    expect(detail).toMatchObject({
      userId: 'detail-user',
      displayName: 'Moderation Display',
      email: 'detail@example.test',
      effectiveRole: 'user',
      banState: {
        status: 'permanent',
        stateVersion,
        reason: 'Private detail reason',
        actorUserId: 'moderator',
        expiresAt: null,
      },
    })
    expect(Object.keys(detail ?? {}).sort()).toEqual([
      'banState',
      'displayName',
      'effectiveRole',
      'email',
      'emailVerified',
      'userId',
    ])
    const serialized = JSON.stringify(detail)
    for (const secret of [
      'private-account',
      'private-provider-account',
      'private-access-token',
      'private-refresh-token',
      'private-id-token',
      'private-password-hash',
      'private-passkey',
      'private-public-key',
      'private-credential',
    ]) {
      expect(serialized).not.toContain(secret)
    }
    await expect(store.loadUserDetail('missing-user', [])).resolves.toBeUndefined()
  })
})