import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  backoffDelay,
  type CloudScoreRepositoryOptions,
  CloudScoreRepository,
  classifySyncError,
  type ScoreBroadcastChannel,
  type ScoreSyncLocks,
  SYNC_BACKOFF_MAX_MS,
} from '../CloudScoreRepository'
import { CloudScoreDatabase } from '../cloudScoreDatabase'
import { FakeCloudSaveServer, manualProvenance, verifiedProvenance } from './fakeCloudSaveServer'

const SHEET_A = 'dsht_e5nsvt8k2a'
const SHEET_B = 'dsht_5mk3yr8gme'
const SHEET_C = 'dsht_cccccccccc'
const IDENTITY_A = { songId: 'dsng_kkx38yfx4t', type: 'dx', difficulty: 'master' } as const

const offline = () => new TypeError('Failed to fetch')

let factory: IDBFactory
let server: FakeCloudSaveServer
const opened: CloudScoreRepository[] = []

async function openRepository(overrides: Partial<CloudScoreRepositoryOptions> = {}) {
  const repository = await CloudScoreRepository.open({
    userId: 'user-1',
    saveId: 'dsav_one',
    api: server.api,
    indexedDB: factory,
    locks: null,
    createChannel: null,
    eventTarget: null,
    isVisible: () => true,
    ...overrides,
  })
  opened.push(repository)
  return repository
}

/** Closes a repository without flushing, as a page unload does */
const unload = (repository: CloudScoreRepository) => repository.dispose({ flushTimeoutMs: 0 })

beforeEach(() => {
  factory = new IDBFactory()
  server = new FakeCloudSaveServer()
})

afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  await Promise.all(opened.splice(0).map(unload))
})

