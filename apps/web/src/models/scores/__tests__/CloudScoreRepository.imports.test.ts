import {
  type ImportJobDTO,
  type ImportRecordInput,
  ImportRecordSchema,
  type ImportResultDTO,
} from '@gekichumai/api-contract'
import type { Provenance } from '@gekichumai/maimai-domain'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PlayEntry } from '../../../components/rating/RatingCalculatorAddEntryForm'
import {
  autoNetImportKey,
  chunkPayloadSha256,
  CLIENT_IMPORT_BODY_LIMIT_BYTES,
  CloudClearNotSentError,
  CloudImportHttpError,
  entriesToImportRecords,
  ImportAlreadyRunningError,
  NothingToImportError,
  ServerImportFailedError,
  ServerImportsDisabledError,
  sha256Hex,
} from '../cloudImports'
import type { NetImportRequest, NetImportStreamEvent, NetImportTransport } from '../cloudNetImport'
import {
  type CloudSaveImportsApi,
  CloudScoreRepository,
  type CloudScoreRepositoryOptions,
  type ScoreSyncLocks,
} from '../CloudScoreRepository'
import type { ImportProgress } from '../ScoreRepository'
import { UnsupportedScoreOperationError } from '../ScoreRepository'
import { FakeCloudSaveServer, manualProvenance, verifiedProvenance } from './fakeCloudSaveServer'

const SHEET_A = 'dsht_e5nsvt8k2a'
const SHEET_B = 'dsht_5mk3yr8gme'
const ALPHABET = '23456789abcdefghjkmnpqrstvwxyz'

/** `count` distinct public sheet IDs */
function sheetIds(count: number): string[] {
  const ids: string[] = []
  for (let index = 0; index < count; index++) {
    let rest = index
    let suffix = ''
    for (let position = 0; position < 10; position++) {
      suffix = ALPHABET[rest % ALPHABET.length] + suffix
      rest = Math.floor(rest / ALPHABET.length)
    }
    ids.push(`dsht_${suffix}`)
  }
  return ids
}

const NOW = '2026-11-03T00:00:00.000Z'
const counts = (overrides: Partial<ImportJobDTO['counts']> = {}): ImportJobDTO['counts'] => ({
  fetched: 0,
  inserted: 0,
  improved: 0,
  provenanceUpgraded: 0,
  unchanged: 0,
  keptUserEdit: 0,
  skippedDeleted: 0,
  skippedUnknownSheet: 0,
  skippedMasked: 0,
  rejected: 0,
  ...overrides,
})

/**
 * The import half of a cloud save server: one job per idempotency key (§5.5), client chunks appended to their job
 * (§7.3), server jobs that write verified records into the {@link FakeCloudSaveServer}.
 */
class FakeImportsServer {
  readonly jobs = new Map<string, ImportJobDTO>()
  readonly jobByKey = new Map<string, string>()
  readonly calls: { route: string; input: Record<string, unknown> }[] = []
  /** Thrown, in order, by the next calls */
  readonly failures: unknown[] = []
  /** Records a server job writes */
  serverRecords: { sheetId: string; achievement: number }[] = [{ sheetId: SHEET_A, achievement: 1005000 }]
  /** Polls of a running job left before it finishes */
  runningPolls = 0
  /** Sheet IDs the server rejects on its own (as if its catalog did not know them) */
  readonly unknownSheets = new Set<string>()
  private nextJob = 1

  constructor(private readonly records: FakeCloudSaveServer) {}

  readonly api: CloudSaveImportsApi = {
    client: async (input) => {
      this.call('client', input)
      const job = this.jobFor(input.idempotencyKey, input.source as ImportJobDTO['source'], 'client', input.trigger)
      // As the server: every record validated with the strict schema, counts added up over the chunks
      const next = { ...job.counts, fetched: job.counts.fetched + input.records.length }
      for (const record of input.records) {
        const parsed = ImportRecordSchema.safeParse(record)
        if (!parsed.success) {
          next.rejected++
          continue
        }
        const value = parsed.data
        if (this.unknownSheets.has(value.sheetId)) {
          next.skippedUnknownSheet++
          continue
        }
        const existing = this.records.records.get(value.sheetId)
        const live = existing && existing.deletedAt === null ? existing : null
        if (live && live.achievement !== null && live.achievement >= value.achievement) {
          next.unchanged++
          continue
        }
        if (live) next.improved++
        else next.inserted++
        this.records.put(value.sheetId, value.achievement, {
          ...manualProvenance(),
          source: input.source as Provenance['source'],
          claimedSource: value.claimedSource ?? null,
          entryMethod: 'file',
          importJobId: job.id,
        })
      }
      job.counts = next
      if (input.chunkIndex === input.chunkCount - 1) job.status = 'succeeded'
      return this.result(job)
    },
    lxns: async (input) => {
      this.call('lxns', input)
      return this.result(this.runServerJob(input.idempotencyKey, 'lxns', input.trigger))
    },
    divingFish: async (input) => {
      this.call('divingFish', input)
      return this.result(this.runServerJob(input.idempotencyKey, 'diving-fish', input.trigger))
    },
    get: async (input) => {
      this.call('get', input)
      const job = this.jobs.get(input.jobId)!
      if (job.status === 'running' && this.runningPolls-- <= 0) this.finish(job)
      return { ...job }
    },
    list: async (input) => {
      this.call('list', input)
      return [...this.jobs.values()].reverse()
    },
  }

  /**
   * A job of another action (another tab, the automatic import) that is still running: `auto` with no account yet
   * unless `overrides` say otherwise
   */
  startRunning(source: ImportJobDTO['source'], overrides: Partial<ImportJobDTO> = {}): ImportJobDTO {
    const job = this.jobFor(`other-${this.nextJob}`, source, 'server', overrides.trigger ?? 'auto')
    Object.assign(job, overrides)
    return job
  }

