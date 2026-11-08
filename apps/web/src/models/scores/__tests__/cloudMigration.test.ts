import type { ImportJobDTO, ImportRecord, SaveDTO } from '@gekichumai/api-contract'
import { beforeEach, describe, expect, it } from 'vitest'
import type { PlayEntry } from '../../../components/rating/RatingCalculatorAddEntryForm'
import { decideImportMerge } from '@gekichumai/maimai-domain'
import { NothingToImportError } from '../cloudImports'
import { type CloudRecord, cloudRecordToScoreRecord } from '../cloudScoreMapping'
import {
  backUpLocalSaveBeforeCloud,
  CLOUD_BACKUP_STORAGE_KEY,
  CLOUD_BACKUP_TTL_MS,
  type CloudMigrationApi,
  DEVICE_ID_STORAGE_KEY,
  findMigrationTarget,
  getDeviceId,
  MigrationCancelledError,
  MigrationConflictError,
  migrationImportRecords,
  migrationErrorCode,
  pruneExpiredCloudBackup,
  runCloudMigration,
  SaveLimitError,
} from '../cloudMigration'

const SHEET_A = 'dsht_e5nsvt8k2a'
const SHEET_B = 'dsht_5mk3yr8gme'
const SHEET_C = 'dsht_kkx38yfx4t'
const NOW = Date.parse('2026-11-03T00:00:00.000Z')
const ALPHABET = '23456789abcdefghjkmnpqrstvwxyz'

function sheetIds(count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    let rest = index
    let suffix = ''
    for (let position = 0; position < 10; position++) {
      suffix = ALPHABET[rest % ALPHABET.length] + suffix
      rest = Math.floor(rest / ALPHABET.length)
    }
    return `dsht_${suffix}`
  })
}

const counts = (fetched: number): ImportJobDTO['counts'] => ({
  fetched,
  inserted: fetched,
  improved: 0,
  provenanceUpgraded: 0,
  unchanged: 0,
  keptUserEdit: 0,
  skippedDeleted: 0,
  skippedUnknownSheet: 0,
  skippedMasked: 0,
  rejected: 0,
})

/**
 * The cloud save routes the migration uses, as the backend answers them: `POST /saves` returns the save of a known
 * `clientProfileKey`, a client import key belongs to one save and runs once per chunk, `/replace` checks `ifRevision`.
 */
class FakeMigrationServer {
  saves: SaveDTO[] = []
  readonly records = new Map<string, Map<string, ImportRecord>>()
  readonly jobs = new Map<string, ImportJobDTO>()
  readonly jobByKey = new Map<string, string>()
  /** The chunks each client import job received */
  readonly received = new Map<string, Set<number>>()
  readonly calls: { route: string; input: Record<string, unknown> }[] = []
  /** Thrown, in order, by the next calls */
  readonly failures: unknown[] = []
  /** Polls of a running job left before it finishes */
  runningPolls = 0
  saveLimit = 10
  private nextId = 1

