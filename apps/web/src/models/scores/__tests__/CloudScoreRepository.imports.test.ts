import type { ImportJobDTO, ImportRecordInput, ImportResultDTO } from '@gekichumai/api-contract'
import type { Provenance } from '@gekichumai/maimai-domain'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PlayEntry } from '../../../components/rating/RatingCalculatorAddEntryForm'
import {
  autoNetImportKey,
  canonicalImportBody,
  CloudImportHttpError,
  entriesToImportRecords,
  ServerImportFailedError,
  ServerImportsDisabledError,
  sha256Hex,
} from '../cloudImports'
import type { NetImportRequest, NetImportStreamEvent, NetImportTransport } from '../cloudNetImport'
import {
  type CloudSaveImportsApi,
  CloudScoreRepository,
  type CloudScoreRepositoryOptions,
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
  private nextJob = 1

  constructor(private readonly records: FakeCloudSaveServer) {}

  readonly api: CloudSaveImportsApi = {
    client: async (input) => {
      this.call('client', input)
      const job = this.jobFor(input.idempotencyKey, input.source as ImportJobDTO['source'], 'client', input.trigger)
      for (const record of input.records) {
        const value = record as Record<string, unknown>
        this.records.put(value.sheetId as string, value.achievement as number, {
          ...manualProvenance(),
          source: input.source as Provenance['source'],
          claimedSource: (value.claimedSource as string | null) ?? null,
          entryMethod: 'file',
          importJobId: job.id,
        })
      }
      job.counts = counts({ fetched: job.counts.fetched + input.records.length })
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

  /** A job of another action (another tab, the automatic import) that is still running */
  startRunning(source: ImportJobDTO['source']): ImportJobDTO {
    const job = this.jobFor(`other-${this.nextJob}`, source, 'server', 'auto')
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
    // The canonical body's hash, as a cross-check
    const records = entriesToImportRecords(entries, { source: 'aqua-dx', claimedSource: null }).records
    expect(input.rawPayloadSha256).toBe(await sha256Hex(canonicalImportBody(records)))
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
    expect(new Set(chunks.map((chunk) => chunk.rawPayloadSha256)).size).toBe(1)
    expect(imports.jobs.size).toBe(1)
    expect(repository.entries()).toHaveLength(5001)
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

  it('attaches to the running job on 409 IMPORT_IN_PROGRESS and polls it', async () => {
    const repository = await openRepository()
    const running = imports.startRunning('lxns')
    imports.runningPolls = 2
    imports.failures.push({
      status: 409,
      code: 'CONFLICT',
      data: { reason: 'IMPORT_IN_PROGRESS', jobId: running.id },
    })

    const progress = await collect(repository.runServerImport('lxns', {}))

    expect(routes()).toEqual(['lxns', 'get', 'get', 'get'])
    expect(imports.calls.slice(1).every((call) => call.input.jobId === running.id)).toBe(true)
    expect(progress.map((item) => item.stage)).toEqual(['waiting', 'pulling', 'done'])
    expect(progress.at(-1)?.job?.id).toBe(running.id)
    expect(repository.entries()).toHaveLength(1)
  })

  it('throws when the job fails', async () => {
    const repository = await openRepository()
    const running = imports.startRunning('diving-fish')
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

  it('attaches to a running NET job when the stream answers 409', async () => {
    const running = imports.startRunning('maimai-net-jp')
    const net = imports.netTransport(
      () => new CloudImportHttpError(409, 'CONFLICT', { reason: 'IMPORT_IN_PROGRESS', jobId: running.id }),
    )
    const repository = await openRepository({ netImport: net.transport })

    const progress = await collect(repository.runServerImport('maimai-net', { region: 'jp', id: 'a', password: 'b' }))

    expect(net.requests).toHaveLength(1)
    expect(routes()).toEqual(['get'])
    expect(progress.at(-1)?.job?.id).toBe(running.id)
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

describe('autoNetImportKey', () => {
  it('is one key per save and 15-minute window', () => {
    const start = Date.UTC(2026, 10, 3, 9, 0)
    expect(autoNetImportKey('dsav_one', start)).toBe(autoNetImportKey('dsav_one', start + 14 * 60_000))
    expect(autoNetImportKey('dsav_one', start)).not.toBe(autoNetImportKey('dsav_one', start + 15 * 60_000))
    expect(autoNetImportKey('dsav_one', start)).not.toBe(autoNetImportKey('dsav_two', start))
    expect(autoNetImportKey('dsav_one', start)).toMatch(/^auto-net-dsav_one-\d+$/)
  })
})