  netTransport(events: (request: NetImportRequest, attempt: number) => NetImportStreamEvent[] | Error): {
    transport: NetImportTransport
    requests: NetImportRequest[]
  } {
    const requests: NetImportRequest[] = []
    const transport: NetImportTransport = (request) => {
      requests.push(request)
      const answer = events(request, requests.length)
      return (async function* () {
        if (answer instanceof Error) throw answer
        for (const event of answer) {
          if (event.type === 'progress') await Promise.resolve()
          yield event
        }
      })()
    }
    return { transport, requests }
  }

  /** The NET job of a key, as the server runs it */
  runNetJob(key: string, region: 'jp' | 'intl'): ImportJobDTO {
    return this.runServerJob(key, region === 'jp' ? 'maimai-net-jp' : 'maimai-net-intl', 'user')
  }

  private call(route: string, input: object) {
    this.calls.push({ route, input: structuredClone(input) as Record<string, unknown> })
    if (this.failures.length) throw this.failures.shift()
  }

  private runServerJob(key: string, source: ImportJobDTO['source'], trigger: ImportJobDTO['trigger']): ImportJobDTO {
    const job = this.jobFor(key, source, 'server', trigger)
    if (job.status === 'running') this.finish(job)
    return job
  }

  private finish(job: ImportJobDTO) {
    for (const record of this.serverRecords) {
      this.records.put(
        record.sheetId,
        record.achievement,
        verifiedProvenance({ source: job.source, importJobId: job.id, sourceAccountId: '123456789' }),
      )
    }
    job.status = 'succeeded'
    job.counts = counts({ fetched: this.serverRecords.length, inserted: this.serverRecords.length })
  }

  private jobFor(
    key: string,
    source: ImportJobDTO['source'],
    fetchedBy: ImportJobDTO['fetchedBy'],
    trigger: ImportJobDTO['trigger'],
  ): ImportJobDTO {
    const existing = this.jobByKey.get(key)
    if (existing) return this.jobs.get(existing)!
    const job: ImportJobDTO = {
      id: `dimp_job${this.nextJob++}`,
      saveId: 'dsav_one',
      source,
      fetchedBy,
      trigger,
      sourceAccountId: null,
      sourceAccountKind: null,
      status: 'running',
      startedAt: NOW,
      fetchedAt: null,
      finishedAt: null,
      rawPayloadSha256: null,
      counts: counts(),
      errorCode: null,
    }
    this.jobs.set(job.id, job)
    this.jobByKey.set(key, job.id)
    return job
  }

  private result(job: ImportJobDTO): ImportResultDTO {
    return { job: { ...job }, revision: this.records.revision }
  }
}

let factory: IDBFactory
let server: FakeCloudSaveServer
let imports: FakeImportsServer
const opened: CloudScoreRepository[] = []

async function openRepository(overrides: Partial<CloudScoreRepositoryOptions> = {}) {
  const repository = await CloudScoreRepository.open({
    userId: 'user-1',
    saveId: 'dsav_one',
    api: server.api,
    imports: imports.api,
    indexedDB: factory,
    locks: null,
    createChannel: null,
    eventTarget: null,
    visibilityTarget: null,
    isVisible: () => true,
    importPollIntervalMs: 0,
    importRetryDelayMs: 0,
    ...overrides,
  })
  opened.push(repository)
  await repository.sync()
  return repository
}

async function collect(iterable: AsyncIterable<ImportProgress>): Promise<ImportProgress[]> {
  const progress: ImportProgress[] = []
  for await (const item of iterable) progress.push(item)
  return progress
}

const routes = () => imports.calls.map((call) => call.route)

beforeEach(() => {
  factory = new IDBFactory()
  server = new FakeCloudSaveServer()
  imports = new FakeImportsServer(server)
})

afterEach(async () => {
  await Promise.all(opened.splice(0).map((repository) => repository.dispose({ flushTimeoutMs: 0 })))
})

