import { it as effectIt } from '@effect/vitest'
import { Duration, Effect, Fiber, Layer, ManagedRuntime } from 'effect'
import { TestClock } from 'effect/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  CLEANUP_INITIAL_DELAY,
  CLEANUP_INTERVAL,
  CLOUD_SAVE_CLEANUP_LOCK,
  runCloudSaveCleanup,
  scheduleCleanup,
  sweepAbandonedImportJobsAtStartup,
  type CleanupReport,
} from '../services/cloud-save/cleanup'
import { appRuntime } from '../runtime'
import { createRequestRunner } from '../request-runner'
import { runDatabase, sheetId, testPool } from './cloud-save-helpers'
import { cleanDatabase, setupTestServer, teardownTestServer } from './setup'

const pool = testPool()
const USER = 'cleanup-user'
/** The fake clock of every pass */
const NOW = new Date('2027-02-01T00:00:00.000Z')
const daysBefore = (days: number) => new Date(NOW.getTime() - days * 86_400_000)

const insert = (table: string, row: Record<string, unknown>) => {
  const columns = Object.keys(row)
  return pool.query(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
    Object.values(row),
  )
}

const manualRecord = (saveId: string, n: number, revision: number, deletedAt: Date | null) =>
  insert('score_records', {
    save_id: saveId,
    sheet_id: sheetId(n),
    user_id: USER,
    achievement: 1000000,
    source: 'manual',
    fetched_by: 'client',
    verification: 'client_reported',
    entry_method: 'typed',
    revision,
    deleted_at: deletedAt,
  })

const event = (saveId: string, n: number) =>
  insert('score_record_events', {
    save_id: saveId,
    user_id: USER,
    sheet_id: sheetId(n),
    kind: 'manual_set',
    source: 'manual',
    fetched_by: 'client',
    verification: 'client_reported',
  })

const importJob = (id: string, source: string, startedAt: Date, saveId = 'dsav_live') =>
  insert('score_import_jobs', {
    id,
    user_id: USER,
    save_id: saveId,
    source,
    fetched_by: 'server',
    trigger: 'auto',
    idempotency_key: id,
    status: 'running',
    started_at: startedAt,
  })

const jobStates = async () =>
  (await pool.query(`SELECT id, status, error_code FROM score_import_jobs ORDER BY id`)).rows

const count = async (sql: string, values: unknown[] = []) =>
  (await pool.query<{ n: number }>(`SELECT count(*)::integer AS n FROM ${sql}`, values)).rows[0]!.n

const cleanup = () => runDatabase((database) => runCloudSaveCleanup(database, NOW))

