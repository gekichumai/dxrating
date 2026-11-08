import type { ImportJobDTO, SaveDTO } from '@gekichumai/api-contract'
import {
  decideManualMutation,
  type ManualEntryMethod,
  type Provenance,
  type SongCatalog,
  toAchievementInt,
} from '@gekichumai/maimai-domain'
import type { PlayEntry } from '../../components/rating/RatingCalculatorAddEntryForm'
import type { CloudSaveController, CloudSaveUi } from './CloudSaveUiContext'
import type { CloudSaveActions } from './cloudSaveActions'
import {
  type CloudRecord,
  cloudRecordToPlayEntry,
  cloudRecordToScoreRecord,
  manualEntryToSetValue,
} from './cloudScoreMapping'
import type {
  ImportMeta,
  ImportProgress,
  ImportResult,
  ManualEntry,
  ScoreRecord,
  ScoreRepositoryStatus,
  ServerImportArgs,
  ServerImportKind,
  SyncIssue,
  WebScoreRepository,
} from './ScoreRepository'

/**
 * An in-memory cloud save for dev and preview demos (`?demoCloudSave=1`, see `CloudSaveDemoBoundary`): synthetic
 * records of every provenance, sync issues, three saves and an import history. It never sends a request.
 */

export type DemoCloudSaveState = ScoreRepositoryStatus['state']

const DEMO_JOB_ID = 'dimp_demo_net'
const DEMO_HASH = 'd'.repeat(64)

const verified = (source: Provenance['source'], sourceAccountId: string | null, fetchedAt: string): Provenance => ({
  source,
  claimedSource: null,
  fetchedBy: 'server',
  verification: 'verified',
  entryMethod: 'import',
  sourceAccountId,
  importJobId: DEMO_JOB_ID,
  rawPayloadSha256: DEMO_HASH,
  fetchedAt,
  editedFromJobId: null,
})

const clientReported = (
  source: Provenance['source'],
  claimedSource: string | null,
  entryMethod: Provenance['entryMethod'],
): Provenance => ({
  source,
  claimedSource,
  fetchedBy: 'client',
  verification: 'client_reported',
  entryMethod,
  sourceAccountId: null,
  importJobId: source === 'manual' ? null : 'dimp_demo_file',
  rawPayloadSha256: null,
  fetchedAt: null,
  editedFromJobId: null,
})

/** The provenance of each demo record, in order; the rest are verified maimai NET (JP) records */
const PROVENANCES: Provenance[] = [
  verified('maimai-net-jp', '123456789012345', '2026-11-02T09:30:00.000Z'),
  verified('lxns', '987654321098', '2026-11-01T12:00:00.000Z'),
  verified('diving-fish', 'demo_player', '2026-10-30T08:15:00.000Z'),
  clientReported('aqua-dx', null, 'file'),
  clientReported('dxrating-json', 'lxns', 'file'),
  clientReported('legacy-local', 'maimai-net', 'migration'),
  clientReported('manual', null, 'typed'),
  { ...clientReported('manual', null, 'keypad'), verification: 'user_edited', editedFromJobId: DEMO_JOB_ID },
]

const ACHIEVEMENTS = [1005432, 1004120, 1003000, 1002011, 1001500, 1000800, 999500, 998000, 995500, 992000, 990000]

function demoSheetIds(catalog: SongCatalog, count: number): string[] {
  return [...catalog.sheets]
    .filter((sheet) => sheet.isRatingEligible && typeof sheet.internalLevelValue === 'number')
    .sort((a, b) => (b.internalLevelValue ?? 0) - (a.internalLevelValue ?? 0))
    .slice(0, count * 3)
    .filter((_, index) => index % 3 === 0)
    .map((sheet) => sheet.id)
}

const DEMO_SAVES: SaveDTO[] = [
  {
    id: 'dsav_demo_main',
    name: 'Main card',
    region: 'jp',
    gameVersion: null,
    clientProfileKey: 'web-local',
    revision: 412,
    recordCount: 1287,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-11-02T09:31:00.000Z',
    latestSnapshot: {
      id: 1,
      atRevision: 410,
      b15Sum: 4980,
      b35Sum: 11012,
      b50Sum: 15992,
      recordCount: 1287,
      gameVersion: 'circle-plus',
      detail: null,
      createdAt: '2026-11-02T09:31:00.000Z',
    },
  },
  {
    id: 'dsav_demo_intl',
    name: 'International',
    region: 'intl',
    gameVersion: null,
    clientProfileKey: null,
    revision: 88,
    recordCount: 342,
    createdAt: '2026-10-10T00:00:00.000Z',
    updatedAt: '2026-10-28T20:05:00.000Z',
    latestSnapshot: null,
  },
  {
    id: 'dsav_demo_cn',
    name: 'Shanghai arcade',
    region: 'cn',
    gameVersion: null,
    clientProfileKey: null,
    revision: 20,
    recordCount: 96,
    createdAt: '2026-10-20T00:00:00.000Z',
    updatedAt: '2026-10-21T11:40:00.000Z',
    latestSnapshot: null,
  },
]