describe('CloudScoreRepository file imports (client-imports)', () => {
  it('uploads a file as one user job in the client vocabulary, then pulls what it wrote', async () => {
    const repository = await openRepository()
    const entries: PlayEntry[] = [
      { sheetId: SHEET_A, achievementRate: 100.5, comboFlag: 'ap', syncFlag: null, source: { provider: 'aqua-dx' } },
      { sheetId: SHEET_B, achievementRate: 99 },
    ]

    const result = await repository.applyImport(entries, { source: 'aqua-dx', mode: 'merge' })

    expect(routes()).toEqual(['client'])
    const input = imports.calls[0]!.input
    expect(input).toMatchObject({
      id: 'dsav_one',
      source: 'aqua-dx',
      trigger: 'user',
      chunkIndex: 0,
      chunkCount: 1,
      sourceAccountId: null,
    })
    expect(input.idempotencyKey).toMatch(/^[A-Za-z0-9][\w.:-]{7,127}$/)
    // The chunk's canonical hash, as the server computes it, as a cross-check
    const records = entriesToImportRecords(entries, { source: 'aqua-dx', claimedSource: null }).records
    expect(input.rawPayloadSha256).toBe(await chunkPayloadSha256(records))
    // No provenance claims beyond the claimed provider (none for a file's own source)
    for (const record of input.records as ImportRecordInput[]) {
      expect(Object.keys(record).sort()).toEqual(
        [
          'achievement',
          'best50Bucket',
          'claimedSource',
          'comboFlag',
          'dxScore',
          'providerRecordId',
          'sheetId',
          'syncFlag',
        ].sort(),
      )
      expect(record.claimedSource).toBeNull()
    }
    expect(result).toMatchObject({ count: 2, job: { status: 'succeeded', source: 'aqua-dx' } })
    // Pulled: the records are the server's, not written locally first
    expect(server.mutateCalls).toEqual([])
    expect(
      repository
        .entries()
        .map((entry) => entry.sheetId)
        .sort(),
    ).toEqual([SHEET_A, SHEET_B].sort())
  })

  it.each([
    ['aqua-dx', 'aqua-dx'],
    ['mu-net', 'mu-net'],
    ['aqua-sqlite', 'aqua-sqlite'],
    ['dxrating-json', 'dxrating-json'],
  ] as const)('maps the %s file to the %s source', async (source, wire) => {
    const repository = await openRepository()
    await repository.applyImport([{ sheetId: SHEET_A, achievementRate: 99 }], {
      source,
      mode: 'merge',
      claimedAccountId: source === 'aqua-sqlite' ? '42' : undefined,
    })
    expect(imports.calls[0]!.input).toMatchObject({
      source: wire,
      sourceAccountId: source === 'aqua-sqlite' ? '42' : null,
    })
  })

  it('keeps the provider a DXRating JSON entry names as its claimed source', async () => {
    const repository = await openRepository()
    await repository.applyImport(
      [
        { sheetId: SHEET_A, achievementRate: 100, source: { provider: 'lxns' } },
        { sheetId: SHEET_B, achievementRate: 99 },
      ],
      { source: 'dxrating-json', mode: 'merge' },
    )
    const records = imports.calls[0]!.input.records as ImportRecordInput[]
    expect(records.find((record) => record.sheetId === SHEET_A)?.claimedSource).toBe('lxns')
    expect(records.find((record) => record.sheetId === SHEET_B)?.claimedSource).toBeNull()
    expect(server.records.get(SHEET_A)?.provenance).toMatchObject({
      source: 'dxrating-json',
      claimedSource: 'lxns',
      verification: 'client_reported',
    })
  })

  it('chunks at 5000 records under one idempotency key', async () => {
    const repository = await openRepository()
    const ids = sheetIds(5001)
    await repository.applyImport(
      ids.map((sheetId) => ({ sheetId, achievementRate: 98 })),
      { source: 'mu-net', mode: 'merge' },
    )

    const chunks = imports.calls.filter((call) => call.route === 'client').map((call) => call.input)
    expect(chunks.map((chunk) => [chunk.chunkIndex, chunk.chunkCount, (chunk.records as unknown[]).length])).toEqual([
      [0, 2, 5000],
      [1, 2, 1],
    ])
    expect(new Set(chunks.map((chunk) => chunk.idempotencyKey)).size).toBe(1)
    // Each chunk carries the hash of its own records, as the server hashes each chunk
    for (const chunk of chunks) {
      expect(chunk.rawPayloadSha256).toBe(await chunkPayloadSha256(chunk.records as never))
    }
    expect(chunks[0]!.rawPayloadSha256).not.toBe(chunks[1]!.rawPayloadSha256)
    expect(imports.jobs.size).toBe(1)
    expect(repository.entries()).toHaveLength(5001)
  })

  it('splits by body size too, and builds every chunk before "clear first" (5000 CJK provider IDs)', async () => {
    server.put(SHEET_B, 990000)
    const repository = await openRepository()
    const order: string[] = []
    const mutate = server.api.mutate
    server.api.mutate = async (input) => {
      order.push('mutate')
      return mutate(input)
    }
    const client = imports.api.client
    imports.api.client = async (input) => {
      order.push('client')
      return client(input)
    }
    // 128 three-byte characters per provider ID: 5000 of them are over the 2 MiB body limit in one request
    const providerId = '譜'.repeat(128)
    const ids = sheetIds(5000)
    await repository.applyImport(
      ids.map((sheetId) => ({ sheetId, achievementRate: 98, source: { provider: 'lxns', providerId } })),
      { source: 'dxrating-json', mode: 'replace' },
    )

    const chunks = imports.calls.filter((call) => call.route === 'client').map((call) => call.input)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.map((chunk) => chunk.chunkIndex)).toEqual(chunks.map((_, index) => index))
    expect(chunks.every((chunk) => chunk.chunkCount === chunks.length)).toBe(true)
    expect(chunks.reduce((total, chunk) => total + (chunk.records as unknown[]).length, 0)).toBe(5000)
    for (const chunk of chunks) {
      expect(new TextEncoder().encode(JSON.stringify(chunk)).byteLength).toBeLessThanOrEqual(
        CLIENT_IMPORT_BODY_LIMIT_BYTES,
      )
      expect(chunk.rawPayloadSha256).toBe(await chunkPayloadSha256(chunk.records as never))
    }
    expect(new Set(chunks.map((chunk) => chunk.idempotencyKey)).size).toBe(1)
    // One clear, then every chunk
    expect(order).toEqual(['mutate', ...chunks.map(() => 'client')])
    expect(repository.entries()).toHaveLength(5000)
  })

  it('leaves the save untouched when the upload cannot fit in the most chunks an import takes', async () => {
    server.put(SHEET_B, 990000)
    const repository = await openRepository()
    const providerId = '譜'.repeat(128)
    const entries = sheetIds(45000).map((sheetId) => ({
      sheetId,
      achievementRate: 98,
      source: { provider: 'lxns' as const, providerId },
    }))

    await expect(repository.applyImport(entries, { source: 'dxrating-json', mode: 'replace' })).rejects.toMatchObject({
      name: 'ImportTooLargeError',
      reason: 'too-many-chunks',
    })

    expect(server.mutateCalls).toEqual([])
    expect(routes()).toEqual([])
    expect(repository.entries().map((entry) => entry.sheetId)).toEqual([SHEET_B])
  })

  it('sends a failed chunk again with the same key (idempotent retry)', async () => {
    const repository = await openRepository()
    imports.failures.push(new TypeError('Failed to fetch'), { status: 503, code: 'SERVICE_UNAVAILABLE' })

    await repository.applyImport([{ sheetId: SHEET_A, achievementRate: 99 }], { source: 'aqua-dx', mode: 'merge' })

    expect(routes()).toEqual(['client', 'client', 'client'])
    const keys = imports.calls.map((call) => call.input.idempotencyKey)
    expect(new Set(keys).size).toBe(1)
    expect(imports.jobs.size).toBe(1)
  })

  it('does not retry a 4xx and gives a new key to the next user action', async () => {
    const repository = await openRepository()
    imports.failures.push({ status: 400, code: 'BAD_REQUEST' })
    await expect(
      repository.applyImport([{ sheetId: SHEET_A, achievementRate: 99 }], { source: 'aqua-dx', mode: 'merge' }),
    ).rejects.toMatchObject({ status: 400 })
    await repository.applyImport([{ sheetId: SHEET_A, achievementRate: 99 }], { source: 'aqua-dx', mode: 'merge' })
    expect(routes()).toEqual(['client', 'client'])
    expect(imports.calls[0]!.input.idempotencyKey).not.toBe(imports.calls[1]!.input.idempotencyKey)
  })

  it('clears the save on the server before a "replace" import uploads (§5.3 rule 5)', async () => {
    server.put(SHEET_B, 990000)
    const repository = await openRepository()
    const order: string[] = []
    const mutate = server.api.mutate
    server.api.mutate = async (input) => {
      order.push(`mutate:${input.mutations.map((mutation) => mutation.op).join(',')}`)
      return mutate(input)
    }
    const client = imports.api.client
    imports.api.client = async (input) => {
      order.push('client')
      return client(input)
    }

    await repository.applyImport([{ sheetId: SHEET_A, achievementRate: 99 }], { source: 'aqua-dx', mode: 'replace' })

    expect(order).toEqual(['mutate:delete', 'client'])
    expect(repository.entries().map((entry) => entry.sheetId)).toEqual([SHEET_A])
  })

  it('never clears the save for an import with nothing to upload', async () => {
    server.put(SHEET_B, 990000)
    const repository = await openRepository()

    // An old rating file whose legacy sheet IDs no chart matched
    await expect(
      repository.applyImport([{ sheetId: 'retired song__dxrt__dx__dxrt__master', achievementRate: 99 }], {
        source: 'dxrating-json',
        mode: 'replace',
      }),
    ).rejects.toBeInstanceOf(NothingToImportError)

    expect(server.mutateCalls).toEqual([])
    expect(routes()).toEqual([])
    expect(repository.entries().map((entry) => entry.sheetId)).toEqual([SHEET_B])
  })

  it('reports the records it uploaded and the entries it left out', async () => {
    const repository = await openRepository()
    const result = await repository.applyImport(
      [
        { sheetId: SHEET_A, achievementRate: 99 },
        { sheetId: SHEET_A, achievementRate: 98 },
        { sheetId: 'retired song__dxrt__dx__dxrt__master', achievementRate: 99 },
      ],
      { source: 'dxrating-json', mode: 'merge' },
    )
    expect(result).toMatchObject({ count: 1, skipped: 1 })
  })

  it("never clears the save when no record passes the server's schema, and says so", async () => {
    server.put(SHEET_B, 990000)
    const repository = await openRepository()

    // Converts fine, but the server's ImportRecordSchema caps the DX score at 100000
    const error = await repository
      .applyImport([{ sheetId: SHEET_A, achievementRate: 99, dxScore: 100001 }], {
        source: 'aqua-dx',
        mode: 'replace',
      })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(NothingToImportError)
    expect(error).toMatchObject({ skipped: 0, rejected: 1 })
    expect(server.mutateCalls).toEqual([])
    expect(routes()).toEqual([])
    expect(repository.entries().map((entry) => entry.sheetId)).toEqual([SHEET_B])
  })

  it('clears, then uploads only the records that pass, reporting what the server did', async () => {
    const [sheetC] = sheetIds(1)
    server.put(SHEET_B, 990000)
    const repository = await openRepository()

    const result = await repository.applyImport(
      [
        { sheetId: SHEET_A, achievementRate: 99, dxScore: 2400 },
        { sheetId: sheetC!, achievementRate: 98, dxScore: 100001 },
        { sheetId: 'retired song__dxrt__dx__dxrt__master', achievementRate: 97 },
      ],
      { source: 'aqua-dx', mode: 'replace' },
    )

    expect(server.mutateCalls.flat().map((mutation) => [mutation.op, mutation.sheetId])).toEqual([['delete', SHEET_B]])
    const uploads = imports.calls.filter((call) => call.route === 'client')
    expect(uploads).toHaveLength(1)
    expect((uploads[0]!.input.records as ImportRecordInput[]).map((record) => record.sheetId)).toEqual([SHEET_A])
    expect(result).toMatchObject({
      count: 1,
      skipped: 1,
      rejected: 1,
      job: { counts: expect.objectContaining({ fetched: 1, inserted: 1, rejected: 0 }) },
    })
    expect(repository.entries().map((entry) => entry.sheetId)).toEqual([SHEET_A])
  })

  it("reports the server's counts for a merge, not the number of records sent", async () => {
    server.put(SHEET_A, 1005000)
    const [sheetC] = sheetIds(1)
    imports.unknownSheets.add(sheetC!)
    const repository = await openRepository()

    const result = await repository.applyImport(
      [
        { sheetId: SHEET_A, achievementRate: 99 },
        { sheetId: SHEET_B, achievementRate: 99 },
        { sheetId: sheetC!, achievementRate: 99 },
      ],
      { source: 'mu-net', mode: 'merge' },
    )

    // 3 sent: 1 new, 1 kept the better score already saved, 1 unknown to the server
    expect(result).toMatchObject({
      count: 2,
      skipped: 1,
      rejected: 0,
      job: { counts: expect.objectContaining({ fetched: 3, inserted: 1, unchanged: 1, skippedUnknownSheet: 1 }) },
    })
  })

  it('imports nothing when the clear cannot reach the server', async () => {
    server.put(SHEET_B, 990000)
    const repository = await openRepository()
    server.failures.push(new TypeError('Failed to fetch'))

    await expect(
      repository.applyImport([{ sheetId: SHEET_A, achievementRate: 99 }], { source: 'aqua-dx', mode: 'replace' }),
    ).rejects.toThrow(/could not be cleared/)
    expect(routes()).toEqual([])
  })

  it('never uploads maimai NET, LXNS or Diving-Fish records while the server imports them', async () => {
    const repository = await openRepository()
    for (const source of ['maimai-net', 'lxns', 'diving-fish'] as const) {
      await expect(
        repository.applyImport([{ sheetId: SHEET_A, achievementRate: 99 }], { source, mode: 'merge' }),
      ).rejects.toBeInstanceOf(UnsupportedScoreOperationError)
    }
    expect(routes()).toEqual([])
    expect(server.mutateCalls).toEqual([])
  })

  it('uploads provider records as client_reported legacy-local only with server imports off (§7.4)', async () => {
    const repository = await openRepository({ serverImports: false })
    expect(repository.serverImportsEnabled).toBe(false)

    await repository.applyImport([{ sheetId: SHEET_A, achievementRate: 99, source: { provider: 'lxns' } }], {
      source: 'lxns',
      mode: 'merge',
    })

    expect(imports.calls[0]!.input).toMatchObject({ source: 'legacy-local', trigger: 'user' })
    expect((imports.calls[0]!.input.records as ImportRecordInput[])[0]!.claimedSource).toBe('lxns')
    expect(server.records.get(SHEET_A)?.provenance.verification).toBe('client_reported')
    await expect(collect(repository.runServerImport('lxns', {}))).rejects.toBeInstanceOf(ServerImportsDisabledError)
  })
})

