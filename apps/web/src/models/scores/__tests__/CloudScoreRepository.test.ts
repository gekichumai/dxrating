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
import { UnsupportedScoreOperationError } from '../ScoreRepository'
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

  it('never uploads records it pulled: imports are not available until server imports land', async () => {
    server.put(SHEET_A, 990000, manualProvenance())
    const repository = await openRepository()
    await repository.sync()

    await expect(
      repository.applyImport([{ sheetId: SHEET_B, achievementRate: 99 }], { source: 'aqua-dx', mode: 'merge' }),
    ).rejects.toBeInstanceOf(UnsupportedScoreOperationError)
    expect(() => repository.runServerImport('lxns', {})).toThrow(UnsupportedScoreOperationError)
    await repository.sync()
    expect(server.mutateCalls).toEqual([])
    expect(repository.entries()).toHaveLength(1)
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