describe('CloudScoreRepository', () => {
  it('pulls the save and reads it as records and calculator entries', async () => {
    server.put(SHEET_A, 1005432, verifiedProvenance(), { comboFlag: 'ap', dxScore: 2400, providerRecordId: 'net-1' })
    server.put(SHEET_B, 990000)
    const repository = await openRepository()
    repository.setIdentityResolver((sheetId) => (sheetId === SHEET_A ? IDENTITY_A : undefined))
    expect(repository.ready).toBe(false)

    await repository.sync()

    expect(repository.ready).toBe(true)
    expect(repository.status).toMatchObject({ state: 'idle', pendingCount: 0, lastSyncedRevision: 2 })
    // Only charts the catalog knows have a record; the calculator gets every entry
    expect(repository.list()).toEqual([
      {
        sheetId: SHEET_A,
        identity: IDENTITY_A,
        achievement: 1005432,
        achievementRate: 100.5432,
        comboFlag: 'ap',
        syncFlag: null,
        dxScore: 2400,
        best50Bucket: null,
        provenance: verifiedProvenance(),
      },
    ])
    expect(repository.entries()).toEqual([
      {
        sheetId: SHEET_A,
        identity: IDENTITY_A,
        achievementRate: 100.5432,
        comboFlag: 'ap',
        syncFlag: null,
        dxScore: 2400,
        source: { provider: 'maimai-net', providerId: 'net-1' },
      },
      { sheetId: SHEET_B, achievementRate: 99, comboFlag: null, syncFlag: null },
    ])
  })

  it('pulls every page until hasMore is false', async () => {
    server.pageSize = 1
    server.put(SHEET_A, 1000000)
    server.put(SHEET_B, 990000)
    server.put(SHEET_C, 980000)
    const repository = await openRepository()

    await repository.sync()

    expect(server.changesCalls).toEqual([0, 1, 2])
    expect(repository.entries()).toHaveLength(3)
    expect(repository.status.lastSyncedRevision).toBe(3)
  })

  it('writes optimistically and pushes the manual entry with its entry method', async () => {
    const repository = await openRepository()
    await repository.sync()

    repository.setManual({ sheetId: SHEET_A, achievementRate: 100.1234, comboFlag: 'fc', dxScore: 2000 }, 'keypad')

    expect(repository.entries()).toEqual([
      { sheetId: SHEET_A, achievementRate: 100.1234, comboFlag: 'fc', syncFlag: null },
    ])
    expect(repository.status.pendingCount).toBe(1)

    await repository.sync()

    expect(server.mutateCalls).toHaveLength(1)
    expect(server.mutateCalls[0]).toEqual([
      expect.objectContaining({
        op: 'set',
        sheetId: SHEET_A,
        basedOnRevision: 0,
        entryMethod: 'keypad',
        value: { achievement: 1001234, comboFlag: 'fc', syncFlag: null, dxScore: 2000 },
      }),
    ])
    expect(server.mutateCalls[0]![0]!.mutationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-/)
    expect(server.records.get(SHEET_A)?.provenance).toMatchObject({ source: 'manual', entryMethod: 'keypad' })
    expect(repository.status.pendingCount).toBe(0)
  })

  it('refuses an achievement out of range instead of dropping it', async () => {
    const repository = await openRepository()
    expect(() => repository.setManual({ sheetId: SHEET_A, achievementRate: 101.5 }, 'typed')).toThrow(RangeError)
    expect(repository.status.pendingCount).toBe(0)
  })

  it('keeps the outbox in creation order across a reload and resends the same mutation IDs', async () => {
    server.put(SHEET_C, 970000)
    const first = await openRepository()
    await first.sync()
    server.failures.push(offline())

    first.setManual({ sheetId: SHEET_A, achievementRate: 100 }, 'typed')
    first.setManual({ sheetId: SHEET_B, achievementRate: 99 }, 'photo')
    first.delete([SHEET_C])
    await first.sync()
    expect(first.status.state).toBe('offline')
    const sentIds = server.mutateCalls[0]!.map((mutation) => mutation.mutationId)
    await unload(first)

    const second = await openRepository()
    expect(second.status.pendingCount).toBe(3)
    expect(second.entries().map((entry) => entry.sheetId)).toEqual([SHEET_A, SHEET_B])

    await second.sync()

    expect(server.mutateCalls).toHaveLength(2)
    expect(server.mutateCalls[1]!.map((mutation) => [mutation.op, mutation.sheetId])).toEqual([
      ['set', SHEET_A],
      ['set', SHEET_B],
      ['delete', SHEET_C],
    ])
    expect(server.mutateCalls[1]!.map((mutation) => mutation.mutationId)).toEqual(sentIds)
    expect(server.mutateCalls[1]![2]!.basedOnRevision).toBe(1)
    expect(second.status.pendingCount).toBe(0)
    expect(second.entries().map((entry) => entry.sheetId)).toEqual([SHEET_A, SHEET_B])
  })

  it('pushes at most 500 mutations a request', async () => {
    const repository = await openRepository()
    server.failures.push(offline())
    for (let index = 0; index < 501; index++) {
      repository.setManual({ sheetId: `dsht_${String(index).padStart(10, '0')}`, achievementRate: 90 }, 'typed')
    }
    await repository.sync()
    server.mutateCalls.length = 0
    await unload(repository)

    // A new page load, free of the backoff
    await (await openRepository()).sync()

    expect(server.mutateCalls.map((batch) => batch.length)).toEqual([500, 1])
  })

  it('bases each mutation on the revision of the record this device has', async () => {
    server.put(SHEET_A, 990000)
    server.put(SHEET_A, 995000)
    const repository = await openRepository()
    await repository.sync()

    repository.setManual({ sheetId: SHEET_A, achievementRate: 100 }, 'typed')
    await repository.sync()

    expect(server.mutateCalls[0]![0]!.basedOnRevision).toBe(2)
  })

  it('lays changes made during a sync over the pulled records', async () => {
    server.put(SHEET_A, 990000)
    const repository = await openRepository()
    await repository.sync()

    // Another device changes A while this one, mid-sync, adds B
    server.put(SHEET_A, 1000000)
    server.onChanges = () => {
      server.onChanges = null
      repository.setManual({ sheetId: SHEET_B, achievementRate: 98 }, 'typed')
    }
    server.failures.length = 0
    await repository.sync()

    expect(repository.entries()).toEqual([
      expect.objectContaining({ sheetId: SHEET_A, achievementRate: 100 }),
      expect.objectContaining({ sheetId: SHEET_B, achievementRate: 98 }),
    ])
    expect(repository.status.pendingCount).toBe(1)
    expect(server.records.has(SHEET_B)).toBe(false)
  })

  it('keeps a newer verified record over a stale manual change, as an issue that can be applied again', async () => {
    server.put(SHEET_A, 990000)
    const offlineTab = await openRepository()
    await offlineTab.sync()

    server.failures.push(offline())
    offlineTab.setManual({ sheetId: SHEET_A, achievementRate: 98.5 }, 'typed')
    await offlineTab.sync()
    await unload(offlineTab)
    // Meanwhile a maimai NET import verifies a better score
    server.put(SHEET_A, 1002000, verifiedProvenance())

    const repository = await openRepository()

    await repository.sync()

    expect(server.mutateCalls.at(-1)![0]).toMatchObject({ basedOnRevision: 1 })
    expect(repository.entries()).toEqual([expect.objectContaining({ sheetId: SHEET_A, achievementRate: 100.2 })])
    expect(repository.status.issues).toEqual([
      expect.objectContaining({
        sheetId: SHEET_A,
        kind: 'superseded',
        intent: {
          op: 'set',
          value: { achievement: 985000, comboFlag: null, syncFlag: null, dxScore: null },
          entryMethod: 'typed',
          // When the user made the change, not when its result came back (§5.4: value, method, time)
          clientEditedAt: server.mutateCalls[0]![0]!.clientEditedAt,
        },
      }),
    ])

    repository.reapplyIssue(repository.status.issues[0]!.id)
    expect(repository.status.issues).toEqual([])
    await repository.sync()

    expect(server.mutateCalls.at(-1)![0]).toMatchObject({ basedOnRevision: 2, value: { achievement: 985000 } })
    expect(server.records.get(SHEET_A)).toMatchObject({
      achievement: 985000,
      provenance: { source: 'manual', verification: 'user_edited', editedFromJobId: 'dimp_job1' },
    })
    expect(repository.entries()).toEqual([expect.objectContaining({ sheetId: SHEET_A, achievementRate: 98.5 })])
  })

  it('keeps issues across a reload and forgets a dismissed one', async () => {
    const repository = await openRepository()
    server.respondOnce = (mutations) => ({
      revision: 0,
      results: mutations.map((mutation) => ({
        mutationId: mutation.mutationId,
        status: 'rejected',
        record: null,
        reason: 'invalid-achievement',
      })),
    })
    repository.setManual({ sheetId: SHEET_A, achievementRate: 99 }, 'typed')
    await repository.sync()
    expect(repository.status.issues).toEqual([
      expect.objectContaining({ kind: 'rejected', reason: 'invalid-achievement' }),
    ])
    await unload(repository)

    const reloaded = await openRepository()
    expect(reloaded.status.issues).toHaveLength(1)
    reloaded.dismissIssue(reloaded.status.issues[0]!.id)
    expect(reloaded.status.issues).toEqual([])
    expect(reloaded.entries()).toEqual([])
  })

  it('keeps a dismissed issue gone when a reload had already read it', async () => {
    let channel: ScoreBroadcastChannel | null = null
    const createChannel = () => {
      channel = { onmessage: null, postMessage() {}, close() {} }
      return channel
    }
    const repository = await openRepository({ createChannel })
    server.respondOnce = (mutations) => ({
      revision: 0,
      results: mutations.map((mutation) => ({
        mutationId: mutation.mutationId,
        status: 'rejected',
        record: null,
        reason: 'invalid-achievement',
      })),
    })
    repository.setManual({ sheetId: SHEET_A, achievementRate: 99 }, 'typed')
    repository.start()
    await repository.idle()
    const issueId = repository.status.issues[0]!.id

    // A broadcast reload reads the issue, and is held there until the dismissal
    const original = CloudScoreDatabase.prototype.read
    let release: (() => void) | null = null
    const read = vi
      .spyOn(CloudScoreDatabase.prototype, 'read')
      .mockImplementationOnce(async function (this: CloudScoreDatabase) {
        const snapshot = await original.call(this)
        await new Promise<void>((resolve) => (release = resolve))
        return snapshot
      })
    const seen: string[][] = []
    repository.subscribe(() => seen.push(repository.status.issues.map((issue) => issue.id)))
    channel!.onmessage?.({ data: { type: 'changed', userId: 'user-1', saveId: 'dsav_one' } } as MessageEvent)
    await vi.waitFor(() => expect(release).not.toBeNull())

    repository.dismissIssue(issueId)
    release!()
    await new Promise((resolve) => setTimeout(resolve, 20))
    read.mockRestore()

    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every((ids) => !ids.includes(issueId))).toBe(true)
    expect(repository.status.issues).toEqual([])
    await unload(repository)
    expect((await openRepository()).status.issues).toEqual([])
  })

  it('rebuilds the cache from revision 0 when the server requires a reset, keeping pending changes', async () => {
    server.put(SHEET_A, 990000)
    server.put(SHEET_C, 970000)
    const repository = await openRepository()
    await repository.sync()

    // C was deleted elsewhere and its tombstone purged; this device's cursor is older than the horizon
    server.purge(SHEET_C)
    server.put(SHEET_B, 980000)
    server.tombstoneHorizon = 3
    server.onChanges = () => {
      server.onChanges = null
      repository.setManual({ sheetId: SHEET_A, achievementRate: 100.5 }, 'typed')
    }

    await repository.sync()

    expect(server.changesCalls.slice(-2)).toEqual([2, 0])
    expect(repository.entries()).toEqual([
      expect.objectContaining({ sheetId: SHEET_A, achievementRate: 100.5 }),
      expect.objectContaining({ sheetId: SHEET_B, achievementRate: 98 }),
    ])
    expect(repository.status).toMatchObject({ pendingCount: 1, lastSyncedRevision: 3 })
  })

  it('keeps every page of a full pull in full mode, so a purged tombstone horizon never cuts it short', async () => {
    server.pageSize = 1
    server.put(SHEET_A, 1000000)
    server.put(SHEET_B, 990000)
    // A chart deleted long ago, its tombstone purged: the horizon is above the cursor of the first pages
    server.put('dsht_dddddddddd', 970000, manualProvenance(), { deletedAt: '2026-08-01T00:00:00.000Z' })
    server.purge('dsht_dddddddddd')
    server.put(SHEET_C, 980000)
    expect(server.tombstoneHorizon).toBe(3)
    const reportChecksumMismatch = vi.fn()
    const repository = await openRepository({ reportChecksumMismatch })

    await repository.sync()

    expect(server.changesCalls).toEqual([0, 1, 2])
    expect(server.changesModes).toEqual(['full', 'full', 'full'])
    expect(repository.entries().map((entry) => entry.sheetId)).toEqual([SHEET_A, SHEET_B, SHEET_C])
    expect(repository.status).toMatchObject({ state: 'idle', lastSyncedRevision: 4 })
    expect(reportChecksumMismatch).not.toHaveBeenCalled()

    // A device whose cursor fell below the horizon restarts as a full pull, every page of it in full mode
    const behind = await openRepository({ saveId: 'dsav_two', api: server.api })
    const database = await CloudScoreDatabase.open('user-1', 'dsav_two', factory)
    await database.write({ meta: { saveId: 'dsav_two', lastSyncedRevision: 1 } })
    database.close()
    const changesBefore = server.changesCalls.length
    await behind.sync()
    expect(server.changesCalls.slice(changesBefore)).toEqual([1, 0, 1, 2])
    expect(server.changesModes.slice(changesBefore)).toEqual(['incremental', 'full', 'full', 'full'])
    expect(behind.entries().map((entry) => entry.sheetId)).toEqual([SHEET_A, SHEET_B, SHEET_C])
    expect(behind.status.lastSyncedRevision).toBe(4)

    // Both survive a reload, complete
    await unload(repository)
    expect((await openRepository()).entries()).toHaveLength(3)
  })

  it('starts a full pull over from 0 when it is reset midway, and never commits a partial one', async () => {
    server.pageSize = 1
    server.put(SHEET_A, 1000000)
    server.put(SHEET_B, 990000)
    server.put(SHEET_C, 980000)
    let resets = 1
    const api = {
      ...server.api,
      changes: async (input: Parameters<typeof server.api.changes>[0]) => {
        const page = await server.api.changes(input)
        // A continuation page reset (which the server never sends in full mode)
        if (input.since > 0 && resets > 0) {
          resets--
          return { ...page, records: [], nextSince: 0, hasMore: false, resetRequired: true, checksum: null }
        }
        return page
      },
    }
    const repository = await openRepository({ api })

    await repository.sync()
    expect(server.changesCalls).toEqual([0, 1, 0, 1, 2])
    expect(repository.entries()).toHaveLength(3)
    expect(repository.status).toMatchObject({ state: 'idle', lastSyncedRevision: 3 })

    // Reset on every attempt: the cycle fails, and nothing of it is kept
    resets = Number.POSITIVE_INFINITY
    const fresh = await openRepository({ saveId: 'dsav_two', api })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await fresh.sync()
    expect(fresh.status).toMatchObject({ state: 'error', lastSyncedRevision: 0 })
    expect(fresh.entries()).toEqual([])
    const database = await CloudScoreDatabase.open('user-1', 'dsav_two', factory)
    const snapshot = await database.read()
    database.close()
    expect(snapshot.records).toEqual([])
    expect(snapshot.meta.lastSyncedRevision).toBe(0)
  })

  it('never lets a delayed acknowledgement in one tab regress a newer record another tab cached', async () => {
    server.put(SHEET_A, 990000)
    let releaseAck!: () => void
    const ackHeld = new Promise<void>((resolve) => {
      releaseAck = resolve
    })
    let mutated!: () => void
    const mutateReached = new Promise<void>((resolve) => {
      mutated = resolve
    })
    let tabAOffline = false
    // Tab A's acknowledgement arrives late, and its pull after it fails
    const tabAApi = {
      changes: async (input: Parameters<typeof server.api.changes>[0]) => {
        if (tabAOffline) throw offline()
        return server.api.changes(input)
      },
      mutate: async (input: Parameters<typeof server.api.mutate>[0]) => {
        const result = await server.api.mutate(input)
        mutated()
        await ackHeld
        return result
      },
    }
    // No Web Locks: both tabs sync on their own
    const tabA = await openRepository({ api: tabAApi })
    const tabB = await openRepository()
    await tabA.sync()
    await tabB.sync()

    tabA.setManual({ sheetId: SHEET_A, achievementRate: 99.5 }, 'typed')
    tabAOffline = true
    const tabASync = tabA.sync()
    await mutateReached
    // Applied as revision 2; then an import elsewhere verifies the same achievement as revision 3
    server.put(SHEET_A, 995000, verifiedProvenance(), { comboFlag: 'fc' })
    await tabB.sync()
    expect(tabB.status.lastSyncedRevision).toBe(3)

    releaseAck()
    await tabASync
    expect(tabA.status.state).toBe('offline')

    const database = await CloudScoreDatabase.open('user-1', 'dsav_one', factory)
    const snapshot = await database.read()
    database.close()
    expect(snapshot.records).toEqual([expect.objectContaining({ sheetId: SHEET_A, revision: 3, comboFlag: 'fc' })])

    // A reload and a sync keep the newer record: the cursor has passed it, and the checksum matches either way
    await unload(tabA)
    await unload(tabB)
    const reportChecksumMismatch = vi.fn()
    const reopened = await openRepository({ reportChecksumMismatch })
    await reopened.sync()
    expect(reopened.entries()).toEqual([
      expect.objectContaining({ sheetId: SHEET_A, achievementRate: 99.5, comboFlag: 'fc' }),
    ])
    expect(reportChecksumMismatch).not.toHaveBeenCalled()
  })

  it('refetches everything once and reports a checksum mismatch without identifiers', async () => {
    server.put(SHEET_A, 990000)
    const reportChecksumMismatch = vi.fn()
    const repository = await openRepository({ reportChecksumMismatch })
    server.checksumOverride = { count: 2, sumAchievement: 1980000 }

    await repository.sync()

    expect(server.changesCalls).toEqual([0, 0])
    expect(reportChecksumMismatch).toHaveBeenCalledTimes(1)
    expect(reportChecksumMismatch).toHaveBeenCalledWith({
      expectedCount: 2,
      expectedSumAchievement: 1980000,
      actualCount: 1,
      actualSumAchievement: 990000,
    })
    expect(repository.status.state).toBe('idle')
  })

  it('backs off on a 429 for as long as the server asks', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
    const repository = await openRepository()
    server.failures.push({ status: 429, code: 'TOO_MANY_REQUESTS', data: { retryAfterSeconds: 30 } })
    repository.setManual({ sheetId: SHEET_A, achievementRate: 99 }, 'typed')

    await repository.sync()
    expect(repository.status).toMatchObject({ state: 'idle', pendingCount: 1 })
    await repository.sync()
    expect(server.mutateCalls).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(29_000)
    expect(server.mutateCalls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1_000)
    await repository.idle()

    expect(server.mutateCalls).toHaveLength(2)
    expect(repository.status.pendingCount).toBe(0)
  })

  it.each([
    [{ status: 404, code: 'NOT_FOUND' }, 'not-found'],
    [{ status: 401, code: 'UNAUTHORIZED' }, 'unauthorized'],
  ] as const)('stops syncing on %o and keeps the outbox', async (error, reason) => {
    const onStopped = vi.fn()
    const repository = await openRepository({ onStopped })
    server.failures.push(error)
    repository.setManual({ sheetId: SHEET_A, achievementRate: 99 }, 'typed')

    await repository.sync()

    expect(onStopped).toHaveBeenCalledWith(reason)
    expect(repository.stoppedReason).toBe(reason)
    expect(repository.status).toMatchObject({ state: 'error', pendingCount: 1 })
    await repository.sync()
    expect(server.mutateCalls).toHaveLength(1)
    // Still readable, still queued after a reload
    expect(repository.entries()).toHaveLength(1)
    await unload(repository)
    expect((await openRepository()).status.pendingCount).toBe(1)
  })

  it('backs off exponentially from 2 s to 5 min on other failures', async () => {
    expect([1, 2, 3, 8, 9, 20].map(backoffDelay)).toEqual([2000, 4000, 8000, 256000, SYNC_BACKOFF_MAX_MS, 300000])
    expect(classifySyncError(new TypeError('Failed to fetch'))).toEqual({ kind: 'retry', offline: true })
    expect(classifySyncError({ status: 500, code: 'INTERNAL_SERVER_ERROR' })).toEqual({
      kind: 'retry',
      offline: false,
    })

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
    const repository = await openRepository()
    server.failures.push({ status: 500 }, { status: 500 })
    await repository.sync()
    expect(repository.status.state).toBe('error')
    await vi.advanceTimersByTimeAsync(2_000)
    await repository.idle()
    expect(server.changesCalls).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(3_999)
    expect(server.changesCalls).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    await repository.idle()
    expect(server.changesCalls).toHaveLength(3)
    expect(repository.status.state).toBe('idle')
  })

  it('syncs 2 s after the last write, sending the writes together', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
    const repository = await openRepository()
    repository.start()
    await repository.idle()
    expect(server.changesCalls).toHaveLength(1)

    repository.setManual({ sheetId: SHEET_A, achievementRate: 99 }, 'typed')
    await vi.advanceTimersByTimeAsync(1_500)
    repository.setManual({ sheetId: SHEET_B, achievementRate: 98 }, 'typed')
    await vi.advanceTimersByTimeAsync(1_999)
    expect(server.mutateCalls).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(1)
    await repository.idle()
    expect(server.mutateCalls.map((batch) => batch.map((mutation) => mutation.sheetId))).toEqual([[SHEET_A, SHEET_B]])
  })

  it('pulls every 60 s while the page is visible', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
    let visible = true
    const repository = await openRepository({ isVisible: () => visible })
    repository.start()
    await repository.idle()

    await vi.advanceTimersByTimeAsync(60_000)
    await repository.idle()
    expect(server.changesCalls).toHaveLength(2)

    visible = false
    await vi.advanceTimersByTimeAsync(60_000)
    expect(server.changesCalls).toHaveLength(2)
  })

  it('syncs when the page comes back online or regains focus', async () => {
    const target = new EventTarget()
    const repository = await openRepository({ eventTarget: target as unknown as Window })
    repository.start()
    await repository.idle()

    target.dispatchEvent(new Event('online'))
    await repository.idle()
    target.dispatchEvent(new Event('focus'))
    await repository.idle()
    await repository.notifyImportJobCompleted()

    expect(server.changesCalls).toHaveLength(4)
  })

  it('lets only the tab holding the sync lock push', async () => {
    let held = true
    const request = vi.fn(
      async (_name: string, _options: { ifAvailable: true }, callback: (lock: unknown) => unknown) =>
        callback(held ? null : { name: 'dxr-scores-sync' }),
    )
    const locks = { request } as unknown as ScoreSyncLocks
    const repository = await openRepository({ locks })
    repository.setManual({ sheetId: SHEET_A, achievementRate: 99 }, 'typed')
    expect(repository.ready).toBe(false)

    await repository.sync()
    expect(request).toHaveBeenCalledWith('dxr-scores-sync', { ifAvailable: true }, expect.any(Function))
    expect(server.mutateCalls).toHaveLength(0)
    expect(server.changesCalls).toHaveLength(0)
    // Another tab syncs the shared cache: this one shows it, even for an empty save (no revision to wait for)
    expect(repository.ready).toBe(true)

    held = false
    await repository.sync()
    expect(server.mutateCalls).toHaveLength(1)
  })

  it("tells other tabs to reload, so the lock holder pushes another tab's changes", async () => {
    const channels: FakeChannel[] = []
    class FakeChannel implements ScoreBroadcastChannel {
      onmessage: ((event: MessageEvent) => void) | null = null
      constructor() {
        channels.push(this)
      }
      postMessage(message: unknown) {
        for (const channel of channels) {
          if (channel !== this) channel.onmessage?.({ data: message } as MessageEvent)
        }
      }
      close() {
        channels.splice(channels.indexOf(this), 1)
      }
    }
    const createChannel = () => new FakeChannel()
    const tabA = await openRepository({ createChannel })
    const tabB = await openRepository({ createChannel })
    tabA.start()
    tabB.start()
    await Promise.all([tabA.idle(), tabB.idle()])
    expect(channels).toHaveLength(2)

    const reloaded = new Promise<void>((resolve) => {
      const unsubscribe = tabB.subscribe(() => {
        if (tabB.status.pendingCount === 1) {
          unsubscribe()
          resolve()
        }
      })
    })
    tabA.setManual({ sheetId: SHEET_A, achievementRate: 99 }, 'typed')
    await reloaded

    expect(tabB.entries()).toEqual([expect.objectContaining({ sheetId: SHEET_A, achievementRate: 99 })])
    // Tab B pushes A's change (the outbox is shared); tab A then finds nothing left to send
    await tabB.sync()
    await tabA.sync()
    expect(server.mutateCalls.flat().map((mutation) => mutation.sheetId)).toEqual([SHEET_A])
  })

  it("never sends another user's outbox", async () => {
    const userOne = await openRepository()
    server.failures.push(offline())
    userOne.setManual({ sheetId: SHEET_A, achievementRate: 99 }, 'typed')
    await userOne.sync()
    await unload(userOne)
    server.mutateCalls.length = 0

    const userTwo = await openRepository({ userId: 'user-2', saveId: 'dsav_two' })
    await userTwo.sync()
    expect(server.mutateCalls).toEqual([])
    expect(userTwo.entries()).toEqual([])
    expect(userTwo.status.pendingCount).toBe(0)
    await unload(userTwo)

    const userOneAgain = await openRepository()
    expect(userOneAgain.status.pendingCount).toBe(1)
  })

  it('keeps the outbox of another save of the same user for when it is active again', async () => {
    const first = await openRepository()
    server.failures.push(offline())
    first.setManual({ sheetId: SHEET_A, achievementRate: 99 }, 'typed')
    await first.sync()
    await unload(first)

    const other = await openRepository({ saveId: 'dsav_other' })
    await other.sync()
    expect(other.status.pendingCount).toBe(0)
    expect(server.mutateCalls.slice(1)).toEqual([])
    await unload(other)

    expect((await openRepository()).status.pendingCount).toBe(1)
  })

  it('keeps the caches of two saves of the same user apart, when two tabs work on them at once', async () => {
    const serverB = new FakeCloudSaveServer()
    server.pageSize = 1
    server.put(SHEET_A, 1000000)
    server.put(SHEET_B, 990000)
    serverB.put(SHEET_C, 980000)
    let tabB: CloudScoreRepository | null = null
    // Tab B syncs save B between tab A's pages
    server.onChanges = () => {
      if (server.changesCalls.at(-1) === 1) void tabB?.sync()
    }
    const reportChecksumMismatch = vi.fn()
    const tabA = await openRepository({ reportChecksumMismatch })
    tabB = await openRepository({ saveId: 'dsav_other', api: serverB.api, reportChecksumMismatch })

    await tabA.sync()
    await tabB.idle()
    expect(reportChecksumMismatch).not.toHaveBeenCalled()
    expect(tabA.entries().map((entry) => entry.sheetId)).toEqual([SHEET_A, SHEET_B])
    expect(tabB.entries().map((entry) => entry.sheetId)).toEqual([SHEET_C])

    // A push result of save A lands in save A's cache only
    tabA.setManual({ sheetId: SHEET_C, achievementRate: 97 }, 'typed')
    await tabA.sync()
    await tabB.sync()
    expect(tabB.entries()).toEqual([expect.objectContaining({ sheetId: SHEET_C, achievementRate: 98 })])
    expect(serverB.mutateCalls).toEqual([])

    // Both caches survive a reload, and neither refetches
    await unload(tabA)
    await unload(tabB)
    const changesBefore = server.changesCalls.length
    const reopenedA = await openRepository()
    const reopenedB = await openRepository({ saveId: 'dsav_other', api: serverB.api })
    expect(reopenedA.ready).toBe(true)
    expect(reopenedA.entries().map((entry) => entry.sheetId)).toEqual([SHEET_A, SHEET_B, SHEET_C])
    expect(reopenedB.entries().map((entry) => entry.sheetId)).toEqual([SHEET_C])
    await reopenedA.sync()
    expect(server.changesCalls.slice(changesBefore)).toEqual([reopenedA.status.lastSyncedRevision])
  })

  it('drops a version 1 cache on upgrade, keeping its outbox and issues', async () => {
    server.put(SHEET_A, 1000000)
    await new Promise<void>((resolve, reject) => {
      const request = factory.open('dxr-cloud-v1-user-1', 1)
      request.onupgradeneeded = () => {
        const db = request.result
        db.createObjectStore('records', { keyPath: 'sheetId' }).put({ sheetId: SHEET_B, revision: 9 })
        const outbox = db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true })
        outbox.createIndex('mutationId', 'mutationId', { unique: true })
        outbox.add({
          mutationId: '0195f000-0000-7000-8000-000000000001',
          saveId: 'dsav_one',
          op: 'set',
          sheetId: SHEET_C,
          basedOnRevision: 0,
          value: { achievement: 990000, comboFlag: null, syncFlag: null, dxScore: null },
          entryMethod: 'typed',
          clientEditedAt: '2026-11-01T00:00:00.000Z',
        })
        db.createObjectStore('meta').put({ saveId: 'dsav_one', lastSyncedRevision: 9 }, 'state')
        db.createObjectStore('issues', { keyPath: 'id' })
      }
      request.onsuccess = () => {
        request.result.close()
        resolve()
      }
      request.onerror = () => reject(request.error)
    })

    const repository = await openRepository()
    expect(repository.status).toMatchObject({ pendingCount: 1, lastSyncedRevision: 0 })
    await repository.sync()
    expect(server.changesCalls[0]).toBe(0)
    expect(repository.entries().map((entry) => entry.sheetId)).toEqual([SHEET_A, SHEET_C])
  })

  it('flushes on dispose, waiting at most 3 s, and keeps what it could not send', async () => {
    const sent = await openRepository()
    sent.setManual({ sheetId: SHEET_A, achievementRate: 99 }, 'typed')
    await sent.dispose()
    expect(server.mutateCalls).toHaveLength(1)

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
    const hanging = await openRepository({
      api: { changes: server.api.changes, mutate: () => new Promise(() => {}) },
    })
    hanging.setManual({ sheetId: SHEET_B, achievementRate: 98 }, 'typed')
    let disposed = false
    const disposal = hanging.dispose().then(() => {
      disposed = true
    })
    await vi.advanceTimersByTimeAsync(2_999)
    expect(disposed).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await disposal
    vi.useRealTimers()

    expect((await openRepository()).status.pendingCount).toBe(1)
  })

  it('clears with a revision-guarded delete of every record', async () => {
    server.put(SHEET_A, 990000)
    server.put(SHEET_B, 980000, verifiedProvenance())
    const repository = await openRepository()
    await repository.sync()

    repository.clear()
    expect(repository.entries()).toEqual([])
    await repository.sync()

    expect(server.mutateCalls[0]).toEqual([
      expect.objectContaining({ op: 'delete', sheetId: SHEET_A, basedOnRevision: 1 }),
      expect.objectContaining({ op: 'delete', sheetId: SHEET_B, basedOnRevision: 2 }),
    ])
    expect(server.checksum()).toEqual({ count: 0, sumAchievement: 0 })
  })

  it('scopes issues to the save they were made on', async () => {
    const saveA = await openRepository()
    server.respondOnce = (mutations) => ({
      revision: 0,
      results: mutations.map((mutation) => ({
        mutationId: mutation.mutationId,
        status: 'rejected',
        record: null,
        reason: 'invalid-achievement',
      })),
    })
    saveA.setManual({ sheetId: SHEET_A, achievementRate: 99 }, 'typed')
    await saveA.sync()
    expect(saveA.status.issues).toEqual([expect.objectContaining({ saveId: 'dsav_one', sheetId: SHEET_A })])
    const issueId = saveA.status.issues[0]!.id
    await unload(saveA)

    const saveB = await openRepository({ saveId: 'dsav_other' })
    await saveB.sync()
    expect(saveB.status.issues).toEqual([])
    // An issue of save A is neither applied to nor dismissed from save B
    saveB.reapplyIssue(issueId)
    saveB.dismissIssue(issueId)
    expect(saveB.status.pendingCount).toBe(0)
    await saveB.sync()
    expect(server.mutateCalls).toHaveLength(1)
    await unload(saveB)

    expect((await openRepository()).status.issues).toEqual([expect.objectContaining({ id: issueId })])
  })

  it('applies an issue again in one write: the intent moves from the issues to the outbox atomically', async () => {
    const repository = await openRepository()
    server.respondOnce = (mutations) => ({
      revision: 0,
      results: mutations.map((mutation) => ({
        mutationId: mutation.mutationId,
        status: 'rejected',
        record: null,
        reason: 'invalid-achievement',
      })),
    })
    repository.setManual({ sheetId: SHEET_A, achievementRate: 99 }, 'typed')
    await repository.sync()
    const issueId = repository.status.issues[0]!.id

    const write = vi.spyOn(CloudScoreDatabase.prototype, 'write')
    repository.reapplyIssue(issueId)
    await repository.idle()
    await vi.waitFor(() => expect(write).toHaveBeenCalled())

    expect(write).toHaveBeenCalledTimes(1)
    expect(write.mock.calls[0]![0]).toMatchObject({
      addOutbox: [expect.objectContaining({ op: 'set', sheetId: SHEET_A })],
      deleteIssues: [issueId],
    })
    write.mockRestore()
    await unload(repository)
    const reloaded = await openRepository()
    expect(reloaded.status).toMatchObject({ pendingCount: 1, issues: [] })
  })

  it('keeps a change IndexedDB refused on screen, shows an error, and stores it before the next push', async () => {
    const repository = await openRepository()
    await repository.sync()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const original = CloudScoreDatabase.prototype.write
    const write = vi
      .spyOn(CloudScoreDatabase.prototype, 'write')
      .mockImplementationOnce(() => Promise.reject(new DOMException('Quota exceeded', 'QuotaExceededError')))
      .mockImplementation(function (this: CloudScoreDatabase, ...args) {
        return original.apply(this, args)
      })

    repository.setManual({ sheetId: SHEET_A, achievementRate: 99 }, 'typed')
    await vi.waitFor(() => expect(repository.status.state).toBe('error'))
    expect(repository.status.pendingCount).toBe(1)

    await repository.sync()

    expect(server.mutateCalls).toEqual([[expect.objectContaining({ op: 'set', sheetId: SHEET_A })]])
    expect(repository.status).toMatchObject({ state: 'idle', pendingCount: 0 })
    expect(repository.entries()).toEqual([expect.objectContaining({ sheetId: SHEET_A, achievementRate: 99 })])
    write.mockRestore()
    warn.mockRestore()
  })

  it('keeps a change made while a reload runs on screen', async () => {
    let channel: ScoreBroadcastChannel | null = null
    const createChannel = () => {
      channel = { onmessage: null, postMessage() {}, close() {} }
      return channel
    }
    const repository = await openRepository({ createChannel })
    repository.start()
    await repository.idle()

    const counts: number[] = []
    repository.subscribe(() => counts.push(repository.status.pendingCount))
    // Another tab's broadcast queues a reload; this tab writes before it has read the cache
    channel!.onmessage?.({ data: { type: 'changed', userId: 'user-1', saveId: 'dsav_one' } } as MessageEvent)
    repository.setManual({ sheetId: SHEET_A, achievementRate: 99 }, 'typed')
    await vi.waitFor(() => expect(counts.length).toBeGreaterThanOrEqual(2))
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(counts.every((count) => count === 1)).toBe(true)
    expect(repository.entries()).toEqual([expect.objectContaining({ sheetId: SHEET_A })])
  })

  it('does not swap the records out under a pull when another tab broadcasts between pages', async () => {
    server.pageSize = 1
    server.put(SHEET_A, 1000000)
    server.put(SHEET_B, 990000)
    server.put(SHEET_C, 980000)
    let channel: ScoreBroadcastChannel | null = null
    const createChannel = () => {
      channel = { onmessage: null, postMessage() {}, close() {} }
      return channel
    }
    const reportChecksumMismatch = vi.fn()
    const repository = await openRepository({ createChannel, reportChecksumMismatch })
    server.onChanges = () => {
      if (server.changesCalls.at(-1) === 1) {
        channel!.onmessage?.({ data: { type: 'changed', userId: 'user-1', saveId: 'dsav_one' } } as MessageEvent)
      }
    }

    repository.start()
    await repository.idle()

    expect(reportChecksumMismatch).not.toHaveBeenCalled()
    expect(server.changesCalls.slice(0, 3)).toEqual([0, 1, 2])
    expect(repository.entries()).toHaveLength(3)
  })

  it('saves a change of the DX score alone through the calculator adapter', async () => {
    server.put(SHEET_A, 990000, manualProvenance(), { dxScore: 1000 })
    const repository = await openRepository()
    await repository.sync()

    repository.replaceEntries([{ ...repository.entries()[0]!, dxScore: 1200 }])
    await repository.sync()

    expect(server.mutateCalls).toEqual([
      [expect.objectContaining({ op: 'set', sheetId: SHEET_A, value: expect.objectContaining({ dxScore: 1200 }) })],
    ])
    repository.replaceEntries([...repository.entries()])
    await repository.sync()
    expect(server.mutateCalls).toHaveLength(1)
  })

  it('retries at once when the page comes back online after a failure', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
    const target = new EventTarget()
    const repository = await openRepository({ eventTarget: target as unknown as Window })
    server.failures.push(offline(), offline())
    repository.start()
    await repository.idle()
    await vi.advanceTimersByTimeAsync(2_000)
    await repository.idle()
    expect(repository.status.state).toBe('offline')
    expect(server.changesCalls).toHaveLength(2)
    // Backing off 4 s now; a sync before then waits
    await repository.sync()
    expect(server.changesCalls).toHaveLength(2)

    target.dispatchEvent(new Event('online'))
    await repository.idle()

    expect(server.changesCalls).toHaveLength(3)
    expect(repository.status.state).toBe('idle')
  })

  it("honours a 429's wait when the page comes back online", async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
    const target = new EventTarget()
    const repository = await openRepository({ eventTarget: target as unknown as Window })
    server.failures.push({ status: 429, code: 'TOO_MANY_REQUESTS', data: { retryAfterSeconds: 30 } })
    repository.start()
    await repository.idle()
    expect(server.changesCalls).toHaveLength(1)

    target.dispatchEvent(new Event('online'))
    await repository.idle()
    expect(server.changesCalls).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(30_000)
    await repository.idle()
    expect(server.changesCalls).toHaveLength(2)
  })

  it('syncs when the page becomes visible, not when it is hidden', async () => {
    let visible = false
    const visibilityTarget = new EventTarget()
    const repository = await openRepository({
      isVisible: () => visible,
      visibilityTarget: visibilityTarget as unknown as Document,
    })
    repository.start()
    await repository.idle()
    expect(server.changesCalls).toHaveLength(1)

    visibilityTarget.dispatchEvent(new Event('visibilitychange'))
    await repository.idle()
    expect(server.changesCalls).toHaveLength(1)

    visible = true
    visibilityTarget.dispatchEvent(new Event('visibilitychange'))
    await repository.idle()
    expect(server.changesCalls).toHaveLength(2)

    await unload(repository)
    visibilityTarget.dispatchEvent(new Event('visibilitychange'))
    expect(server.changesCalls).toHaveLength(2)
  })
})

