import type { ImportJobDTO, ImportRecord, SaveDTO } from '@gekichumai/api-contract'
import { beforeEach, describe, expect, it } from 'vitest'
import type { PlayEntry } from '../../../components/rating/RatingCalculatorAddEntryForm'
import { NothingToImportError } from '../cloudImports'
import {
  backUpLocalSaveBeforeCloud,
  CLOUD_BACKUP_STORAGE_KEY,
  CLOUD_BACKUP_TTL_MS,
  type CloudMigrationApi,
  DEVICE_ID_STORAGE_KEY,
  findMigrationTarget,
  getDeviceId,
  MigrationConflictError,
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
        throw { status: 409, code: 'CONFLICT', data: { reason: 'SAVE_LIMIT', limit: this.saveLimit } }
      }
      return { ...this.addSave({ name: input.name, region: input.region, clientProfileKey: input.clientProfileKey }) }
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
      if (job.status === 'running') {
        const records = this.records.get(input.id)!
        for (const record of input.records) {
          const current = records.get(record.sheetId)
          if (!current || current.achievement < record.achievement) records.set(record.sheetId, record)
        }
        job.counts = counts(job.counts.fetched + input.records.length)
        if (input.chunkIndex === input.chunkCount - 1) job.status = 'succeeded'
        save.revision++
        save.recordCount = records.size
      }
      return { job: { ...job }, revision: save.revision }
    },
    replace: async (input) => {
      this.call('replace', input)
      const save = this.saves.find((candidate) => candidate.id === input.id)!
      if (input.ifRevision !== save.revision) {
        throw { status: 412, code: 'PRECONDITION_FAILED', data: { revision: save.revision } }
      }
      this.records.set(input.id, new Map(input.records.map((record) => [record.sheetId, record])))
      save.revision++
      save.recordCount = input.records.length
      const job = this.job(input.id, 'legacy-local', 'user')
      job.status = 'succeeded'
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
    this.calls.push({ route, input: structuredClone(input) as Record<string, unknown> })
    if (this.failures.length) throw this.failures.shift()
  }
}

const ENTRIES: PlayEntry[] = [
  { sheetId: SHEET_A, achievementRate: 100.5, comboFlag: 'ap', syncFlag: null, source: { provider: 'maimai-net' } },
  // Typed in by hand: no provider to claim
  { sheetId: SHEET_B, achievementRate: 99 },
  // Demo data is never synced, not even as a claim
  { sheetId: SHEET_C, achievementRate: 98, source: { provider: 'demo' as never } },
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
    expect(server.calls[0]!.input).toEqual({ name: 'My scores', region: 'intl', clientProfileKey: 'web-local' })
    const upload = server.calls[1]!.input
    expect(upload).toMatchObject({
      id: outcome.saveId,
      idempotencyKey: 'migrate-device-1234-web-local',
      source: 'legacy-local',
      trigger: 'migration',
      chunkIndex: 0,
      chunkCount: 1,
    })
    expect(upload.rawPayloadSha256).toMatch(/^[0-9a-f]{64}$/)
    // Each record claims its entry's provider at most; never any other provenance
    const records = upload.records as ImportRecord[]
    expect(records.map((record) => [record.sheetId, record.claimedSource])).toEqual([
      [SHEET_A, 'maimai-net'],
      [SHEET_B, null],
      [SHEET_C, null],
    ])
    for (const record of records) {
      expect(Object.keys(record)).not.toContain('verification')
      expect(Object.keys(record)).not.toContain('fetchedBy')
    }
    expect(outcome).toMatchObject({ uploaded: 3, skipped: 0, job: { status: 'succeeded', trigger: 'migration' } })
  })

  it('chunks more than 5000 records under one key', async () => {
    const entries = sheetIds(5001).map((sheetId) => ({ sheetId, achievementRate: 97 }))
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
        server.calls.push({ route: 'clientImport', input: structuredClone(input) })
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
    expect(new Set(keys)).toEqual(new Set(['migrate-device-1234-web-local']))
    expect(server.records.get(outcome.saveId)!.size).toBe(3)
  })

  it('a repeated run after success changes nothing (the job answers as it was)', async () => {
    const first = await migrate()
    const revision = server.saves[0]!.revision
    const second = await migrate()

    expect(second.saveId).toBe(first.saveId)
    expect(second.job?.id).toBe(first.job?.id)
    expect(server.saves[0]!.revision).toBe(revision)
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
        throw { status: 409, code: 'CONFLICT', data: { reason: 'IMPORT_IN_PROGRESS', jobId: running.id } }
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
    await expect(migrate({ entries: [{ sheetId: 'legacy__dxrt__x', achievementRate: 99 }] })).rejects.toBeInstanceOf(
      NothingToImportError,
    )
    expect(server.calls).toEqual([])
  })
})

describe('runCloudMigration: a cloud save made on another device', () => {
  it('merges into it with the same upload', async () => {
    const save = server.addSave({ clientProfileKey: 'web-local', recordCount: 10, revision: 7 })
    const outcome = await migrate({ mode: 'merge', target: save })

    expect(server.routes()).toEqual(['clientImport'])
    expect(server.calls[0]!.input).toMatchObject({ id: save.id, trigger: 'migration', source: 'legacy-local' })
    expect(outcome.saveId).toBe(save.id)
  })

  it('"use cloud only" sends nothing, after backing the local save up', async () => {
    const save = server.addSave({ clientProfileKey: 'web-local' })
    const outcome = await migrate({ mode: 'cloud-only', target: save })

    expect(server.calls).toEqual([])
    expect(outcome).toEqual({ saveId: save.id, uploaded: 0, skipped: 0, job: null })
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
      idempotencyKey: 'migrate-replace-device-1234-web-local-r7',
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
      idempotencyKey: 'migrate-replace-device-1234-web-local-r9',
    })
    expect(server.records.get(save.id)!.size).toBe(3)
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
    const webLocal = save({ id: 'dsav_web', region: 'intl', clientProfileKey: 'web-local' })
    const jpOld = save({ id: 'dsav_old', updatedAt: '2026-10-01T00:00:00.000Z' })
    const jpNew = save({ id: 'dsav_new', updatedAt: '2026-11-02T00:00:00.000Z' })

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
    expect(backup).toEqual({ backedUpAt: '2026-11-03T00:00:00.000Z', value: JSON.stringify(ENTRIES) })

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