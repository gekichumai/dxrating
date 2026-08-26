import pg, { type QueryResultRow } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  COMMENT_FEED_PREVIEW_MAX_LENGTH,
  CommentContextStoreFailure,
  createPostgresCommentContextStore,
  type CommentContextDatabase,
} from './comment-context-store.js'
import { cleanDatabase, setupTestServer, teardownTestServer } from '../test/setup.js'

type QueryHandler = (
  text: string,
  values: unknown[],
) => readonly Record<string, unknown>[] | Promise<readonly Record<string, unknown>[]>

const fakeDatabase = (handler: QueryHandler) => {
  const calls: Array<{ readonly text: string; readonly values: unknown[] }> = []
  const database: CommentContextDatabase = {
    async query<Row extends QueryResultRow>(text: string, values: unknown[] = []) {
      calls.push({ text, values })
      const rows = await handler(text, values)
      return { rows: rows as Row[] }
    },
  }
  return { calls, database }
}

const recentRow = (overrides: Record<string, unknown> = {}) => ({
  comment_id: '42',
  parent_id: null,
  root_id: '42',
  ancestry_cycle: false,
  ancestry_depth_limited: false,
  created_at_utc: '2026-08-24T12:34:56.123456Z',
  status: 'active',
  preview: 'A bounded preview',
  preview_truncated: false,
  author_user_id: 'author-user',
  display_name: 'Visible Author',
  persisted_role: 'user',
  currently_banned: false,
  song_id: 'legacy-song',
  sheet_type: 'dx',
  sheet_difficulty: 'master',
  ...overrides,
})

const chartRow = (overrides: Record<string, unknown> = {}) => ({
  ordinal: 1,
  requested_song_id: 'legacy-song',
  requested_sheet_type: 'dx',
  requested_sheet_difficulty: 'master',
  stable_song_id: 'dsng_23456789ab',
  stable_chart_id: 'dsht_23456789ab',
  song_title: 'Catalog title',
  song_artist: 'Catalog artist',
  song_retired_at: null,
  chart_retired_at: null,
  active_chart_id: 'dsht_23456789ab',
  publication_channel: 'production-v1',
  publication_catalog_run_id: '71',
  publication_revision: '9',
  publication_published_at: '2026-08-24T10:11:12.654321Z',
  ...overrides,
})

const threadRow = (overrides: Record<string, unknown> = {}) => ({
  selected_exists: true,
  resolved_root_id: '10',
  high_water_id: '99',
  ancestor_cycle: false,
  ancestor_depth_limited: false,
  descendant_cycle: false,
  descendant_depth_limited: false,
  cursor_valid: true,
  comment_id: '10',
  parent_id: null,
  depth: 0,
  created_at_utc: '2026-08-24T10:00:00.000001Z',
  original_body: 'Privileged immutable original',
  author_user_id: 'thread-author',
  display_name: 'Thread Author',
  persisted_role: 'admin',
  currently_banned: true,
  song_id: 'legacy-song',
  sheet_type: 'dx',
  sheet_difficulty: 'master',
  established_action: null,
  state_version: null,
  state_actor_user_id: null,
  moderated_at_utc: null,
  deletion_reason: null,
  ...overrides,
})