describe('CloudScoreRepository under concurrent tabs and slow pulls', () => {
  /** A promise and its resolver */
  const gate = () => {
    let release!: () => void
    const promise = new Promise<void>((resolve) => (release = resolve))
    return { promise, release }
  }

  it('bases an edit on the record the user sees while later pages of a pull are still loading', async () => {
    server.put(SHEET_A, 990000)
    const held = gate()
    const reached = gate()
    let holdSince: number | null = null
    const repository = await openRepository({
      api: {
        mutate: server.api.mutate,
        changes: async (input) => {
          if (input.since === holdSince) {
            reached.release()
            await held.promise
          }
          return server.api.changes(input)
        },
      },
    })
    await repository.sync()
    expect(repository.status.lastSyncedRevision).toBe(1)

    // The server now has a verified 100% for A (revision 2) and another record (revision 3), one per page
    server.put(SHEET_A, 1000000, verifiedProvenance())
    server.put(SHEET_B, 990000)
    server.pageSize = 1
    holdSince = 2
    const syncing = repository.sync()
    await reached.promise
    // The first page is in, but the view still shows what the user saw: 99%
    expect(repository.entries()).toEqual([expect.objectContaining({ sheetId: SHEET_A, achievementRate: 99 })])
    repository.setManual({ sheetId: SHEET_A, achievementRate: 98 }, 'typed')
    held.release()
    await syncing
    await repository.sync()

    // Based on the 99% the user saw (revision 1): the server keeps the verified 100% and the edit becomes an issue
    expect(server.mutateCalls.flat()[0]).toMatchObject({ sheetId: SHEET_A, basedOnRevision: 1 })
    expect(server.records.get(SHEET_A)!.achievement).toBe(1000000)
    expect(repository.status.issues).toEqual([expect.objectContaining({ sheetId: SHEET_A, kind: 'superseded' })])
  })

  it('never brings back a dismissed issue from a late duplicate acknowledgement of a shared outbox entry', async () => {
    server.put(SHEET_A, 990000)
    const held = gate()
    const reached = gate()
    let holdMutate = false
    const tabA = await openRepository({
      api: {
        changes: server.api.changes,
        mutate: async (input) => {
          const result = await server.api.mutate(input)
          if (holdMutate) {
            reached.release()
            await held.promise
          }
          return result
        },
      },
    })
    await tabA.sync()
    tabA.setManual({ sheetId: SHEET_A, achievementRate: 98 }, 'typed')
    // A verified record lands first: the edit is superseded
    server.put(SHEET_A, 1000000, verifiedProvenance())
    holdMutate = true
    const tabASync = tabA.sync()
    await reached.promise

    // Tab B sends the same (shared) outbox entry, gets the issue and the user dismisses it
    const tabB = await openRepository()
    await tabB.sync()
    expect(tabB.status.issues).toHaveLength(1)
    tabB.dismissIssue(tabB.status.issues[0]!.id)
    await tabB.sync()
    expect(tabB.status.issues).toHaveLength(0)

    // Tab A's answer arrives late: the entry is gone, so its issue is not written again
    held.release()
    await tabASync
    expect(tabA.status.issues).toHaveLength(0)
    const reopened = await openRepository()
    expect(reopened.status.issues).toHaveLength(0)
  })

  it('lets two tabs without Web Locks go quiet once nothing changes', async () => {
    const channels: ScoreBroadcastChannel[] = []
    const createChannel = (): ScoreBroadcastChannel => {
      const channel: ScoreBroadcastChannel = {
        onmessage: null,
        // Delivered later, as a real BroadcastChannel does
        postMessage(message) {
          for (const peer of channels) {
            if (peer !== channel) setTimeout(() => peer.onmessage?.({ data: message } as MessageEvent), 0)
          }
        },
        close() {
          channels.splice(channels.indexOf(channel), 1)
        },
      }
      channels.push(channel)
      return channel
    }
    // Every pull waits until the test lets it through, one at a time
    const waiting: (() => void)[] = []
    let pulls = 0
    const api = {
      mutate: server.api.mutate,
      changes: async (input: Parameters<typeof server.api.changes>[0]) => {
        pulls++
        await new Promise<void>((resolve) => waiting.push(resolve))
        return server.api.changes(input)
      },
    }
    const tabA = await openRepository({ api, createChannel })
    const tabB = await openRepository({ api, createChannel })
    tabA.start()
    tabB.start()
    // Both tabs sync, and each is asked once more while its pull waits
    void tabA.sync()
    void tabB.sync()
    void tabA.sync()
    void tabB.sync()

    const nextPull = async () => {
      for (let i = 0; i < 20; i++) {
        if (waiting.length > 0) return waiting.shift()!
        await new Promise((resolve) => setTimeout(resolve, 5))
      }
      return null
    }
    let released = 0
    for (; released < 20; released++) {
      const release = await nextPull()
      if (!release) break
      release()
    }
    // Two cycles each at most (the first and the one asked for); no pull answered after that asks for another
    expect(released).toBeLessThanOrEqual(4)
    expect(pulls).toBe(released)
    await Promise.all([tabA.idle(), tabB.idle()])
  })
})