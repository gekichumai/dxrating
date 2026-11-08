import type {
  ChangesDTO,
  ChecksumDTO,
  MutationItemInput,
  MutationResultDTO,
  MutationsResultDTO,
  RecordDTO,
} from '@gekichumai/api-contract'
import {
  decideManualMutation,
  type ManualEntryMethod,
  type ManualSetValue,
  type Provenance,
} from '@gekichumai/maimai-domain'
import type { ChangesMode, CloudSaveRecordsApi } from '../CloudScoreRepository'

/**
 * An in-memory cloud save server for the web tests: per-row revisions (§5.2), the manual mutation rules of
 * maimai-domain (§5.4), idempotent mutation IDs (§5.5), paged changes with a checksum on the last page (§5.8) and a
 * tombstone horizon (§5.6).
 */

export const verifiedProvenance = (overrides: Partial<Provenance> = {}): Provenance => ({
  source: 'maimai-net-jp',
  claimedSource: null,
  fetchedBy: 'server',
  verification: 'verified',
  entryMethod: 'import',
  sourceAccountId: null,
  importJobId: 'dimp_job1',
  rawPayloadSha256: 'a'.repeat(64),
  fetchedAt: '2026-11-02T00:00:00.000Z',
  editedFromJobId: null,
  ...overrides,
})

export const manualProvenance = (overrides: Partial<Provenance> = {}): Provenance => ({
  source: 'manual',
  claimedSource: null,
  fetchedBy: 'client',
  verification: 'client_reported',
  entryMethod: 'typed',
  sourceAccountId: null,
  importJobId: null,
  rawPayloadSha256: null,
  fetchedAt: null,
  editedFromJobId: null,
  ...overrides,
})

const NOW = '2026-11-03T00:00:00.000Z'

export class FakeCloudSaveServer {
  revision = 0
  readonly records = new Map<string, RecordDTO>()
  readonly mutateCalls: MutationItemInput[][] = []
  /** The `since` of every `changes` call */
  readonly changesCalls: number[] = []
  /** The `mode` of every `changes` call */
  readonly changesModes: ChangesMode[] = []
  /** Thrown, in order, by the next calls (either route) */
  readonly failures: unknown[] = []
  /** Incremental pulls from a revision below this answer `resetRequired`; {@link purge} moves it like the cleanup */
  tombstoneHorizon = 0
  /** Page size, whatever the client asks */
  pageSize = 1000
  /** Returned instead of the real checksum, once */
  checksumOverride: ChecksumDTO | null = null
  /** Runs at the start of each `changes` call */
  onChanges: (() => void) | null = null
  /** Answers the mutations of the next `mutate` call instead of applying them, once */
  respondOnce: ((mutations: MutationItemInput[]) => MutationsResultDTO) | null = null
  private readonly processed = new Map<string, MutationResultDTO>()

  /** A write from elsewhere (another device, an import job) */
  put(
    sheetId: string,
    achievement: number,
    provenance: Provenance = manualProvenance(),
    extra: Partial<RecordDTO> = {},
  ): RecordDTO {
    const record: RecordDTO = {
      sheetId,
      achievement,
      comboFlag: null,
      syncFlag: null,
      dxScore: null,
      best50Bucket: null,
      providerRecordId: null,
      provenance,
      revision: ++this.revision,
      valueChangedAt: NOW,
      clientEditedAt: null,
      deletedAt: null,
      ...extra,
    }
    this.records.set(sheetId, record)
    return record
  }

  /** Removes a row entirely (a purged tombstone): the horizon moves to the highest purged revision */
  purge(sheetId: string) {
    const record = this.records.get(sheetId)
    if (!record) return
    this.records.delete(sheetId)
    this.tombstoneHorizon = Math.max(this.tombstoneHorizon, record.revision)
  }

  readonly api: CloudSaveRecordsApi = {
    changes: async ({ since, limit, mode = 'incremental' }) => {
      this.changesCalls.push(since)
      this.changesModes.push(mode)
      this.onChanges?.()
      this.throwFailure()
      return this.changes(since, Math.min(limit, this.pageSize), mode)
    },
    mutate: async ({ mutations }) => {
      this.mutateCalls.push(mutations)
      this.throwFailure()
      if (this.respondOnce) {
        const respond = this.respondOnce
        this.respondOnce = null
        return respond(mutations)
      }
      return { revision: this.revision, results: mutations.map((mutation) => this.apply(mutation)) }
    },
  }

  checksum(): ChecksumDTO {
    let count = 0
    let sumAchievement = 0
    for (const record of this.records.values()) {
      if (record.deletedAt !== null) continue
      count++
      sumAchievement += record.achievement
    }
    return { count, sumAchievement }
  }

  private throwFailure() {
    if (this.failures.length) throw this.failures.shift()
  }

  /** `pullChanges` of the backend (apps/backend/src/services/cloud-save/changes.ts), row for row */
  private changes(since: number, limit: number, mode: ChangesMode): ChangesDTO {
    if (since > 0 && (since > this.revision || (mode === 'incremental' && since < this.tombstoneHorizon))) {
      return {
        records: [],
        nextSince: 0,
        hasMore: false,
        revision: this.revision,
        resetRequired: true,
        checksum: null,
      }
    }
    // `since = 0`: live rows only; later pages (either mode): live rows and tombstones
    const rows = [...this.records.values()]
      .filter((record) => record.revision > since && (since > 0 || record.deletedAt === null))
      .sort((a, b) => a.revision - b.revision)
    const page = rows.slice(0, limit)
    const hasMore = rows.length > limit
    let checksum: ChecksumDTO | null = null
    if (!hasMore) {
      checksum = this.checksumOverride ?? this.checksum()
      this.checksumOverride = null
    }
    return {
      records: page,
      // The last page resumes at the save's revision, past purged tombstones
      nextSince: hasMore ? page[page.length - 1]!.revision : this.revision,
      hasMore,
      revision: this.revision,
      resetRequired: false,
      checksum,
    }
  }

  private apply(mutation: MutationItemInput): MutationResultDTO {
    const known = this.processed.get(mutation.mutationId)
    if (known) return known
    const sheetId = mutation.sheetId as string
    const existing = this.records.get(sheetId) ?? null
    const decision = decideManualMutation(
      existing,
      mutation.op === 'set'
        ? {
            op: 'set',
            basedOnRevision: mutation.basedOnRevision as number | null,
            value: mutation.value as ManualSetValue,
            entryMethod: mutation.entryMethod as ManualEntryMethod,
          }
        : { op: 'delete', basedOnRevision: mutation.basedOnRevision as number | null },
    )
    let result: MutationResultDTO
    if (decision.status === 'applied' && decision.next) {
      const { deleted, ...fields } = decision.next
      const record: RecordDTO = {
        ...fields,
        sheetId,
        revision: ++this.revision,
        valueChangedAt: NOW,
        clientEditedAt: (mutation.clientEditedAt as string | undefined) ?? null,
        deletedAt: deleted ? NOW : null,
      }
      this.records.set(sheetId, record)
      result = { mutationId: mutation.mutationId, status: 'applied', record, reason: null }
    } else {
      result = {
        mutationId: mutation.mutationId,
        status: decision.status,
        record: decision.status === 'rejected' ? null : existing,
        reason: decision.reason,
      }
    }
    this.processed.set(mutation.mutationId, result)
    return result
  }
}