  readonly api: CloudMigrationApi = {
    listSaves: async () => {
      this.call('listSaves', {})
      return this.saves.map((save) => ({ ...save }))
    },
    createSave: async (input) => {
      this.call('createSave', input)
      const existing = this.saves.find((save) => save.clientProfileKey === input.clientProfileKey)
      if (existing) return { ...existing }
      if (this.saves.length >= this.saveLimit) {
        throw {
          status: 409,
          code: 'CONFLICT',
          data: { reason: 'SAVE_LIMIT', limit: this.saveLimit },
        }
      }
      return {
        ...this.addSave({
          name: input.name,
          region: input.region,
          clientProfileKey: input.clientProfileKey,
        }),
      }
    },
    clientImport: async (input) => {
      this.call('clientImport', input)
      const save = this.saves.find((candidate) => candidate.id === input.id)
      if (!save) throw { status: 404, code: 'NOT_FOUND' }
      let job = this.jobs.get(this.jobByKey.get(input.idempotencyKey) ?? '')
      if (job && job.saveId !== input.id) throw { status: 400, code: 'BAD_REQUEST' }
      if (!job) {
        job = this.job(input.id, 'legacy-local', input.trigger)
        this.jobByKey.set(input.idempotencyKey, job.id)
      }
      const received = this.received.get(job.id) ?? new Set<number>()
      this.received.set(job.id, received)
      // A chunk the job already received, or any chunk of a job that ended, answers the job as it is
      if (job.status === 'running' && !received.has(input.chunkIndex)) {
        received.add(input.chunkIndex)
        const records = this.records.get(input.id)!
        for (const record of input.records) {
          const current = records.get(record.sheetId)
          if (!current || current.achievement < record.achievement) records.set(record.sheetId, record)
        }
        job.counts = counts(job.counts.fetched + input.records.length)
        if (received.size === input.chunkCount) job.status = 'succeeded'
        save.revision++
        save.recordCount = records.size
      }
      return { job: { ...job }, revision: save.revision }
    },
    replace: async (input) => {
      this.call('replace', input)
      const save = this.saves.find((candidate) => candidate.id === input.id)!
      // As the backend: a known key answers its job, whatever its save
      const replayed = this.jobs.get(this.jobByKey.get(input.idempotencyKey) ?? '')
      if (replayed) return { job: { ...replayed }, revision: save.revision }
      if (input.ifRevision !== save.revision) {
        throw {
          status: 412,
          code: 'PRECONDITION_FAILED',
          data: { revision: save.revision },
        }
      }
      const current = this.records.get(input.id)!
      // As the backend: an item it rejects (here: no achievement) keeps the chart it names
      const accepted = input.records.filter((record): record is ImportRecord => typeof record.achievement === 'number')
      const next = new Map(accepted.map((record) => [record.sheetId, record]))
      for (const record of input.records) {
        const kept = current.get(record.sheetId as string)
        if (typeof record.achievement !== 'number' && kept) next.set(record.sheetId as string, kept)
      }
      // As the backend: a replace that changes nothing writes nothing, and the revision stays
      const unchanged =
        current.size === next.size &&
        [...next].every(([sheetId, record]) => JSON.stringify(current.get(sheetId)) === JSON.stringify(record))
      this.records.set(input.id, next)
      if (!unchanged) save.revision++
      save.recordCount = next.size
      const job = this.job(input.id, 'legacy-local', 'user')
      job.status = 'succeeded'
      job.counts = unchanged
        ? { ...counts(input.records.length), inserted: 0, unchanged: input.records.length }
        : counts(input.records.length)
      this.jobByKey.set(input.idempotencyKey, job.id)
      return { job: { ...job }, revision: save.revision }
    },
    getImportJob: async (jobId) => {
      this.call('getImportJob', { jobId })
      const job = this.jobs.get(jobId)!
      if (job.status === 'running' && this.runningPolls-- <= 0) job.status = 'succeeded'
      return { ...job }
    },
  }

  addSave(fields: Partial<SaveDTO> = {}): SaveDTO {
    const save: SaveDTO = {
      id: `dsav_${this.nextId++}`,
      name: 'Main',
      region: 'jp',
      gameVersion: null,
      clientProfileKey: null,
      revision: 0,
      recordCount: 0,
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
      latestSnapshot: null,
      ...fields,
    }
    this.saves.push(save)
    this.records.set(save.id, new Map())
    return save
  }

  /** What the server does to a client job left running for 15 minutes */
  abandon(jobId: string) {
    const job = this.jobs.get(jobId)!
    job.status = 'failed'
    job.errorCode = 'abandoned'
  }

  deleteSave(saveId: string) {
    this.saves = this.saves.filter((save) => save.id !== saveId)
  }

  /** A job of another action that is still running on the save */
  startRunning(saveId: string): ImportJobDTO {
    return this.job(saveId, 'lxns', 'auto')
  }

  routes = () => this.calls.map((call) => call.route)

  private job(saveId: string, source: ImportJobDTO['source'], trigger: ImportJobDTO['trigger']): ImportJobDTO {
    const job: ImportJobDTO = {
      id: `dimp_${this.nextId++}`,
      saveId,
      source,
      fetchedBy: 'client',
      trigger,
      sourceAccountId: null,
      sourceAccountKind: null,
      status: 'running',
      startedAt: '2026-11-03T00:00:00.000Z',
      fetchedAt: null,
      finishedAt: null,
      rawPayloadSha256: null,
      counts: counts(0),
      errorCode: null,
    }
    this.jobs.set(job.id, job)
    return job
  }

  private call(route: string, input: object) {
    this.calls.push({
      route,
      input: structuredClone(input) as Record<string, unknown>,
    })
    if (this.failures.length) throw this.failures.shift()
  }
}

const ENTRIES: PlayEntry[] = [
  {
    sheetId: SHEET_A,
    achievementRate: 100.5,
    comboFlag: 'ap',
    syncFlag: null,
    source: { provider: 'maimai-net' },
  },
  // Typed in by hand: no provider to claim
  { sheetId: SHEET_B, achievementRate: 99 },
  // Demo data is never synced, not even as a claim
  {
    sheetId: SHEET_C,
    achievementRate: 98,
    source: { provider: 'demo' as never },
  },
]

let server: FakeMigrationServer
let storage: Storage

const migrate = (overrides: Partial<Parameters<typeof runCloudMigration>[0]> = {}) =>
  runCloudMigration({
    api: server.api,
    entries: ENTRIES,
    mode: 'fresh',
    region: 'intl',
    name: 'My scores',
    deviceId: 'device-1234',
    storage,
    now: () => NOW,
    retryDelayMs: 0,
    pollIntervalMs: 0,
    ...overrides,
  })