describe('cloud save cleanup', () => {
  beforeAll(async () => {
    await setupTestServer()
  })
  afterAll(async () => {
    await teardownTestServer()
    await pool.end()
  })
  beforeEach(async () => {
    await cleanDatabase()
    await insert('"user"', { id: USER, name: USER, email: `${USER}@example.invalid` })
    await insert('score_saves', { id: 'dsav_live', user_id: USER, name: 'live', region: 'jp', revision: 10 })
    await insert('score_saves', {
      id: 'dsav_gone',
      user_id: USER,
      name: 'gone',
      region: 'jp',
      deleted_at: daysBefore(31),
    })
    await insert('score_saves', {
      id: 'dsav_recently_gone',
      user_id: USER,
      name: 'recent',
      region: 'jp',
      deleted_at: daysBefore(29),
    })
    // tombstones: two past 90 days (revisions 5 and 7), one just inside, and a live record
    await manualRecord('dsav_live', 1, 5, daysBefore(95))
    await manualRecord('dsav_live', 2, 7, daysBefore(91))
    await manualRecord('dsav_live', 3, 9, daysBefore(89))
    await manualRecord('dsav_live', 4, 10, null)
    await manualRecord('dsav_gone', 1, 1, null)
    // 25 events of one record, 3 of another
    for (let i = 0; i < 25; i++) await event('dsav_live', 4)
    for (let i = 0; i < 3; i++) await event('dsav_live', 3)
    await insert('score_mutations', {
      user_id: USER,
      mutation_id: 'old',
      save_id: 'dsav_live',
      result: '{}',
      created_at: daysBefore(31),
    })
    await insert('score_mutations', {
      user_id: USER,
      mutation_id: 'new',
      save_id: 'dsav_live',
      result: '{}',
      created_at: daysBefore(29),
    })
    // import jobs still running: one for 16 minutes (abandoned), one for 5
    await importJob('dimp_cleanup_stale', 'lxns', new Date(NOW.getTime() - 16 * 60_000))
    await importJob('dimp_cleanup_recent', 'diving-fish', new Date(NOW.getTime() - 5 * 60_000))
    for (let i = 0; i < 105; i++) {
      await insert('score_save_snapshots', {
        save_id: 'dsav_live',
        user_id: USER,
        at_revision: 0,
        b15_sum: i,
        b35_sum: 0,
        b50_sum: 0,
        record_count: 0,
        game_version: 'prism',
        created_at: new Date(daysBefore(200).getTime() + i * 60_000),
      })
    }
  })

  it('applies every retention rule relative to the clock, and is idempotent', async () => {
    const report = await cleanup()
    expect(report).toEqual({
      ran: true,
      tombstonesPurged: 2,
      eventsPurged: 5,
      mutationsPurged: 1,
      savesPurged: 1,
      snapshotsPurged: 5,
      jobsAbandoned: 1,
    } satisfies CleanupReport)
    expect(await jobStates()).toEqual([
      { id: 'dimp_cleanup_recent', status: 'running', error_code: null },
      { id: 'dimp_cleanup_stale', status: 'failed', error_code: 'abandoned' },
    ])

    const { rows } = await pool.query(
      `SELECT sheet_id FROM score_records WHERE save_id = 'dsav_live' ORDER BY sheet_id`,
    )
    expect(rows.map((row) => row.sheet_id)).toEqual([sheetId(3), sheetId(4)])
    const save = await pool.query(
      `SELECT tombstone_horizon::integer AS horizon, revision::integer FROM score_saves WHERE id = 'dsav_live'`,
    )
    expect(save.rows[0]).toEqual({ horizon: 7, revision: 10 })
    expect(await count(`score_record_events WHERE sheet_id = $1`, [sheetId(4)])).toBe(20)
    expect(await count(`score_record_events WHERE sheet_id = $1`, [sheetId(3)])).toBe(3)
    // the newest 20 events stay
    const kept = await pool.query(`SELECT min(id) AS min FROM score_record_events WHERE sheet_id = $1`, [sheetId(4)])
    const all = await pool.query(`SELECT id FROM score_record_events WHERE sheet_id = $1 ORDER BY id DESC LIMIT 20`, [
      sheetId(4),
    ])
    expect(String(kept.rows[0].min)).toBe(String(all.rows[19].id))
    expect((await pool.query(`SELECT mutation_id FROM score_mutations`)).rows).toEqual([{ mutation_id: 'new' }])
    expect((await pool.query(`SELECT id FROM score_saves ORDER BY id`)).rows.map((row) => row.id)).toEqual([
      'dsav_live',
      'dsav_recently_gone',
    ])
    expect(await count(`score_records WHERE save_id = 'dsav_gone'`)).toBe(0)
    expect(await count(`score_save_snapshots`)).toBe(100)
    expect((await pool.query(`SELECT min(b15_sum) AS min FROM score_save_snapshots`)).rows[0].min).toBe(5)

    expect(await cleanup()).toEqual({
      ran: true,
      tombstonesPurged: 0,
      eventsPurged: 0,
      mutationsPurged: 0,
      savesPurged: 0,
      snapshotsPurged: 0,
      jobsAbandoned: 0,
    })
    expect(
      (await pool.query(`SELECT tombstone_horizon::integer AS horizon FROM score_saves WHERE id = 'dsav_live'`))
        .rows[0],
    ).toEqual({ horizon: 7 })
  })

  it('does nothing while another instance holds the cleanup lock', async () => {
    const other = await pool.connect()
    try {
      await other.query('SELECT pg_advisory_lock($1)', [CLOUD_SAVE_CLEANUP_LOCK])
      expect(await cleanup()).toMatchObject({ ran: false, tombstonesPurged: 0, savesPurged: 0 })
      expect(await count('score_records')).toBe(5)
      expect(await count('score_saves')).toBe(3)
    } finally {
      await other.query('SELECT pg_advisory_unlock($1)', [CLOUD_SAVE_CLEANUP_LOCK])
      other.release()
    }
    expect((await cleanup()).ran).toBe(true)
  })

  it('purges every save soft-deleted past 30 days in one pass, beyond one statement batch of 100', async () => {
    await pool.query(
      `INSERT INTO score_saves (id, user_id, name, region, deleted_at)
       SELECT 'dsav_bulk_' || lpad(n::text, 3, '0'), $1, 'bulk', 'jp', $2 FROM generate_series(1, 150) AS n`,
      [USER, daysBefore(45)],
    )
    const report = await cleanup()
    // the 150 seeded saves and dsav_gone
    expect(report.savesPurged).toBe(151)
    expect(await count(`score_saves WHERE deleted_at < $1`, [daysBefore(30)])).toBe(0)
    expect((await pool.query(`SELECT id FROM score_saves ORDER BY id`)).rows.map((row) => row.id)).toEqual([
      'dsav_live',
      'dsav_recently_gone',
    ])
  })

  it('fails the jobs a previous process left running at startup, and only those older than 15 minutes', async () => {
    await pool.query(`DELETE FROM score_import_jobs`)
    await pool.query(
      `INSERT INTO score_import_jobs (id, user_id, save_id, source, fetched_by, trigger, idempotency_key, status, started_at)
       VALUES ('dimp_startup_stale', $1, 'dsav_live', 'maimai-net-jp', 'server', 'user', 'k1', 'running', now() - interval '16 minutes'),
              ('dimp_startup_recent', $1, 'dsav_live', 'maimai-net-intl', 'server', 'user', 'k2', 'running', now() - interval '5 minutes'),
              ('dimp_startup_done', $1, 'dsav_live', 'lxns', 'server', 'user', 'k3', 'succeeded', now() - interval '1 hour')`,
      [USER],
    )
    expect(await appRuntime.runPromise(sweepAbandonedImportJobsAtStartup)).toBe(1)
    expect(await jobStates()).toEqual([
      { id: 'dimp_startup_done', status: 'succeeded', error_code: null },
      { id: 'dimp_startup_recent', status: 'running', error_code: null },
      { id: 'dimp_startup_stale', status: 'failed', error_code: 'abandoned' },
    ])
    expect(await appRuntime.runPromise(sweepAbandonedImportJobsAtStartup)).toBe(0)
  })

  it('lets two concurrent passes purge each tombstone exactly once', async () => {
    const [a, b] = await Promise.all([cleanup(), cleanup()])
    expect(a.tombstonesPurged + b.tombstonesPurged).toBe(2)
    expect(a.savesPurged + b.savesPurged).toBe(1)
    expect(await count('score_records')).toBe(2)
  })
})