const counts = (overrides: Partial<ImportJobDTO['counts']>): ImportJobDTO['counts'] => ({
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

const job = (overrides: Partial<ImportJobDTO>): ImportJobDTO => ({
  id: DEMO_JOB_ID,
  saveId: 'dsav_demo_main',
  source: 'maimai-net-jp',
  fetchedBy: 'server',
  trigger: 'user',
  sourceAccountId: '1234…',
  sourceAccountKind: 'friend_code',
  status: 'succeeded',
  startedAt: '2026-11-02T09:30:00.000Z',
  fetchedAt: '2026-11-02T09:30:20.000Z',
  finishedAt: '2026-11-02T09:30:25.000Z',
  rawPayloadSha256: DEMO_HASH,
  counts: counts({}),
  errorCode: null,
  ...overrides,
})

const DEMO_JOBS: ImportJobDTO[] = [
  job({
    trigger: 'auto',
    counts: counts({ fetched: 1287, inserted: 3, improved: 5, unchanged: 1278, keptUserEdit: 1 }),
  }),
  job({
    id: 'dimp_demo_lxns',
    source: 'lxns',
    startedAt: '2026-11-01T12:00:00.000Z',
    counts: counts({ fetched: 1190, inserted: 12, improved: 40, provenanceUpgraded: 210, unchanged: 928 }),
  }),
  job({
    id: 'dimp_demo_file',
    source: 'aqua-dx',
    fetchedBy: 'client',
    sourceAccountKind: null,
    sourceAccountId: null,
    startedAt: '2026-10-25T18:00:00.000Z',
    counts: counts({ fetched: 640, inserted: 620, skippedUnknownSheet: 20 }),
  }),
  job({
    // A Diving-Fish player who hides part of their scores: those rows are counted apart, not as rejected
    id: 'dimp_demo_diving_fish',
    source: 'diving-fish',
    sourceAccountId: 'demo-player',
    sourceAccountKind: 'df_username',
    startedAt: '2026-10-25T09:30:00.000Z',
    counts: counts({ fetched: 50, inserted: 12, improved: 6, unchanged: 28, skippedMasked: 4 }),
  }),
  job({
    id: 'dimp_demo_failed',
    startedAt: '2026-10-24T07:45:00.000Z',
    status: 'failed',
    errorCode: 'INVALID_CREDENTIALS',
    counts: counts({}),
  }),
]

export class DemoCloudScoreRepository implements WebScoreRepository, CloudSaveController {
  readonly kind = 'cloud' as const
  readonly ready = true
  readonly serverImportsEnabled = true
  saveId = DEMO_SAVES[0]!.id

  private readonly records = new Map<string, CloudRecord>()
  private issues: SyncIssue[] = []
  private currentStatus: ScoreRepositoryStatus
  private cachedList: readonly ScoreRecord[] | null = null
  private cachedEntries: readonly PlayEntry[] | null = null
  private readonly listeners = new Set<() => void>()
  private revision = 400

  constructor(
    private readonly catalog: SongCatalog,
    private readonly state: DemoCloudSaveState = 'idle',
  ) {
    const sheetIds = demoSheetIds(catalog, ACHIEVEMENTS.length)
    sheetIds.forEach((sheetId, index) => {
      this.records.set(sheetId, {
        sheetId,
        achievement: ACHIEVEMENTS[index] ?? 990000,
        comboFlag: index % 3 === 0 ? 'ap' : index % 3 === 1 ? 'fcp' : null,
        syncFlag: index % 4 === 0 ? 'fsd' : null,
        dxScore: null,
        best50Bucket: null,
        providerRecordId: null,
        provenance: PROVENANCES[index] ?? verified('maimai-net-jp', '123456789012345', '2026-11-02T09:30:00.000Z'),
        revision: ++this.revision,
        deletedAt: null,
        pending: false,
      })
    })
    const at = (minutes: number) => new Date(Date.parse('2026-11-02T10:00:00.000Z') + minutes * 60_000).toISOString()
    const [first, second, third] = sheetIds
    if (first && second && third) {
      this.issues = [
        {
          id: 'demo-issue-1',
          saveId: this.saveId,
          sheetId: first,
          kind: 'superseded',
          reason: 'newer-verified-record',
          intent: {
            op: 'set',
            value: { achievement: 1001000, comboFlag: 'fc', syncFlag: null },
            entryMethod: 'typed',
            clientEditedAt: at(-30),
          },
          createdAt: at(0),
        },
        {
          id: 'demo-issue-2',
          saveId: this.saveId,
          sheetId: second,
          kind: 'superseded',
          reason: 'newer-verified-record',
          intent: { op: 'delete', entryMethod: 'typed', clientEditedAt: at(-12) },
          createdAt: at(0),
        },
        {
          id: 'demo-issue-3',
          saveId: this.saveId,
          sheetId: third,
          kind: 'rejected',
          reason: 'achievement out of range',
          intent: {
            op: 'set',
            value: { achievement: 1010001, comboFlag: null, syncFlag: null },
            entryMethod: 'keypad',
            clientEditedAt: at(-5),
          },
          createdAt: at(0),
        },
      ]
    }
    this.currentStatus = this.buildStatus()
  }

  get status(): ScoreRepositoryStatus {
    return this.currentStatus
  }

  list(): readonly ScoreRecord[] {
    if (!this.cachedList) {
      const list: ScoreRecord[] = []
      for (const record of this.records.values()) {
        const identity = this.catalog.getById(record.sheetId)?.identity
        if (record.deletedAt === null && identity) list.push(cloudRecordToScoreRecord(record, identity))
      }
      this.cachedList = Object.freeze(list)
    }
    return this.cachedList
  }

  get(sheetId: string): ScoreRecord | undefined {
    return this.list().find((record) => record.sheetId === sheetId)
  }

  entries(): readonly PlayEntry[] {
    if (!this.cachedEntries) {
      this.cachedEntries = Object.freeze(
        [...this.records.values()]
          .filter((record) => record.deletedAt === null)
          .map((record) => cloudRecordToPlayEntry(record, this.catalog.getById(record.sheetId)?.identity)),
      )
    }
    return this.cachedEntries
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }

  setManual(entry: ManualEntry, method: ManualEntryMethod): void {
    this.applyManual(entry.sheetId, { op: 'set', value: manualEntryToSetValue(entry), entryMethod: method })
  }

  delete(sheetIds: string[]): void {
    for (const sheetId of sheetIds) this.applyManual(sheetId, { op: 'delete' })
  }

  clear(): void {
    this.delete([...this.records.keys()])
  }

  async applyImport(entries: PlayEntry[], _meta: ImportMeta): Promise<ImportResult> {
    for (const entry of entries) {
      const achievement = toAchievementInt(entry.achievementRate)
      if (achievement === null) continue
      this.applyManual(entry.sheetId, {
        op: 'set',
        value: { achievement, comboFlag: entry.comboFlag ?? null, syncFlag: entry.syncFlag ?? null },
        entryMethod: 'typed',
      })
    }
    return { count: entries.length }
  }

  async *runServerImport<K extends ServerImportKind>(
    kind: K,
    _args: ServerImportArgs[K],
  ): AsyncGenerator<ImportProgress> {
    const stages = kind === 'maimai-net' ? ['auth:in-progress', 'fetch:music:in-progress:master', 'concluded'] : []
    for (const [index, stage] of stages.entries()) {
      await new Promise((resolve) => setTimeout(resolve, 600))
      yield { stage, progress: (index + 1) / (stages.length + 1) }
    }
    yield { stage: 'done', progress: 1, job: DEMO_JOBS[0] }
  }

  reapplyIssue(issueId: string): void {
    const issue = this.issues.find((candidate) => candidate.id === issueId)
    if (!issue) return
    this.issues = this.issues.filter((candidate) => candidate !== issue)
    if (issue.intent.op === 'set' && issue.intent.value) {
      this.applyManual(issue.sheetId, { op: 'set', value: issue.intent.value, entryMethod: issue.intent.entryMethod })
    } else if (issue.intent.op === 'delete') {
      this.applyManual(issue.sheetId, { op: 'delete' })
    } else {
      this.changed()
    }
  }

  dismissIssue(issueId: string): void {
    this.issues = this.issues.filter((issue) => issue.id !== issueId)
    this.changed()
  }

  async listImportJobs(): Promise<ImportJobDTO[]> {
    return DEMO_JOBS
  }

  switchSave(saveId: string) {
    this.saveId = saveId
    this.changed()
  }

  private applyManual(
    sheetId: string,
    change:
      | {
          op: 'set'
          value: {
            achievement: number
            comboFlag: CloudRecord['comboFlag']
            syncFlag: CloudRecord['syncFlag']
            dxScore?: number | null
          }
          entryMethod: ManualEntryMethod
        }
      | { op: 'delete' },
  ) {
    const existing = this.records.get(sheetId) ?? null
    const decision = decideManualMutation(
      existing,
      change.op === 'set'
        ? { op: 'set', basedOnRevision: existing?.revision ?? 0, value: change.value, entryMethod: change.entryMethod }
        : { op: 'delete', basedOnRevision: existing?.revision ?? 0 },
    )
    if (decision.status === 'applied' && decision.next) {
      const { deleted, ...fields } = decision.next
      this.records.set(sheetId, {
        ...fields,
        sheetId,
        revision: ++this.revision,
        deletedAt: deleted ? new Date().toISOString() : null,
        pending: false,
      })
    }
    this.changed()
  }

  private buildStatus(): ScoreRepositoryStatus {
    return Object.freeze({
      state: this.state,
      pendingCount: this.state === 'idle' ? 0 : 3,
      lastSyncedRevision: this.revision,
      issues: Object.freeze(this.issues.filter((issue) => issue.saveId === this.saveId)),
    })
  }

  private changed() {
    this.cachedList = null
    this.cachedEntries = null
    this.currentStatus = this.buildStatus()
    for (const listener of [...this.listeners]) listener()
  }
}

export function createDemoCloudSave(
  catalog: SongCatalog,
  state: DemoCloudSaveState = 'idle',
): { repository: DemoCloudScoreRepository; ui: CloudSaveUi } {
  const repository = new DemoCloudScoreRepository(catalog, state)
  return {
    repository,
    ui: {
      controller: repository,
      listSaves: async () => DEMO_SAVES,
      setActiveSaveId: (saveId) => repository.switchSave(saveId),
    },
  }
}
/**
 * The dev demo flows of `?demoCloudSaveFlow=` (screenshots of the migration dialog, the beta opt-in and "Use a cloud
 * save")
 */
export type DemoCloudSaveFlow = 'migrate' | 'migrate-existing' | 'opt-in' | 'choose-save'

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Cloud save account actions that never leave the browser: the migration finds no save (`migrate`) or the demo's
 * main save (`migrate-existing`), and every request answers after a short pause
 */
export function createDemoCloudSaveActions(flow: DemoCloudSaveFlow): CloudSaveActions {
  const migrationJob = (saveId: string, fetched: number) =>
    job({
      id: 'dimp_demo_migration',
      saveId,
      source: 'legacy-local',
      fetchedBy: 'client',
      trigger: 'migration',
      sourceAccountId: null,
      sourceAccountKind: null,
      rawPayloadSha256: DEMO_HASH,
      counts: counts({ fetched, inserted: fetched }),
    })
  return {
    migration: {
      listSaves: async () => {
        await pause(300)
        return flow === 'migrate-existing' ? [DEMO_SAVES[0]!] : []
      },
      createSave: async (input) => {
        await pause(300)
        return { ...DEMO_SAVES[0]!, name: input.name, region: input.region, revision: 0, recordCount: 0 }
      },
      clientImport: async (input) => {
        await pause(800)
        return { job: migrationJob(input.id, input.records.length), revision: 1 }
      },
      replace: async (input) => {
        await pause(800)
        return { job: migrationJob(input.id, input.records.length), revision: input.ifRevision + 1 }
      },
      getImportJob: async () => migrationJob(DEMO_SAVES[0]!.id, 0),
    },
    optIn: async () => {
      await pause(300)
      return { cloudSave: true, serverImports: true, optInAvailable: false }
    },
    exportData: async () => ({
      blob: new Blob([JSON.stringify({ format: 'dxrating-cloud-save-export', version: 1, saves: [] })], {
        type: 'application/json',
      }),
      fileName: 'dxrating-cloud-export-demo.json',
    }),
  }
}