beforeEach(() => {
  server = new FakeMigrationServer()
  window.localStorage.clear()
  storage = window.localStorage
  storage.setItem('rating-calculator-entries', JSON.stringify(ENTRIES))
})

describe('runCloudMigration: no cloud save yet', () => {
  it('creates the web-local save in the selected region, then uploads every record as a migration job', async () => {
    const outcome = await migrate()

    expect(server.routes()).toEqual(['createSave', 'clientImport'])
    expect(server.calls[0]!.input).toEqual({
      name: 'My scores',
      region: 'intl',
      clientProfileKey: 'web-local',
    })
    const upload = server.calls[1]!.input
    expect(upload).toMatchObject({
      id: outcome.saveId,
      source: 'legacy-local',
      trigger: 'migration',
      chunkIndex: 0,
      chunkCount: 1,
    })
    // Every backup the user starts has its own nonce
    expect(upload.idempotencyKey).toMatch(/^migrate-device-1234-web-local-[0-9a-f]{16}-\w{8}$/)
    expect(upload.rawPayloadSha256).toMatch(/^[0-9a-f]{64}$/)
    // Each record claims its entry's provider at most; never any other provenance
    const records = upload.records as ImportRecord[]
    // In sheet ID order, the order the upload's key hashes
    expect(records.map((record) => [record.sheetId, record.claimedSource])).toEqual([
      [SHEET_B, null],
      [SHEET_A, 'maimai-net'],
      [SHEET_C, null],
    ])
    for (const record of records) {
      expect(Object.keys(record)).not.toContain('verification')
      expect(Object.keys(record)).not.toContain('fetchedBy')
    }
    expect(outcome).toMatchObject({
      uploaded: 3,
      skipped: 0,
      job: { status: 'succeeded', trigger: 'migration' },
    })
  })

  it('chunks more than 5000 records under one key', async () => {
    const entries = sheetIds(5001).map((sheetId) => ({
      sheetId,
      achievementRate: 97,
    }))
    await migrate({ entries })

    const uploads = server.calls.filter((call) => call.route === 'clientImport').map((call) => call.input)
    expect(uploads.map((input) => [input.chunkIndex, input.chunkCount, (input.records as unknown[]).length])).toEqual([
      [0, 2, 5000],
      [1, 2, 1],
    ])
    expect(new Set(uploads.map((input) => input.idempotencyKey)).size).toBe(1)
  })

  it('can be retried after a failure: the same save and key, nothing to clean up', async () => {
    // Every attempt of the first run's upload fails without an answer, after the save was made
    const first = server.api.clientImport
    let failing = 3
    server.api.clientImport = async (input) => {
      if (failing-- > 0) {
        server.calls.push({
          route: 'clientImport',
          input: structuredClone(input),
        })
        throw new TypeError('offline')
      }
      return first(input)
    }

    await expect(migrate()).rejects.toBeInstanceOf(TypeError)
    expect(server.saves).toHaveLength(1)

    const outcome = await migrate()

    expect(server.saves).toHaveLength(1)
    expect(outcome.saveId).toBe(server.saves[0]!.id)
    const keys = server.calls.filter((call) => call.route === 'clientImport').map((call) => call.input.idempotencyKey)
    expect(new Set(keys).size).toBe(1)
    expect(server.records.get(outcome.saveId)!.size).toBe(3)
  })

  const uploadKeys = () =>
    server.calls.filter((call) => call.route === 'clientImport').map((call) => call.input.idempotencyKey as string)

  it('resumes an interrupted chunked upload under the same key', async () => {
    const entries = sheetIds(5001).map((sheetId) => ({
      sheetId,
      achievementRate: 97,
    }))
    const original = server.api.clientImport
    server.api.clientImport = async (input) => {
      if (input.chunkIndex === 1) throw { status: 400, code: 'BAD_REQUEST' }
      return original(input)
    }
    await expect(migrate({ entries })).rejects.toBeTruthy()
    server.api.clientImport = original

    const outcome = await migrate({ entries })

    expect(new Set(uploadKeys()).size).toBe(1)
    expect(outcome.job?.status).toBe('succeeded')
    expect(server.records.get(outcome.saveId)!.size).toBe(5001)
  })

  it('starts over under a new key once the interrupted upload was abandoned', async () => {
    const entries = sheetIds(5001).map((sheetId) => ({
      sheetId,
      achievementRate: 97,
    }))
    const original = server.api.clientImport
    server.api.clientImport = async (input) => {
      if (input.chunkIndex === 1) throw { status: 400, code: 'BAD_REQUEST' }
      return original(input)
    }
    await expect(migrate({ entries })).rejects.toBeTruthy()
    server.api.clientImport = original
    // The tab was closed; 15 minutes later the server gave the job up
    const [abandoned] = server.jobs.keys()
    server.abandon(abandoned!)

    const outcome = await migrate({ entries })

    const keys = uploadKeys()
    expect(new Set(keys).size).toBe(2)
    expect(keys.at(-1)).toMatch(/^migrate-device-1234-web-local-[0-9a-f]{16}-\w{8}$/)
    expect(outcome.job).toMatchObject({ status: 'succeeded' })
    expect(outcome.job?.id).not.toBe(abandoned)
    expect(server.records.get(outcome.saveId)!.size).toBe(5001)

    // And a backup after that one finished is a new request: neither the abandoned key nor the finished one
    const sent = uploadKeys().length
    await migrate({ entries })
    const later = new Set(uploadKeys().slice(sent))
    expect(later.size).toBe(1)
    expect(keys).not.toContain([...later][0])
  })

  it('uploads again into a new save once the first one was deleted', async () => {
    const first = await migrate()
    server.deleteSave(first.saveId)

    const second = await migrate()

    expect(second.saveId).not.toBe(first.saveId)
    expect(second.job?.id).not.toBe(first.job?.id)
    expect(second.job?.saveId).toBe(second.saveId)
    expect(server.records.get(second.saveId)!.size).toBe(3)
  })

  it('uploads entries added since an earlier migration', async () => {
    const save = server.addSave({ clientProfileKey: 'web-local' })
    const first = await migrate({ mode: 'merge', target: save })
    const added: PlayEntry = { sheetId: sheetIds(1)[0]!, achievementRate: 97 }

    const second = await migrate({
      mode: 'merge',
      target: save,
      entries: [...ENTRIES, added],
    })

    expect(second.job?.id).not.toBe(first.job?.id)
    expect(server.records.get(save.id)!.has(added.sheetId)).toBe(true)
  })

  it('a new backup after a finished one uploads again, even with the same records', async () => {
    const first = await migrate()
    // Records the save lost since (a delete, or a replace from another device that kept the save)
    server.records.get(first.saveId)!.clear()

    const second = await migrate()

    expect(second.saveId).toBe(first.saveId)
    expect(second.job?.id).not.toBe(first.job?.id)
    expect(second.job?.status).toBe('succeeded')
    expect(server.records.get(first.saveId)!.size).toBe(3)
    const keys = uploadKeys()
    expect(new Set(keys).size).toBe(2)
    expect(keys.at(-1)).toMatch(/^migrate-device-1234-web-local-[0-9a-f]{16}-\w{8}$/)

    // And the one after that is new again
    const third = await migrate()
    expect(third.job?.id).not.toBe(second.job?.id)
    expect(new Set(uploadKeys()).size).toBe(3)
  })

  it('resumes in the same chunks when the entries were reordered before the retry', async () => {
    const entries = sheetIds(5001).map((sheetId) => ({
      sheetId,
      achievementRate: 97,
    }))
    const original = server.api.clientImport
    server.api.clientImport = async (input) => {
      if (input.chunkIndex === 1) throw { status: 400, code: 'BAD_REQUEST' }
      return original(input)
    }
    await expect(migrate({ entries })).rejects.toBeTruthy()
    server.api.clientImport = original
    expect(server.records.get(server.saves[0]!.id)!.size).toBe(5000)

    // The local save changed its order since (a sort, an edit), not its records: the same upload, resumed
    const outcome = await migrate({ entries: [...entries].reverse() })

    expect(new Set(uploadKeys()).size).toBe(1)
    expect(outcome.job?.status).toBe('succeeded')
    const stored = server.records.get(outcome.saveId)!
    expect(stored.size).toBe(5001)
    for (const { sheetId } of entries) expect(stored.has(sheetId)).toBe(true)
  })

  it('uploads a backup again when its records equal an older, finished one (A, then B, then A)', async () => {
    const save = server.addSave({ clientProfileKey: 'web-local' })
    const contentA: PlayEntry[] = [{ sheetId: SHEET_A, achievementRate: 100.5 }]
    const contentB: PlayEntry[] = [...contentA, { sheetId: SHEET_B, achievementRate: 99 }]
    const first = await migrate({ mode: 'merge', target: save, entries: contentA })
    await migrate({ mode: 'merge', target: save, entries: contentB })
    // Another device replaces the save, lowering the chart's score
    await server.api.replace({
      id: save.id,
      ifRevision: server.saves[0]!.revision,
      idempotencyKey: 'other-device-replace',
      source: 'legacy-local',
      records: [
        {
          sheetId: SHEET_A,
          achievement: 990000,
          comboFlag: null,
          syncFlag: null,
          dxScore: null,
          best50Bucket: null,
          providerRecordId: null,
          claimedSource: null,
        },
      ],
    })

    const third = await migrate({ mode: 'merge', target: save, entries: contentA })

    expect(third.job?.id).not.toBe(first.job?.id)
    expect(third.job?.status).toBe('succeeded')
    expect(new Set(uploadKeys()).size).toBe(3)
    expect(server.records.get(save.id)!.get(SHEET_A)?.achievement).toBe(1005000)
  })

  it('collapses duplicate entries of a chart as the rating calculator reads them', async () => {
    const outcome = await migrate({
      entries: [
        // The highest achievement, without flags, from maimai NET
        {
          sheetId: SHEET_A,
          achievementRate: 100.5,
          source: { provider: 'maimai-net', providerId: 'net-1' },
        },
        // The strongest flags on a lower score, from Diving-Fish, with its b35 hint
        {
          sheetId: SHEET_A,
          achievementRate: 100,
          comboFlag: 'ap',
          syncFlag: 'fsdp',
          source: { provider: 'diving-fish', providerId: 'df-1', best50Bucket: 'b35' },
        },
        // The highest DX score, and the hint the calculator keeps: the AP row's rating with its bonus, a higher
        // achievement
        {
          sheetId: SHEET_A,
          achievementRate: 100.4,
          comboFlag: 'fc',
          dxScore: 2400,
          source: { provider: 'diving-fish', providerId: 'df-2', best50Bucket: 'b15' },
        },
        { sheetId: SHEET_A, achievementRate: 99, dxScore: 2100 },
        // Duplicates of one provider keep its claim
        { sheetId: SHEET_B, achievementRate: 99, source: { provider: 'lxns' } },
        { sheetId: SHEET_B, achievementRate: 98, comboFlag: 'fcp', source: { provider: 'lxns' } },
        { sheetId: SHEET_C, achievementRate: 97 },
      ],
      resolveInternalLevel: () => 13.5,
    })

    const records = server.calls.find((call) => call.route === 'clientImport')!.input.records as ImportRecord[]
    expect(
      [...records].sort(
        (a, b) => [SHEET_A, SHEET_B, SHEET_C].indexOf(a.sheetId) - [SHEET_A, SHEET_B, SHEET_C].indexOf(b.sheetId),
      ),
    ).toEqual([
      {
        sheetId: SHEET_A,
        achievement: 1005000,
        comboFlag: 'ap',
        syncFlag: 'fsdp',
        dxScore: 2400,
        best50Bucket: 'b15',
        // The rows name different providers (and one none): the collapsed record claims none
        providerRecordId: null,
        claimedSource: null,
      },
      {
        sheetId: SHEET_B,
        achievement: 990000,
        comboFlag: 'fcp',
        syncFlag: null,
        dxScore: null,
        best50Bucket: null,
        providerRecordId: null,
        claimedSource: 'lxns',
      },
      expect.objectContaining({ sheetId: SHEET_C, achievement: 970000 }),
    ])
    expect(outcome).toMatchObject({ uploaded: 3, skipped: 0 })

    // Stored by the server's merge and read back from the cloud, the calculator's hint survives, unverified
    const uploaded = records.find((record) => record.sheetId === SHEET_A)!
    const decision = decideImportMerge(null, uploaded, {
      id: 'dimp_mig',
      source: 'legacy-local',
      fetchedBy: 'client',
      trigger: 'migration',
      startedAt: '2026-11-03T00:00:00.000Z',
    })
    expect(decision.next).not.toBeNull()
    const next = decision.next!
    const read = cloudRecordToScoreRecord(
      {
        sheetId: SHEET_A,
        achievement: next.achievement,
        comboFlag: next.comboFlag,
        syncFlag: next.syncFlag,
        dxScore: next.dxScore,
        best50Bucket: next.best50Bucket,
        providerRecordId: next.providerRecordId,
        provenance: next.provenance,
      } as CloudRecord,
      { songId: 'dsng_test', type: 'dx', difficulty: 'master' },
    )
    expect(read).toMatchObject({ best50Bucket: 'b15', comboFlag: 'ap', syncFlag: 'fsdp', dxScore: 2400 })
    expect(read.provenance?.verification).toBe('client_reported')
  })

  it('moves entries still on legacy sheet IDs to public ones before uploading them', async () => {
    const legacy = 'legacysong__dxrt__dx__dxrt__master'
    const seen: string[][] = []
    const outcome = await migrate({
      entries: [...ENTRIES, { sheetId: legacy, achievementRate: 99.5 }],
      migrateLegacyEntries: async (entries) => {
        seen.push(entries.map((entry) => entry.sheetId))
        return entries.map((entry) => (entry.sheetId === legacy ? { ...entry, sheetId: sheetIds(1)[0]! } : entry))
      },
    })

    expect(seen).toEqual([[SHEET_A, SHEET_B, SHEET_C, legacy]])
    expect(outcome.uploaded).toBe(4)
    expect(server.records.get(outcome.saveId)!.get(sheetIds(1)[0]!)?.achievement).toBe(995000)
  })

  it('waits for an import already running on the save, then sends the chunk again', async () => {
    const save = server.addSave({ clientProfileKey: 'web-local' })
    const running = server.startRunning(save.id)
    server.runningPolls = 1
    const original = server.api.clientImport
    let conflicted = false
    server.api.clientImport = async (input) => {
      if (!conflicted) {
        conflicted = true
        throw {
          status: 409,
          code: 'CONFLICT',
          data: { reason: 'IMPORT_IN_PROGRESS', jobId: running.id },
        }
      }
      return original(input)
    }

    const outcome = await migrate()

    expect(server.routes()).toEqual(['createSave', 'getImportJob', 'getImportJob', 'clientImport'])
    expect(outcome.job?.status).toBe('succeeded')
  })

  it('reports the save limit', async () => {
    server.saveLimit = 0
    await expect(migrate()).rejects.toBeInstanceOf(SaveLimitError)
  })

  it('sends nothing when no entry can be uploaded', async () => {
    await expect(
      migrate({
        entries: [{ sheetId: 'legacy__dxrt__x', achievementRate: 99 }],
      }),
    ).rejects.toBeInstanceOf(NothingToImportError)
    expect(server.calls).toEqual([])
  })
})