describe('cloud save cleanup schedule', () => {
  effectIt.effect('waits, then runs a pass every 24 hours until interrupted', () =>
    Effect.gen(function* () {
      let passes = 0
      const pass = Effect.sync((): CleanupReport => {
        passes += 1
        if (passes === 2) throw new Error('a failing pass does not stop the schedule')
        return {
          ran: true,
          tombstonesPurged: 0,
          eventsPurged: 0,
          mutationsPurged: 0,
          savesPurged: 0,
          snapshotsPurged: 0,
          jobsAbandoned: 0,
        }
      })
      const fiber = yield* Effect.forkChild(scheduleCleanup(pass))
      yield* TestClock.adjust(Duration.subtract(CLEANUP_INITIAL_DELAY, Duration.seconds(1)))
      expect(passes).toBe(0)
      yield* TestClock.adjust(Duration.seconds(1))
      expect(passes).toBe(1)
      yield* TestClock.adjust(CLEANUP_INTERVAL)
      expect(passes).toBe(2)
      yield* TestClock.adjust(CLEANUP_INTERVAL)
      expect(passes).toBe(3)
      yield* Fiber.interrupt(fiber)
      yield* TestClock.adjust(CLEANUP_INTERVAL)
      expect(passes).toBe(3)
    }),
  )
})
describe('cloud save cleanup and shutdown', () => {
  it('is interrupted by the request runner shutdown, which waits for a pass to finish its finalizers', async () => {
    const events: string[] = []
    const runtime = ManagedRuntime.make(Layer.empty)
    const runner = createRequestRunner(runtime)
    const pass = Effect.acquireUseRelease(
      Effect.sync(() => events.push('pass started')),
      () => Effect.never,
      () => Effect.sync(() => events.push('pass rolled back')),
    ).pipe(
      Effect.as<CleanupReport>({
        ran: true,
        tombstonesPurged: 0,
        eventsPurged: 0,
        mutationsPurged: 0,
        savesPurged: 0,
        snapshotsPurged: 0,
        jobsAbandoned: 0,
      }),
    )
    // no initial delay here: the loop is what index.ts runs under runApp
    const loop = runner.run(pass.pipe(Effect.forever))
    await expect.poll(() => events).toEqual(['pass started'])
    await runner.shutdown()
    await expect(loop).rejects.toBeDefined()
    expect(events).toEqual(['pass started', 'pass rolled back'])
  })
})