describe('CloudScoreRepository imports: triggers, conflicts and "clear first"', () => {
  it('uploads the automatic maimai NET fallback as an auto job under its window key, claiming the region', async () => {
    const repository = await openRepository({ serverImports: false })
    const key = autoNetImportKey('dsav_one')

    await repository.applyImport([{ sheetId: SHEET_A, achievementRate: 99 }], {
      source: 'maimai-net',
      mode: 'merge',
      claimedSource: 'maimai-net-jp',
      trigger: 'auto',
      idempotencyKey: key,
    })

    // `auto` never revives what the user deleted (§5.3); one key per save and 15 minutes (§5.5)
    expect(imports.calls[0]!.input).toMatchObject({ source: 'legacy-local', trigger: 'auto', idempotencyKey: key })
    expect((imports.calls[0]!.input.records as ImportRecordInput[])[0]!.claimedSource).toBe('maimai-net-jp')
  })

  it('waits for an import already running on the save, then sends the upload again with the same key', async () => {
    const repository = await openRepository()
    const running = imports.startRunning('lxns')
    imports.runningPolls = 1
    imports.failures.push({ status: 409, code: 'CONFLICT', data: { reason: 'IMPORT_IN_PROGRESS', jobId: running.id } })

    const result = await repository.applyImport([{ sheetId: SHEET_B, achievementRate: 99 }], {
      source: 'aqua-dx',
      mode: 'merge',
    })

    expect(routes()).toEqual(['client', 'get', 'get', 'client'])
    const uploads = imports.calls.filter((call) => call.route === 'client')
    expect(uploads[0]!.input.idempotencyKey).toBe(uploads[1]!.input.idempotencyKey)
    expect(result).toMatchObject({ count: 1, job: { status: 'succeeded', source: 'aqua-dx' } })
    expect(repository.entries().map((entry) => entry.sheetId)).toContain(SHEET_B)
  })

  it('pulls before "clear first", so a device that has not synced yet still clears the whole save', async () => {
    server.put(SHEET_B, 990000)
    // Opened, never synced: this device knows nothing of the save yet
    const repository = await CloudScoreRepository.open({
      userId: 'user-1',
      saveId: 'dsav_one',
      api: server.api,
      imports: imports.api,
      indexedDB: factory,
      locks: null,
      createChannel: null,
      eventTarget: null,
      visibilityTarget: null,
      isVisible: () => true,
      importPollIntervalMs: 0,
      importRetryDelayMs: 0,
    })
    opened.push(repository)
    expect(repository.entries()).toEqual([])

    await repository.applyImport([{ sheetId: SHEET_A, achievementRate: 99 }], { source: 'aqua-dx', mode: 'replace' })

    expect(server.mutateCalls.flat().map((mutation) => [mutation.op, mutation.sheetId])).toEqual([['delete', SHEET_B]])
    expect(repository.entries().map((entry) => entry.sheetId)).toEqual([SHEET_A])
  })

  it('also clears what another device wrote since the last pull', async () => {
    const repository = await openRepository()
    server.put(SHEET_B, 990000)

    await repository.applyImport([{ sheetId: SHEET_A, achievementRate: 99 }], { source: 'aqua-dx', mode: 'replace' })

    expect(server.mutateCalls.flat().map((mutation) => mutation.sheetId)).toEqual([SHEET_B])
    expect(repository.entries().map((entry) => entry.sheetId)).toEqual([SHEET_A])
  })

  it('imports nothing when the pull before "clear first" fails', async () => {
    server.put(SHEET_B, 990000)
    const repository = await openRepository()
    server.failures.push(new TypeError('Failed to fetch'))

    await expect(
      repository.applyImport([{ sheetId: SHEET_A, achievementRate: 99 }], { source: 'aqua-dx', mode: 'replace' }),
    ).rejects.toBeInstanceOf(CloudClearNotSentError)
    expect(server.mutateCalls).toEqual([])
    expect(routes()).toEqual([])
  })
})