describe('PostgreSQL administrator comment context store', () => {
  it('resolves a stable chart through every historical legacy mapping without requiring current membership', async () => {
    const { calls, database } = fakeDatabase(() => [
      {
        stable_song_id: 'dsng_23456789ab',
        stable_chart_id: 'dsht_23456789ab',
        legacy_song_id: 'legacy-current',
        mapped_song_ids: ['legacy-retired', 'legacy-current'],
        sheet_type: 'dx',
        sheet_difficulty: 'master',
      },
    ])
    const store = createPostgresCommentContextStore(database)

    await expect(store.resolveStableChartFilter('dsht_23456789ab')).resolves.toEqual({
      stableSongId: 'dsng_23456789ab',
      stableChartId: 'dsht_23456789ab',
      storedSongIds: ['legacy-current', 'legacy-retired'],
      sheetType: 'dx',
      sheetDifficulty: 'master',
    })
    expect(calls).toHaveLength(1)
    expect(calls[0].text).toContain('comment-context-store:resolve-stable-chart-filter')
    expect(calls[0].text).toContain("mapping.source_id = 'legacy_dxdata'")
    expect(calls[0].text).not.toMatch(/mapping\.active\s*=/)
    expect(calls[0].values).toEqual(['dsht_23456789ab'])
  })

  it('distinguishes a missing stable chart from an unavailable producer-owned catalog', async () => {
    const missing = createPostgresCommentContextStore(fakeDatabase(() => []).database)
    await expect(missing.resolveStableChartFilter('dsht_23456789ab')).resolves.toBeUndefined()

    const unavailable = createPostgresCommentContextStore(
      fakeDatabase(() => {
        throw new Error('relation dxdata.canonical_sheets does not exist')
      }).database,
    )
    await expect(unavailable.resolveStableChartFilter('dsht_23456789ab')).rejects.toMatchObject({
      code: 'CATALOG_UNAVAILABLE',
    })
  })

  it('loads a newest-first page and all row projections in exactly two queries without losing cursor microseconds', async () => {
    const third = recentRow({
      comment_id: '40',
      root_id: '40',
      created_at_utc: '2026-08-24T12:34:55.999999Z',
    })
    const { calls, database } = fakeDatabase((text) => {
      if (text.includes('list-recent')) {
        return [
          recentRow(),
          recentRow({
            comment_id: '41',
            parent_id: '42',
            root_id: '42',
            status: 'deleted',
            preview: '[deleted]',
            preview_truncated: false,
            song_id: 'orphaned-legacy-song',
            sheet_type: 'std',
            sheet_difficulty: 'expert',
          }),
          third,
        ]
      }
      if (text.includes('resolve-chart-contexts')) {
        return [
          chartRow(),
          chartRow({
            ordinal: 2,
            requested_song_id: 'orphaned-legacy-song',
            requested_sheet_type: 'std',
            requested_sheet_difficulty: 'expert',
            stable_song_id: null,
            stable_chart_id: null,
            song_title: null,
            song_artist: null,
            active_chart_id: null,
          }),
        ]
      }
      throw new Error(`Unexpected query: ${text}`)
    })
    const store = createPostgresCommentContextStore(database)

    const page = await store.listRecentComments({
      filters: {
        authorUserId: 'author-user',
        chart: {
          storedSongIds: ['legacy-song', 'legacy-song-retired'],
          sheetType: 'dx',
          sheetDifficulty: 'master',
        },
        status: 'active',
        createdAtFrom: '2026-08-01T00:00:00.000Z',
        createdAtBefore: '2026-09-01T00:00:00.000Z',
      },
      cursor: { createdAt: '2026-08-24T12:34:56.123456Z', id: '43' },
      limit: 2,
    })

    expect(calls).toHaveLength(2)
    expect(page.hasMore).toBe(true)
    expect(page.activePublication).toEqual({
      channel: 'production-v1',
      catalogRunId: '71',
      revision: '9',
      publishedAt: '2026-08-24T10:11:12.654321Z',
    })
    expect(page.items).toMatchObject([
      {
        id: '42',
        rootId: '42',
        createdAt: '2026-08-24T12:34:56.123456Z',
        status: 'active',
        preview: 'A bounded preview',
        author: { persistedRole: 'user', currentlyBanned: false },
        chart: {
          availability: 'current',
          stableSongId: 'dsng_23456789ab',
          stableChartId: 'dsht_23456789ab',
        },
      },
      {
        id: '41',
        parentId: '42',
        rootId: '42',
        status: 'deleted',
        preview: '[deleted]',
        chart: { availability: 'unresolved', stableSongId: null, stableChartId: null },
      },
    ])

    const feed = calls[0]
    expect(feed.text).toContain('comment-context-store:list-recent')
    expect(feed.text).toContain('ORDER BY comment.created_at DESC NULLS LAST, comment.id DESC NULLS LAST')
    expect(feed.text).toContain('(comment.created_at, comment.id) <')
    expect(feed.text).toContain(`left(comment.content, 480)`)
    expect(feed.text).toContain(`left(btrim(regexp_replace`)
    expect(feed.text).toContain(`${COMMENT_FEED_PREVIEW_MAX_LENGTH}`)
    expect(feed.text).not.toMatch(/\bOFFSET\b/i)
    expect(feed.text).not.toMatch(
      /ban_reason|deletion_reason|request_correlation_id|access_token|refresh_token|ip_address/i,
    )
    expect(feed.values).toContain('2026-08-24T12:34:56.123456Z')
    expect(feed.values.at(-2)).toBe('43')
    expect(feed.values.at(-1)).toBe(3)

    const catalog = calls[1]
    expect(catalog.text).toContain('comment-context-store:resolve-chart-contexts')
    expect(catalog.values[0]).toEqual(['legacy-song', 'orphaned-legacy-song'])
    expect(catalog.values[1]).toEqual(['dx', 'std'])
    expect(catalog.values[2]).toEqual(['master', 'expert'])
  })

  it('drives deleted pages from the projected creation-time index with an explicit legacy fallback', async () => {
    const { calls, database } = fakeDatabase((text) => {
      if (text.includes('list-recent')) {
        return [
          recentRow({
            status: 'deleted',
            preview: '[deleted]',
            preview_truncated: false,
          }),
        ]
      }
      if (text.includes('resolve-chart-contexts')) return [chartRow()]
      throw new Error(`Unexpected query: ${text}`)
    })
    const store = createPostgresCommentContextStore(database)

    const page = await store.listRecentComments({
      filters: {
        status: 'deleted',
        createdAtFrom: '2026-08-01T00:00:00.000Z',
        createdAtBefore: '2026-09-01T00:00:00.000Z',
      },
      cursor: { createdAt: '2026-08-24T12:34:56.123456Z', id: '43' },
      limit: 25,
    })

    expect(page.items[0]).toMatchObject({
      status: 'deleted',
      preview: '[deleted]',
      previewTruncated: false,
    })
    expect(calls).toHaveLength(2)
    const feed = calls[0]
    expect(feed.text).toContain('FROM admin_comment_moderation_state moderation')
    expect(feed.text).toContain(`moderation.established_action = 'delete'`)
    expect(feed.text).toContain('moderation.comment_created_at IS NOT NULL')
    expect(feed.text).toContain('FROM comments comment\n          CROSS JOIN LATERAL')
    expect(feed.text).toContain('FROM admin_comment_moderation_state legacy_moderation')
    expect(feed.text).toContain('legacy_deleted.comment_created_at IS NULL')
    expect(feed.text).toContain(
      'ORDER BY moderation.comment_created_at DESC NULLS LAST, moderation.comment_id DESC NULLS LAST',
    )
    expect(feed.text).toContain('(moderation.comment_created_at, moderation.comment_id) <')
    expect(feed.text).toContain('ORDER BY comment.created_at DESC NULLS LAST, comment.id DESC NULLS LAST')
    expect(feed.text).toContain('(comment.created_at, comment.id) <')
    expect(feed.text).toContain("'[deleted]'::text AS preview")
    expect(feed.text).not.toContain('comment.content')
    expect(feed.text).not.toContain(
      'LEFT JOIN admin_comment_moderation_state moderation ON moderation.comment_id = comment.id',
    )
    expect(feed.values).toEqual([
      '2026-08-01T00:00:00.000Z',
      '2026-09-01T00:00:00.000Z',
      '2026-08-24T12:34:56.123456Z',
      '43',
      26,
    ])
  })

  it('degrades every row to explicit catalog-unavailable context when the optional batch lookup fails', async () => {
    const { calls, database } = fakeDatabase((text) => {
      if (text.includes('list-recent')) return [recentRow()]
      throw new Error('catalog publication is offline')
    })
    const store = createPostgresCommentContextStore(database)

    const page = await store.listRecentComments({ filters: {}, limit: 25 })

    expect(calls).toHaveLength(2)
    expect(page.activePublication).toBeNull()
    expect(page.items[0].chart).toEqual({
      songId: 'legacy-song',
      sheetType: 'dx',
      sheetDifficulty: 'master',
      availability: 'catalog_unavailable',
      stableSongId: null,
      stableChartId: null,
      songTitle: null,
      songArtist: null,
      songRetiredAt: null,
      chartRetiredAt: null,
    })
  })

  it('returns one deterministic privileged thread segment and preserves independent high-water continuation', async () => {
    const { calls, database } = fakeDatabase(() => [
      threadRow(),
      threadRow({
        comment_id: '11',
        parent_id: '10',
        depth: 1,
        created_at_utc: '2026-08-24T10:00:00.000002Z',
        original_body: 'Deleted immutable original',
        established_action: 'delete',
        state_version: '7',
        state_actor_user_id: 'moderator',
        moderated_at_utc: '2026-08-24T11:00:00.123000Z',
        deletion_reason: 'Private deletion reason',
      }),
    ])
    const store = createPostgresCommentContextStore(database)

    const segment = await store.loadCommentThreadSegment({
      commentId: '11',
      cursor: { rootId: '10', highWaterId: '99', lastCommentId: '9' },
      limit: 1,
    })

    expect(calls).toHaveLength(1)
    expect(calls[0].values).toEqual(['11', '99', '9', '10', 2])
    expect(calls[0].text).toContain('comment-context-store:load-thread-segment')
    expect(calls[0].text).toContain('ORDER BY thread.order_path')
    expect(calls[0].text).toContain('parent.order_path ||')
    expect(calls[0].text).toContain('child.id <= high_water.id')
    expect(calls[0].text).not.toMatch(/\bOFFSET\b/i)
    expect(segment).toMatchObject({
      rootId: '10',
      highWaterId: '99',
      hasMore: true,
      items: [
        {
          id: '10',
          rootId: '10',
          depth: 0,
          createdAt: '2026-08-24T10:00:00.000001Z',
          originalBody: 'Privileged immutable original',
          author: { persistedRole: 'admin', currentlyBanned: true },
          state: {
            status: 'active',
            stateVersion: null,
            actorUserId: null,
            moderatedAt: null,
            reason: null,
          },
        },
      ],
    })
  })

  it('fails explicitly for a cyclic thread or a continuation bound to another root', async () => {
    const cyclic = createPostgresCommentContextStore(fakeDatabase(() => [threadRow({ ancestor_cycle: true })]).database)
    await expect(cyclic.loadCommentThreadSegment({ commentId: '10', limit: 100 })).rejects.toMatchObject({
      code: 'THREAD_INTEGRITY',
    })

    const wrongCursor = createPostgresCommentContextStore(
      fakeDatabase(() => [threadRow({ cursor_valid: false })]).database,
    )
    await expect(
      wrongCursor.loadCommentThreadSegment({
        commentId: '10',
        cursor: { rootId: '8', highWaterId: '99', lastCommentId: '9' },
        limit: 100,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_THREAD_CURSOR' })
  })

  it('returns missing comments without attempting to project nullable privileged fields', async () => {
    const store = createPostgresCommentContextStore(
      fakeDatabase(() => [
        threadRow({
          selected_exists: false,
          resolved_root_id: null,
          high_water_id: null,
          comment_id: null,
          created_at_utc: null,
          original_body: null,
          author_user_id: null,
          display_name: null,
          persisted_role: null,
          currently_banned: null,
          song_id: null,
          sheet_type: null,
          sheet_difficulty: null,
        }),
      ]).database,
    )

    await expect(store.loadCommentThreadSegment({ commentId: '404', limit: 100 })).resolves.toBeUndefined()
  })

  it('loads configured users in one ordered batch without exposing account fields', async () => {
    const { calls, database } = fakeDatabase(() => [{ id: 'a-user' }, { id: 'b-user' }])
    const store = createPostgresCommentContextStore(database)

    await expect(store.loadExistingUsersById(['b-user', 'a-user'])).resolves.toEqual([
      { id: 'a-user' },
      { id: 'b-user' },
    ])
    expect(calls).toHaveLength(1)
    expect(calls[0].text).toContain('comment-context-store:load-existing-users')
    expect(calls[0].text).not.toMatch(/email|name|account|session/i)
    expect(calls[0].values).toEqual([['b-user', 'a-user']])
  })

  it('uses the typed store failure class for catalog failures', () => {
    expect(new CommentContextStoreFailure('CATALOG_UNAVAILABLE')).toMatchObject({
      name: 'CommentContextStoreFailure',
      code: 'CATALOG_UNAVAILABLE',
    })
  })
})

describe('PostgreSQL administrator comment context read-model integration', () => {
  const configuredDatabaseUrl = new URL(process.env.DATABASE_URL!)
  if (configuredDatabaseUrl.pathname !== '/dxrating_test') {
    throw new Error('Comment context integration tests require the configured dxrating_test database')
  }

  const database = new pg.Pool({ connectionString: configuredDatabaseUrl.toString() })
  const store = createPostgresCommentContextStore(database)

  beforeAll(async () => {
    await setupTestServer()
    await cleanDatabase()
    await database.query('DROP SCHEMA IF EXISTS dxdata CASCADE')
    await database.query(`
      CREATE SCHEMA dxdata;
      CREATE TABLE dxdata.catalog_build_runs (
        id bigint PRIMARY KEY,
        status text NOT NULL,
        api_schema_version integer NOT NULL
      );
      CREATE TABLE dxdata.catalog_snapshots (
        catalog_run_id bigint PRIMARY KEY,
        api_schema_version integer NOT NULL
      );
      CREATE TABLE dxdata.catalog_publications (
        channel text PRIMARY KEY,
        catalog_run_id bigint NOT NULL,
        revision bigint NOT NULL,
        published_at timestamptz NOT NULL
      );
      CREATE TABLE dxdata.canonical_songs (
        id text PRIMARY KEY,
        legacy_song_id text UNIQUE,
        title text NOT NULL,
        artist text NOT NULL,
        retired_at timestamptz
      );
      CREATE TABLE dxdata.song_source_mappings (
        source_id text NOT NULL,
        external_id text NOT NULL,
        song_id text NOT NULL,
        active boolean NOT NULL,
        PRIMARY KEY (source_id, external_id)
      );
      CREATE TABLE dxdata.canonical_sheets (
        id text PRIMARY KEY,
        song_id text NOT NULL,
        chart_type text NOT NULL,
        difficulty text NOT NULL,
        retired_at timestamptz,
        UNIQUE (song_id, chart_type, difficulty)
      );
      CREATE TABLE dxdata.catalog_run_sheets (
        catalog_run_id bigint NOT NULL,
        song_id text NOT NULL,
        sheet_id text NOT NULL,
        PRIMARY KEY (catalog_run_id, sheet_id)
      );
    `)
    await database.query(`
      INSERT INTO dxdata.catalog_build_runs VALUES (71, 'published', 1);
      INSERT INTO dxdata.catalog_snapshots VALUES (71, 1);
      INSERT INTO dxdata.catalog_publications
        VALUES ('production-v1', 71, 9, '2026-08-24 10:11:12.654321+00');
      INSERT INTO dxdata.canonical_songs
        VALUES ('dsng_23456789ab', 'legacy-song', 'Catalog title', 'Catalog artist', NULL);
      INSERT INTO dxdata.song_source_mappings
        VALUES
          ('legacy_dxdata', 'legacy-song', 'dsng_23456789ab', true),
          ('legacy_dxdata', 'legacy-song-retired', 'dsng_23456789ab', false);
      INSERT INTO dxdata.canonical_sheets
        VALUES ('dsht_23456789ab', 'dsng_23456789ab', 'dx', 'master', NULL);
      INSERT INTO dxdata.catalog_run_sheets
        VALUES (71, 'dsng_23456789ab', 'dsht_23456789ab');
    `)
    await database.query(`
      INSERT INTO "user" (id, name, email, role)
      VALUES
        ('context-author', 'Authentication fallback', 'context-author@example.test', 'user'),
        ('context-moderator', 'Context Moderator', 'context-moderator@example.test', 'admin')
    `)
    await database.query(
      `INSERT INTO profiles (id, display_name) VALUES ('context-author', '  Visible Context Author  ')`,
    )
    const root = await database.query<{ readonly id: string }>(
      `INSERT INTO comments
        (created_at, created_by, song_id, sheet_type, sheet_difficulty, content)
       VALUES
        ('2026-08-24 10:00:00.000001', 'context-author', 'legacy-song', 'dx', 'master', $1)
       RETURNING id::text`,
      [`${'x'.repeat(250)}\nwith a bounded tail`],
    )
    const firstChild = await database.query<{ readonly id: string }>(
      `INSERT INTO comments
        (created_at, created_by, song_id, sheet_type, sheet_difficulty, parent_id, content)
       VALUES
        ('2026-08-24 10:00:00.000002', 'context-author', 'legacy-song-retired', 'dx', 'master', $1::bigint,
         'first child')
       RETURNING id::text`,
      [root.rows[0].id],
    )
    const descendants = await database.query<{ readonly id: string; readonly content: string }>(
      `INSERT INTO comments
        (created_at, created_by, song_id, sheet_type, sheet_difficulty, parent_id, content)
       VALUES
        ('2026-08-24 10:00:00.000003', 'context-author', 'legacy-song', 'dx', 'master', $1::bigint,
         'grandchild'),
        ('2026-08-24 10:00:00.000004', 'context-author', 'legacy-song', 'dx', 'master', $2::bigint,
         'second child')
       RETURNING id::text, content`,
      [firstChild.rows[0].id, root.rows[0].id],
    )
    const secondChildId = descendants.rows.find(({ content }) => content === 'second child')?.id
    if (!secondChildId) throw new Error('Comment-context test seed did not create the second child')
    const deletion = await database.query<{ readonly id: string }>(
      `INSERT INTO admin_comment_moderation_history
        (comment_id, actor_user_id, action, reason, request_correlation_id)
       VALUES
        ($1::bigint, 'context-moderator', 'delete', 'Integration deletion reason',
         '22222222-2222-4222-8222-222222222222')
       RETURNING id::text`,
      [secondChildId],
    )
    await database.query(
      `INSERT INTO admin_comment_moderation_state (
        comment_id,
        established_action,
        deletion_reason,
        actor_user_id,
        established_by_event_id,
        moderated_at
      )
      SELECT
        event.comment_id,
        event.action,
        event.reason,
        event.actor_user_id,
        event.id,
        event.created_at
      FROM admin_comment_moderation_history event
      WHERE event.id = $1::bigint`,
      [deletion.rows[0].id],
    )
  })

  afterAll(async () => {
    await database.query('DROP SCHEMA IF EXISTS dxdata CASCADE')
    await database.end()
    await teardownTestServer()
  })

  it('executes the bounded feed SQL with exact microseconds, roots, previews, and historical catalog mappings', async () => {
    const page = await store.listRecentComments({ filters: {}, limit: 10 })

    expect(page.items.map(({ id }) => id)).toEqual(['4', '3', '2', '1'])
    expect(page.items.map(({ createdAt }) => createdAt)).toEqual([
      '2026-08-24T10:00:00.000004Z',
      '2026-08-24T10:00:00.000003Z',
      '2026-08-24T10:00:00.000002Z',
      '2026-08-24T10:00:00.000001Z',
    ])
    expect(page.items.map(({ rootId }) => rootId)).toEqual(['1', '1', '1', '1'])
    expect(page.items[0]).toMatchObject({ status: 'deleted', preview: '[deleted]', previewTruncated: false })
    expect(page.items[3]).toMatchObject({
      previewTruncated: true,
      author: { displayName: 'Visible Context Author', persistedRole: 'user', currentlyBanned: false },
      chart: {
        availability: 'current',
        stableSongId: 'dsng_23456789ab',
        stableChartId: 'dsht_23456789ab',
      },
    })
    expect(page.items[3].preview).toHaveLength(COMMENT_FEED_PREVIEW_MAX_LENGTH)
    expect(page.activePublication?.publishedAt).toBe('2026-08-24T10:11:12.654321Z')

    const retiredFilter = await store.resolveStableChartFilter('dsht_23456789ab')
    expect(retiredFilter?.storedSongIds).toEqual(['legacy-song', 'legacy-song-retired'])
    const filtered = await store.listRecentComments({
      filters: {
        chart: {
          storedSongIds: retiredFilter!.storedSongIds,
          sheetType: retiredFilter!.sheetType,
          sheetDifficulty: retiredFilter!.sheetDifficulty,
        },
      },
      cursor: { createdAt: '2026-08-24T10:00:00.000004Z', id: '4' },
      limit: 10,
    })
    expect(filtered.items.map(({ id }) => id)).toEqual(['3', '2', '1'])

    const deleted = await store.listRecentComments({
      filters: { status: 'deleted' },
      cursor: { createdAt: '2026-08-24T10:00:00.000005Z', id: '5' },
      limit: 10,
    })
    expect(deleted.items).toMatchObject([{ id: '4', status: 'deleted', preview: '[deleted]', previewTruncated: false }])
  })

  it('executes deterministic parent-before-child depth-first thread segments in one statement', async () => {
    const first = await store.loadCommentThreadSegment({ commentId: '3', limit: 2 })

    expect(first).toMatchObject({ rootId: '1', highWaterId: '4', hasMore: true })
    expect(first?.items.map(({ id, parentId, depth }) => ({ id, parentId, depth }))).toEqual([
      { id: '1', parentId: null, depth: 0 },
      { id: '2', parentId: '1', depth: 1 },
    ])
    expect(first?.items[0].originalBody).toContain('bounded tail')

    const second = await store.loadCommentThreadSegment({
      commentId: '3',
      cursor: { rootId: first!.rootId, highWaterId: first!.highWaterId, lastCommentId: first!.items[1].id },
      limit: 2,
    })
    expect(second?.items.map(({ id, parentId, depth }) => ({ id, parentId, depth }))).toEqual([
      { id: '3', parentId: '2', depth: 2 },
      { id: '4', parentId: '1', depth: 1 },
    ])
    expect(second?.hasMore).toBe(false)

    await expect(
      store.loadCommentThreadSegment({
        commentId: '3',
        cursor: { rootId: '1', highWaterId: '2', lastCommentId: '1' },
        limit: 2,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_THREAD_CURSOR' })
  })
})