describe('runCloudMigration: a cloud save made on another device', () => {
  it('merges into it with the same upload', async () => {
    const save = server.addSave({
      clientProfileKey: 'web-local',
      recordCount: 10,
      revision: 7,
    })
    const outcome = await migrate({ mode: 'merge', target: save })

    expect(server.routes()).toEqual(['clientImport'])
    expect(server.calls[0]!.input).toMatchObject({
      id: save.id,
      trigger: 'migration',
      source: 'legacy-local',
    })
    expect(outcome.saveId).toBe(save.id)
  })

  it('"use cloud only" sends nothing, after backing the local save up', async () => {
    const save = server.addSave({ clientProfileKey: 'web-local' })
    const outcome = await migrate({ mode: 'cloud-only', target: save })

    expect(server.calls).toEqual([])
    expect(outcome).toEqual({
      saveId: save.id,
      uploaded: 0,
      skipped: 0,
      job: null,
    })
    expect(storage.getItem(CLOUD_BACKUP_STORAGE_KEY)).not.toBeNull()
    // The local save stays as the signed-out save
    expect(storage.getItem('rating-calculator-entries')).toBe(JSON.stringify(ENTRIES))
  })

  it('replaces it at the revision the user saw', async () => {
    const save = server.addSave({ clientProfileKey: 'web-local', revision: 7 })
    await migrate({ mode: 'replace', target: save })

    expect(server.routes()).toEqual(['replace'])
    expect(server.calls[0]!.input).toMatchObject({
      id: save.id,
      ifRevision: 7,
      idempotencyKey: expect.stringMatching(/^migrate-replace-device-1234-web-local-[0-9a-f]{16}-r7$/),
      source: 'legacy-local',
    })
    expect(server.records.get(save.id)!.size).toBe(3)
  })

  it('answers a 412 with the revision the save has now, and replaces nothing', async () => {
    const save = server.addSave({ clientProfileKey: 'web-local', revision: 7 })
    const seen = { ...save }
    server.saves[0]!.revision = 9

    const error = await migrate({ mode: 'replace', target: seen }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(MigrationConflictError)
    expect((error as MigrationConflictError).revision).toBe(9)
    expect(server.records.get(save.id)!.size).toBe(0)

    // Confirmed again over the new revision: a new request
    await migrate({ mode: 'replace', target: { ...seen, revision: 9 } })
    expect(server.calls.at(-1)!.input).toMatchObject({
      ifRevision: 9,
      idempotencyKey: expect.stringMatching(/-r9$/),
    })
    expect(server.records.get(save.id)!.size).toBe(3)
  })

  it('replaces another save at the same revision as a new request', async () => {
    const first = server.addSave({
      clientProfileKey: 'web-local',
      revision: 4,
    })
    await migrate({ mode: 'replace', target: first })
    server.deleteSave(first.id)
    const second = server.addSave({
      clientProfileKey: 'web-local',
      revision: 4,
    })

    const outcome = await migrate({ mode: 'replace', target: second })

    const [a, b] = server.calls.filter((call) => call.route === 'replace').map((call) => call.input.idempotencyKey)
    expect(a).not.toBe(b)
    expect(outcome.job?.saveId).toBe(second.id)
    expect(server.records.get(second.id)!.size).toBe(3)
  })
})

describe('runCloudMigration: review fixes', () => {
  it('never deletes a cloud chart whose local entry could not be converted', async () => {
    const save = server.addSave({ clientProfileKey: 'web-local', revision: 2 })
    const cloudB: ImportRecord = {
      sheetId: SHEET_B,
      achievement: 990000,
      comboFlag: null,
      syncFlag: null,
      dxScore: null,
      best50Bucket: null,
      providerRecordId: null,
      claimedSource: null,
    }
    server.records.get(save.id)!.set(SHEET_B, cloudB)
    const entries: PlayEntry[] = [
      { sheetId: SHEET_A, achievementRate: 100 },
      // An out-of-range DX score: the entry cannot be sent
      { sheetId: SHEET_B, achievementRate: 100.5, dxScore: 100001 },
    ]

    const outcome = await migrate({ mode: 'replace', target: save, entries })

    // The replace names B (the server rejects it, which keeps the chart) instead of leaving it out
    expect(server.calls.at(-1)!.input.records).toEqual([
      expect.objectContaining({ sheetId: SHEET_A }),
      { sheetId: SHEET_B },
    ])
    expect(server.records.get(save.id)!.get(SHEET_B)).toEqual(cloudB)
    expect(server.records.get(save.id)!.has(SHEET_A)).toBe(true)
    expect(outcome.skipped).toBe(1)
  })

  it('applies other records confirmed at an unchanged revision after a no-op replace (its answer lost)', async () => {
    const save = server.addSave({ clientProfileKey: 'web-local', revision: 7 })
    await migrate({ mode: 'replace', target: save })
    const revision = server.saves[0]!.revision
    // The same replace again changes nothing (the revision stays), and its answer is lost
    server.failures.push(new TypeError('Failed to fetch'))
    await migrate({ mode: 'replace', target: { ...save, revision } }).catch(() => {})
    expect(server.saves[0]!.revision).toBe(revision)

    // Changed scores, confirmed over that same revision: a new request, applied
    const changed: PlayEntry[] = [{ sheetId: SHEET_A, achievementRate: 100.7 }]
    await migrate({ mode: 'replace', target: { ...save, revision }, entries: changed })
    const keys = server.calls.filter((call) => call.route === 'replace').map((call) => call.input.idempotencyKey)
    expect(new Set(keys.slice(1)).size).toBe(2)
    expect([...server.records.get(save.id)!.values()].map((record) => record.achievement)).toEqual([1007000])
  })

  it('reports what the job kept, and every entry left out on this device or by the server', async () => {
    const entries: PlayEntry[] = [
      { sheetId: SHEET_A, achievementRate: 100.5 },
      // The server would reject this DX score: left out on this device
      { sheetId: SHEET_B, achievementRate: 99, dxScore: 100001 },
      { sheetId: SHEET_C, achievementRate: 98 },
    ]
    const clientImport = server.api.clientImport
    server.api.clientImport = async (input) => {
      const result = await clientImport(input)
      // The cloud save had C deleted: the merge skips it
      return { ...result, job: { ...result.job, counts: { ...counts(2), inserted: 1, skippedDeleted: 1 } } }
    }
    const outcome = await migrate({ entries })
    expect(outcome).toMatchObject({ uploaded: 1, skipped: 2 })
  })

  it('keeps the best 50 hint a single entry stores in providerConfig', () => {
    const { records } = migrationImportRecords([
      { sheetId: SHEET_A, achievementRate: 99, providerConfig: { divingFish: { ratingEligibility: 'b35' } } },
    ])
    expect(records).toEqual([expect.objectContaining({ sheetId: SHEET_A, best50Bucket: 'b35', claimedSource: null })])
  })

  it('sends nothing for another account: the session changed before the first write', async () => {
    const api = { ...server.api, currentUserId: async () => 'user-b' }
    const error = await migrate({ api, userId: 'user-a' }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(MigrationCancelledError)
    expect(server.routes()).toEqual([])
    expect(server.saves).toHaveLength(0)
  })

  it('stops between requests once aborted (the dialog closed), and sends nothing more', async () => {
    const controller = new AbortController()
    let account = 'user-a'
    const createSave = server.api.createSave
    const api: CloudMigrationApi = {
      ...server.api,
      currentUserId: async () => account,
      createSave: async (input) => {
        const save = await createSave(input)
        // Another account signs in while the save is created; this tab closes the dialog
        account = 'user-b'
        controller.abort()
        return save
      },
    }
    const error = await migrate({ api, userId: 'user-a', signal: controller.signal }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(MigrationCancelledError)
    expect(server.routes()).toEqual(['createSave'])
    expect(migrationErrorCode(error)).toBe('cancelled')
  })
})

describe('findMigrationTarget', () => {
  const save = (fields: Partial<SaveDTO>): SaveDTO => ({
    id: 'dsav_x',
    name: 'x',
    region: 'jp',
    gameVersion: null,
    clientProfileKey: null,
    revision: 0,
    recordCount: 0,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    latestSnapshot: null,
    ...fields,
  })

  it('matches the web-local save first, then the newest save of the region', () => {
    const webLocal = save({
      id: 'dsav_web',
      region: 'intl',
      clientProfileKey: 'web-local',
    })
    const jpOld = save({
      id: 'dsav_old',
      updatedAt: '2026-10-01T00:00:00.000Z',
    })
    const jpNew = save({
      id: 'dsav_new',
      updatedAt: '2026-11-02T00:00:00.000Z',
    })

    expect(findMigrationTarget([jpOld, webLocal, jpNew], 'jp')?.id).toBe('dsav_web')
    expect(findMigrationTarget([jpOld, jpNew], 'jp')?.id).toBe('dsav_new')
    expect(findMigrationTarget([jpOld, jpNew], 'cn')).toBeNull()
    expect(findMigrationTarget([], 'jp')).toBeNull()
  })
})

describe('the local backup', () => {
  it('copies the local save with the time, once, and keeps the original', () => {
    expect(backUpLocalSaveBeforeCloud(storage, NOW)).toBe(true)
    const backup = JSON.parse(storage.getItem(CLOUD_BACKUP_STORAGE_KEY)!)
    expect(backup).toEqual({
      backedUpAt: '2026-11-03T00:00:00.000Z',
      value: JSON.stringify(ENTRIES),
    })

    // A retry keeps the first copy
    storage.setItem('rating-calculator-entries', '[]')
    backUpLocalSaveBeforeCloud(storage, NOW + 1000)
    expect(JSON.parse(storage.getItem(CLOUD_BACKUP_STORAGE_KEY)!)).toEqual(backup)
    expect(storage.getItem('rating-calculator-entries')).toBe('[]')
  })

  it('expires after 30 days', () => {
    backUpLocalSaveBeforeCloud(storage, NOW)

    pruneExpiredCloudBackup(storage, NOW + CLOUD_BACKUP_TTL_MS - 1)
    expect(storage.getItem(CLOUD_BACKUP_STORAGE_KEY)).not.toBeNull()

    pruneExpiredCloudBackup(storage, NOW + CLOUD_BACKUP_TTL_MS)
    expect(storage.getItem(CLOUD_BACKUP_STORAGE_KEY)).toBeNull()
    expect(storage.getItem('rating-calculator-entries')).not.toBeNull()
  })

  it('replaces an expired backup with a fresh one, and removes an unreadable one', () => {
    backUpLocalSaveBeforeCloud(storage, NOW)
    storage.setItem('rating-calculator-entries', '[]')
    backUpLocalSaveBeforeCloud(storage, NOW + CLOUD_BACKUP_TTL_MS)
    expect(JSON.parse(storage.getItem(CLOUD_BACKUP_STORAGE_KEY)!).value).toBe('[]')

    storage.setItem(CLOUD_BACKUP_STORAGE_KEY, 'not json')
    pruneExpiredCloudBackup(storage, NOW)
    expect(storage.getItem(CLOUD_BACKUP_STORAGE_KEY)).toBeNull()
  })

  it('is made before anything is sent, even when the upload fails', async () => {
    server.failures.push({ status: 400, code: 'BAD_REQUEST' })
    await expect(migrate()).rejects.toBeTruthy()
    expect(storage.getItem(CLOUD_BACKUP_STORAGE_KEY)).not.toBeNull()
  })
})

describe('getDeviceId', () => {
  it('creates a random ID once and keeps it', () => {
    const id = getDeviceId(storage)
    expect(id).toMatch(/^[\w-]{8,64}$/)
    expect(storage.getItem(DEVICE_ID_STORAGE_KEY)).toBe(id)
    expect(getDeviceId(storage)).toBe(id)
    // The key it makes is a valid idempotency key
    expect(`migrate-${id}-web-local`).toMatch(/^[A-Za-z0-9][\w.:-]{7,127}$/)
  })
})

describe('migrationErrorCode', () => {
  it('is a short code, never a message', () => {
    expect(migrationErrorCode(new MigrationConflictError(3))).toBe('conflict')
    expect(migrationErrorCode(new SaveLimitError())).toBe('save_limit')
    expect(migrationErrorCode(new TypeError('Failed to fetch https://example.com/user/1'))).toBe('network')
    expect(migrationErrorCode({ status: 500, message: 'user 1 broke' })).toBe('http_500')
    expect(migrationErrorCode({ code: 'TOO_MANY_REQUESTS' })).toBe('too_many_requests')
    expect(migrationErrorCode({ code: 'secret value user@example.com' })).toBe('unknown')
  })
})