describe('CloudScoreRepository server imports', () => {
  it('runs LXNS on the server and pulls the verified records; the client uploads nothing', async () => {
    const repository = await openRepository()

    const progress = await collect(repository.runServerImport('lxns', {}))

    expect(routes()).toEqual(['lxns'])
    expect(imports.calls[0]!.input).toMatchObject({ id: 'dsav_one', trigger: 'user' })
    expect(progress.at(-1)).toMatchObject({ stage: 'done', progress: 1, job: { status: 'succeeded', source: 'lxns' } })
    // Never server → client → server (§8.3)
    expect(server.mutateCalls).toEqual([])
    expect(routes()).not.toContain('client')
    expect(repository.get(SHEET_A)).toBeUndefined() // no identity resolver: entries() has it
    expect(repository.entries()).toEqual([expect.objectContaining({ sheetId: SHEET_A, achievementRate: 100.5 })])
  })

  it('still pulls what an import wrote when another tab holds the sync lock at first', async () => {
    let held = false
    const locks = {
      request: async (_name: string, _options: { ifAvailable: true }, callback: (lock: unknown) => unknown) =>
        callback(held ? null : { name: 'dxr-scores-sync' }),
    } as unknown as ScoreSyncLocks
    const repository = await openRepository({ locks })
    // Another tab syncs while the job finishes, then lets go of the lock
    held = true
    setTimeout(() => (held = false), 50)

    const progress = await collect(repository.runServerImport('lxns', {}))

    expect(progress.at(-1)).toMatchObject({ stage: 'done', job: { status: 'succeeded' } })
    expect(repository.entries()).toEqual([expect.objectContaining({ sheetId: SHEET_A, achievementRate: 100.5 })])
  })

  it('passes the Diving-Fish username or QQ and the trigger', async () => {
    const repository = await openRepository()
    await collect(
      repository.runServerImport('diving-fish', { qq: '12345678', trigger: 'auto', idempotencyKey: 'key-df-1' }),
    )
    expect(imports.calls[0]!.input).toEqual({
      id: 'dsav_one',
      idempotencyKey: 'key-df-1',
      trigger: 'auto',
      qq: '12345678',
    })
  })

  it('retries a dropped request with the same key, so the job runs once', async () => {
    const repository = await openRepository()
    imports.failures.push(new TypeError('Failed to fetch'), { status: 429, data: { retryAfterSeconds: 0 } })

    await collect(repository.runServerImport('lxns', { idempotencyKey: 'key-lxns-retry' }))

    expect(routes()).toEqual(['lxns', 'lxns', 'lxns'])
    expect(imports.calls.every((call) => call.input.idempotencyKey === 'key-lxns-retry')).toBe(true)
    expect(imports.jobs.size).toBe(1)
  })

  it('never adopts an LXNS job of the same trigger: waits for it, then sends its own request again', async () => {
    const repository = await openRepository()
    // The linked LXNS account may have been relinked while this job ran: it may be another account's
    const running = imports.startRunning('lxns', { trigger: 'user' })
    imports.runningPolls = 2
    imports.failures.push({
      status: 409,
      code: 'CONFLICT',
      data: { reason: 'IMPORT_IN_PROGRESS', jobId: running.id },
    })

    const progress = await collect(repository.runServerImport('lxns', { idempotencyKey: 'key-lxns-same' }))

    expect(routes()).toEqual(['lxns', 'get', 'get', 'get', 'lxns'])
    expect(imports.calls.filter((call) => call.route === 'get').every((call) => call.input.jobId === running.id)).toBe(
      true,
    )
    expect(imports.calls.filter((call) => call.route === 'lxns').map((call) => call.input.idempotencyKey)).toEqual([
      'key-lxns-same',
      'key-lxns-same',
    ])
    expect(progress.map((item) => item.stage)).toEqual(['waiting', 'pulling', 'done'])
    const job = progress.at(-1)?.job
    expect(job?.id).not.toBe(running.id)
    expect(job?.id).toBe(imports.jobByKey.get('key-lxns-same'))
    expect(repository.entries()).toHaveLength(1)
  })

  it('never adopts an automatic LXNS job for a user import: waits for it, then runs its own', async () => {
    const repository = await openRepository()
    // Another trigger, as well as possibly another linked account: never this import
    const running = imports.startRunning('lxns')
    imports.runningPolls = 1
    imports.failures.push({ status: 409, code: 'CONFLICT', data: { reason: 'IMPORT_IN_PROGRESS', jobId: running.id } })

    const progress = await collect(repository.runServerImport('lxns', { idempotencyKey: 'key-lxns-own' }))

    expect(routes()).toEqual(['lxns', 'get', 'get', 'lxns'])
    expect(imports.calls.filter((call) => call.route === 'lxns').map((call) => call.input.idempotencyKey)).toEqual([
      'key-lxns-own',
      'key-lxns-own',
    ])
    const job = progress.at(-1)?.job
    expect(job?.id).not.toBe(running.id)
    expect(job?.id).toBe(imports.jobByKey.get('key-lxns-own'))
  })

  it('never reports a Diving-Fish job of another account as this import', async () => {
    const repository = await openRepository()
    const running = imports.startRunning('diving-fish', {
      trigger: 'user',
      sourceAccountKind: 'df_username',
      sourceAccountId: 'bob',
    })
    imports.failures.push({ status: 409, code: 'CONFLICT', data: { reason: 'IMPORT_IN_PROGRESS', jobId: running.id } })

    const progress = await collect(
      repository.runServerImport('diving-fish', { username: 'alice', idempotencyKey: 'key-df-alice' }),
    )

    // Waited for bob's job, then sent alice's request once more with the same key
    expect(routes()).toEqual(['divingFish', 'get', 'divingFish'])
    expect(imports.calls.filter((call) => call.route === 'divingFish').map((call) => call.input)).toEqual([
      expect.objectContaining({ idempotencyKey: 'key-df-alice', username: 'alice' }),
      expect.objectContaining({ idempotencyKey: 'key-df-alice', username: 'alice' }),
    ])
    const job = progress.at(-1)?.job
    expect(job?.id).not.toBe(running.id)
    expect(job?.id).toBe(imports.jobByKey.get('key-df-alice'))
  })

  it('tells the user another import is running when the source is still busy after waiting once', async () => {
    const repository = await openRepository()
    const first = imports.startRunning('diving-fish', {
      trigger: 'user',
      sourceAccountKind: 'df_username',
      sourceAccountId: 'bob',
    })
    const conflict = (jobId: string) => ({
      status: 409,
      code: 'CONFLICT',
      data: { reason: 'IMPORT_IN_PROGRESS', jobId },
    })
    imports.failures.push(conflict(first.id))
    imports.api.get = async (input) => {
      imports.calls.push({ route: 'get', input })
      // bob's job ends, and another one of the source starts before alice's request is sent again
      imports.failures.push(conflict('dimp_other'))
      return { ...first, status: 'succeeded', counts: counts({ inserted: 9 }) }
    }

    const progress: ImportProgress[] = []
    const error = await (async () => {
      for await (const item of repository.runServerImport('diving-fish', { username: 'alice' })) progress.push(item)
    })().catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ImportAlreadyRunningError)
    expect(error).toBeInstanceOf(ServerImportFailedError)
    expect(progress.some((item) => item.stage === 'done' || item.job)).toBe(false)
    expect(routes()).toEqual(['divingFish', 'get', 'divingFish'])
  })

  it('still attaches to a running Diving-Fish job of the same account and trigger', async () => {
    const repository = await openRepository()
    const running = imports.startRunning('diving-fish', {
      trigger: 'user',
      sourceAccountKind: 'df_username',
      sourceAccountId: 'alice',
    })
    imports.runningPolls = 1
    imports.failures.push({ status: 409, code: 'CONFLICT', data: { reason: 'IMPORT_IN_PROGRESS', jobId: running.id } })

    const progress = await collect(repository.runServerImport('diving-fish', { username: ' alice ' }))

    expect(routes()).toEqual(['divingFish', 'get', 'get'])
    expect(progress.at(-1)).toMatchObject({ stage: 'done', job: { id: running.id, status: 'succeeded' } })
  })

  it('throws when the job fails', async () => {
    const repository = await openRepository()
    const running = imports.startRunning('diving-fish', {
      trigger: 'user',
      sourceAccountKind: 'df_username',
      sourceAccountId: 'demo',
    })
    imports.failures.push({ status: 409, code: 'CONFLICT', data: { reason: 'IMPORT_IN_PROGRESS', jobId: running.id } })
    imports.api.get = async () => ({ ...running, status: 'failed', errorCode: 'upstream_unavailable' })

    await expect(collect(repository.runServerImport('diving-fish', { username: 'demo' }))).rejects.toMatchObject({
      name: 'ServerImportFailedError',
      code: 'upstream_unavailable',
    })
  })

  it('streams maimai NET progress over SSE and pulls when done', async () => {
    const net = imports.netTransport((request) => [
      { type: 'progress', state: 'auth:in-progress' },
      { type: 'progress', state: 'fetch:music:in-progress:master' },
      {
        type: 'done',
        result: { job: imports.runNetJob(request.body.idempotencyKey, request.body.region), revision: 1 },
      },
    ])
    const repository = await openRepository({ netImport: net.transport })

    const progress = await collect(
      repository.runServerImport('maimai-net', {
        region: 'jp',
        id: 'sega-id',
        password: 'secret',
        trigger: 'auto',
        idempotencyKey: autoNetImportKey('dsav_one', 0),
      }),
    )

    expect(net.requests).toHaveLength(1)
    expect(net.requests[0]).toEqual({
      saveId: 'dsav_one',
      body: { idempotencyKey: 'auto-net-dsav_one-0', trigger: 'auto', region: 'jp', id: 'sega-id', password: 'secret' },
      // Bound to the repository's account: the server refuses it once the session is another one (§10)
      expectedUserId: 'user-1',
    })
    expect(progress.map((item) => item.stage)).toEqual([
      'auth:in-progress',
      'fetch:music:in-progress:master',
      'pulling',
      'done',
    ])
    expect(progress.at(-1)?.job?.source).toBe('maimai-net-jp')
    expect(server.mutateCalls).toEqual([])
    expect(routes()).not.toContain('client')
    expect(repository.entries()).toHaveLength(1)
  })

  it('sends the NET import again with the same key when the stream drops', async () => {
    const net = imports.netTransport((request, attempt) =>
      attempt === 1
        ? new TypeError('network error')
        : [{ type: 'done', result: { job: imports.runNetJob(request.body.idempotencyKey, 'intl'), revision: 1 } }],
    )
    const repository = await openRepository({ netImport: net.transport })

    await collect(repository.runServerImport('maimai-net', { region: 'intl', id: 'a', password: 'b' }))

    expect(net.requests).toHaveLength(2)
    expect(net.requests[0]!.body.idempotencyKey).toBe(net.requests[1]!.body.idempotencyKey)
  })

  it('attaches to a running NET job of the same SEGA ID and trigger when the stream answers 409', async () => {
    const running = imports.startRunning('maimai-net-jp', {
      trigger: 'user',
      sourceAccountKind: 'segaid_hash',
      sourceAccountId: (await sha256Hex('jp:a'))!,
    })
    const net = imports.netTransport(
      () => new CloudImportHttpError(409, 'CONFLICT', { reason: 'IMPORT_IN_PROGRESS', jobId: running.id }),
    )
    const repository = await openRepository({ netImport: net.transport })

    const progress = await collect(repository.runServerImport('maimai-net', { region: 'jp', id: 'a', password: 'b' }))

    expect(net.requests).toHaveLength(1)
    expect(routes()).toEqual(['get'])
    expect(progress.at(-1)?.job?.id).toBe(running.id)
  })

  it('never reports a NET job of another account as this import: waits, then streams its own', async () => {
    // Another NET account of the same region, recorded by its friend code
    const running = imports.startRunning('maimai-net-jp', {
      trigger: 'user',
      sourceAccountKind: 'friend_code',
      sourceAccountId: '000111222333444',
    })
    const net = imports.netTransport((request, attempt) =>
      attempt === 1
        ? new CloudImportHttpError(409, 'CONFLICT', { reason: 'IMPORT_IN_PROGRESS', jobId: running.id })
        : [{ type: 'done', result: { job: imports.runNetJob(request.body.idempotencyKey, 'jp'), revision: 1 } }],
    )
    const repository = await openRepository({ netImport: net.transport })

    const progress = await collect(
      repository.runServerImport('maimai-net', { region: 'jp', id: 'a', password: 'b', idempotencyKey: 'key-net-a' }),
    )

    expect(net.requests.map((request) => request.body.idempotencyKey)).toEqual(['key-net-a', 'key-net-a'])
    expect(routes()).toEqual(['get'])
    const job = progress.at(-1)?.job
    expect(job?.id).not.toBe(running.id)
    expect(job?.id).toBe(imports.jobByKey.get('key-net-a'))
  })

  it('reports the NET error event as a failed import without retrying', async () => {
    const net = imports.netTransport(() => [
      { type: 'error', code: 'INVALID_CREDENTIALS', message: 'Wrong SEGA ID or password', jobId: null },
    ])
    const repository = await openRepository({ netImport: net.transport })

    const error = await collect(
      repository.runServerImport('maimai-net', { region: 'jp', id: 'a', password: 'b' }),
    ).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ServerImportFailedError)
    expect((error as ServerImportFailedError).code).toBe('INVALID_CREDENTIALS')
    expect(net.requests).toHaveLength(1)
  })

  it('lists the import history of the save', async () => {
    const repository = await openRepository()
    await collect(repository.runServerImport('lxns', {}))
    const jobs = await repository.listImportJobs()
    expect(jobs.map((job) => job.source)).toEqual(['lxns'])
    expect(imports.calls.at(-1)).toEqual({ route: 'list', input: { id: 'dsav_one', limit: 20 } })
  })
})

describe('CloudScoreRepository import job reports (analytics, §12.3)', () => {
  it('reports each finished job with its source and who fetched it, nothing else', async () => {
    const reports: unknown[] = []
    const repository = await openRepository({ onImportJobFinished: (report) => reports.push(report) })

    await collect(repository.runServerImport('lxns', {}))
    await repository.applyImport([{ sheetId: SHEET_B, achievementRate: 99 }], { source: 'aqua-dx', mode: 'merge' })

    expect(reports).toEqual([
      { status: 'succeeded', source: 'lxns', fetchedBy: 'server' },
      { status: 'succeeded', source: 'aqua-dx', fetchedBy: 'client' },
    ])
  })

  it('reports a failed server job, and a failed maimai NET stream by its region', async () => {
    const reports: unknown[] = []
    const net = imports.netTransport(() => [{ type: 'error', code: 'INVALID_CREDENTIALS', message: 'no', jobId: null }])
    const repository = await openRepository({
      onImportJobFinished: (report) => reports.push(report),
      netImport: net.transport,
    })
    // The same Diving-Fish account's job is the user's import: it is adopted, and its failure reported
    const running = imports.startRunning('diving-fish', {
      trigger: 'user',
      sourceAccountKind: 'df_username',
      sourceAccountId: 'demo',
    })
    imports.failures.push({ status: 409, code: 'CONFLICT', data: { reason: 'IMPORT_IN_PROGRESS', jobId: running.id } })
    imports.api.get = async () => ({ ...running, status: 'failed', errorCode: 'upstream_unavailable' })

    await expect(collect(repository.runServerImport('diving-fish', { username: 'demo' }))).rejects.toThrow()
    await expect(
      collect(repository.runServerImport('maimai-net', { region: 'intl', id: 'sega-id', password: 'secret' })),
    ).rejects.toThrow()

    expect(reports).toEqual([
      { status: 'failed', source: 'diving-fish', fetchedBy: 'server' },
      { status: 'failed', source: 'maimai-net-intl', fetchedBy: 'server' },
    ])
    // Never an account, a credential or a job ID
    expect(JSON.stringify(reports)).not.toMatch(/sega-id|secret|demo|dimp_/)
  })

  it('reports nothing for an upload that never left the device', async () => {
    const reports: unknown[] = []
    const repository = await openRepository({ onImportJobFinished: (report) => reports.push(report) })

    await expect(
      repository.applyImport([{ sheetId: 'not-a-sheet', achievementRate: 99 }], { source: 'aqua-dx', mode: 'merge' }),
    ).rejects.toBeInstanceOf(NothingToImportError)

    expect(reports).toEqual([])
  })
})

describe('autoNetImportKey', () => {
  it('is one key per save and 15-minute window', () => {
    const start = Date.UTC(2026, 10, 3, 9, 0)
    expect(autoNetImportKey('dsav_one', start)).toBe(autoNetImportKey('dsav_one', start + 14 * 60_000))
    expect(autoNetImportKey('dsav_one', start)).not.toBe(autoNetImportKey('dsav_one', start + 15 * 60_000))
    expect(autoNetImportKey('dsav_one', start)).not.toBe(autoNetImportKey('dsav_two', start))
    expect(autoNetImportKey('dsav_one', start)).toMatch(/^auto-net-dsav_one-\d+$/)
  })
})