import {
  canonicalJson,
  CLOUD_SAVE_MAX_IMPORT_CHUNKS,
  CLOUD_SAVE_MAX_IMPORT_RECORDS,
  type ImportCountsDTO,
  type ImportJobDTO,
  type ImportRecord,
  ImportRecordSchema,
} from '@gekichumai/api-contract'
import {
  type ClientImportSource,
  type SourceAccountKind,
  PUBLIC_SHEET_ID_PATTERN,
  toAchievementInt,
} from '@gekichumai/maimai-domain'
import type { PlayEntry } from '../../components/rating/RatingCalculatorAddEntryForm'
import type { ImportEntrySource } from './ScoreRepository'

/**
 * Imports into a cloud save (meta#17, design §5.5, §7.3, §7.4, §8.3): what goes over the wire and how failures are
 * read. The repository does the calls; everything here is pure.
 */

/** Sources whose records the server fetches itself (§6.2); their records are never uploaded while it can */
export const SERVER_FETCHED_SOURCES = ['maimai-net', 'lxns', 'diving-fish'] as const satisfies ImportEntrySource[]
export type ServerFetchedSource = (typeof SERVER_FETCHED_SOURCES)[number]

export function isServerFetchedSource(source: ImportEntrySource): source is ServerFetchedSource {
  return (SERVER_FETCHED_SOURCES as readonly string[]).includes(source)
}

/** File sources and the `client-imports` source each uploads as (§5.1, §6.2) */
const CLIENT_SOURCE_BY_FILE_SOURCE: Partial<Record<ImportEntrySource, ClientImportSource>> = {
  'aqua-dx': 'aqua-dx',
  'mu-net': 'mu-net',
  'aqua-sqlite': 'aqua-sqlite',
  'dxrating-json': 'dxrating-json',
}

export interface ClientImportPlan {
  source: ClientImportSource
  /** The provider every record claims, when the upload is not a file of its own (the §7.4 fallback) */
  claimedSource: string | null
}

/**
 * How entries from `source` upload to `client-imports`:
 * - a file (AquaDX, mu-net, Aqua SQLite, DXRating JSON) uploads as its own file source; a DXRating JSON keeps the
 *   provider each entry names as the record's `claimedSource`;
 * - records fetched from maimai NET, LXNS or Diving-Fish upload only in the §7.4 fallback (server imports turned
 *   off), as `legacy-local` claiming the provider (`claimedSource`, e.g. `maimai-net-jp`; the source otherwise). They are `client_reported`, never verified. `null` otherwise:
 *   the server imports them itself.
 */
export function clientImportPlan(
  source: ImportEntrySource,
  serverImportsEnabled: boolean,
  claimedSource?: string,
): ClientImportPlan | null {
  const fileSource = CLIENT_SOURCE_BY_FILE_SOURCE[source]
  if (fileSource) return { source: fileSource, claimedSource: null }
  if (isServerFetchedSource(source) && !serverImportsEnabled) {
    return { source: 'legacy-local', claimedSource: claimedSource ?? source }
  }
  return null
}

/** What `claimedSource` accepts (`ClaimedSourceSchema`); a provider name that is not one is left out, not sent */
const CLAIMED_SOURCE_PATTERN = /^[\w.-]{1,64}$/

/**
 * The records of an upload: one per chart (the best achievement of duplicates, the first on a tie), each one exactly
 * as the server's strict `ImportRecordSchema` parses it. Provenance never leaves the device: a record claims at most
 * its provider (a DXRating JSON file and the first sign-in migration claim the provider each entry names).
 * - `skipped` counts the entries left out before validation: no public sheet ID, or no valid achievement;
 * - `rejected` counts the entries the server would reject (`ImportRecordSchema` fails: a DX score out of range, a
 *   claimed source it does not accept…). They are never sent, so a "clear, then import" only clears for records that
 *   can be imported;
 * - `duplicates` counts the valid entries folded into another of the same chart.
 */
export function entriesToImportRecords(
  entries: readonly PlayEntry[],
  plan: ClientImportPlan,
): { records: ImportRecord[]; skipped: number; rejected: number; duplicates: number } {
  const bySheetId = new Map<string, ImportRecord>()
  let skipped = 0
  let rejected = 0
  let duplicates = 0
  for (const entry of entries) {
    const achievement = typeof entry.achievementRate === 'number' ? toAchievementInt(entry.achievementRate) : null
    if (achievement === null || typeof entry.sheetId !== 'string' || !PUBLIC_SHEET_ID_PATTERN.test(entry.sheetId)) {
      skipped++
      continue
    }
    // Demo data is never synced, not even as a claim
    const provider: string | undefined = entry.source?.provider
    const claimsEntryProvider = plan.source === 'dxrating-json' || plan.source === 'legacy-local'
    const claimedSource =
      plan.claimedSource ??
      (claimsEntryProvider && provider && provider !== 'demo' && CLAIMED_SOURCE_PATTERN.test(provider)
        ? provider
        : null)
    const parsed = ImportRecordSchema.safeParse({
      sheetId: entry.sheetId,
      achievement,
      comboFlag: entry.comboFlag ?? null,
      syncFlag: entry.syncFlag ?? null,
      dxScore: typeof entry.dxScore === 'number' && Number.isInteger(entry.dxScore) ? entry.dxScore : null,
      // The hint the calculator honours (Diving-Fish only): a record never carries one the device ignored
      best50Bucket: provider === 'diving-fish' ? (entry.source?.best50Bucket ?? null) : null,
      providerRecordId: entry.source?.providerId ? String(entry.source.providerId).slice(0, 128) : null,
      claimedSource,
    } satisfies ImportRecord)
    if (!parsed.success) {
      rejected++
      continue
    }
    const record = parsed.data
    const existing = bySheetId.get(record.sheetId)
    if (existing) duplicates++
    if (!existing || record.achievement > existing.achievement) bySheetId.set(record.sheetId, record)
  }
  return { records: [...bySheetId.values()], skipped, rejected, duplicates }
}

/**
 * The most bytes one `client-imports` request body may hold: the backend takes 2 MiB on that route
 * (`CLOUD_SAVE_LARGE_BODY_LIMIT_BYTES`, the cloud-save body-limit middleware in `apps/backend/src/app.ts`); the
 * rest is a safety margin.
 */
export const CLIENT_IMPORT_BODY_LIMIT_BYTES = Math.floor(1.9 * 1024 * 1024)

/** The job fields every `client-imports` chunk repeats: the request input without `chunkIndex`, `chunkCount`, `records` */
export interface ClientImportEnvelope {
  id: string
  idempotencyKey: string
  source: string
  trigger: string
  sourceAccountId: string | null
  rawPayloadSha256?: string | null
}

/** The exact JSON body of one `client-imports` request (UTF-8 bytes): what {@link chunkImportRecords} bounds */
export function clientImportBody<E extends ClientImportEnvelope, R extends readonly ImportRecord[]>(
  envelope: E,
  chunk: { chunkIndex: number; chunkCount: number; records: R },
): E & { chunkIndex: number; chunkCount: number; records: R } {
  return { ...envelope, ...chunk }
}

const utf8 = new TextEncoder()
function jsonBytes(value: unknown): number {
  return utf8.encode(JSON.stringify(value)).byteLength
}

/** An upload that cannot be sent within the limits of `client-imports`; thrown before anything is cleared */
export class ImportTooLargeError extends Error {
  constructor(
    readonly reason: 'record-too-large' | 'too-many-chunks',
    message: string,
  ) {
    super(message)
    this.name = 'ImportTooLargeError'
  }
}

/**
 * Splits an upload into `client-imports` chunks (§7.3), each within both limits: at most 5000 records, and a request
 * body (`envelope` included) of at most {@link CLIENT_IMPORT_BODY_LIMIT_BYTES} in UTF-8. Deterministic: the same
 * records and envelope give the same chunks, so every retry of the key sends the same `chunkIndex`/`chunkCount`.
 *
 * Measured with the largest `chunkIndex`/`chunkCount` and a full hash in the envelope, then checked against the
 * exact body of each chunk. Throws {@link ImportTooLargeError} when one record alone is over the limit or the
 * upload needs more than {@link CLOUD_SAVE_MAX_IMPORT_CHUNKS} chunks.
 */
export function chunkImportRecords(
  records: readonly ImportRecord[],
  envelope: ClientImportEnvelope,
  limitBytes: number = CLIENT_IMPORT_BODY_LIMIT_BYTES,
): ImportRecord[][] {
  // The body with no records: every record adds its JSON, and a comma after the first
  const emptyBytes = jsonBytes(
    clientImportBody(
      { ...envelope, rawPayloadSha256: '0'.repeat(64) },
      { chunkIndex: CLOUD_SAVE_MAX_IMPORT_CHUNKS - 1, chunkCount: CLOUD_SAVE_MAX_IMPORT_CHUNKS, records: [] },
    ),
  )
  const chunks: ImportRecord[][] = []
  let chunk: ImportRecord[] = []
  let bytes = emptyBytes
  for (const record of records) {
    const recordBytes = jsonBytes(record)
    if (emptyBytes + recordBytes > limitBytes) {
      throw new ImportTooLargeError(
        'record-too-large',
        `The record of ${record.sheetId} alone is over the ${limitBytes}-byte upload limit`,
      )
    }
    const added = (chunk.length ? 1 : 0) + recordBytes
    if (chunk.length >= CLOUD_SAVE_MAX_IMPORT_RECORDS || bytes + added > limitBytes) {
      chunks.push(chunk)
      chunk = []
      bytes = emptyBytes
    }
    bytes += (chunk.length ? 1 : 0) + recordBytes
    chunk.push(record)
  }
  if (chunk.length) chunks.push(chunk)
  if (chunks.length > CLOUD_SAVE_MAX_IMPORT_CHUNKS) {
    throw new ImportTooLargeError(
      'too-many-chunks',
      `This upload needs ${chunks.length} requests; an import takes at most ${CLOUD_SAVE_MAX_IMPORT_CHUNKS}`,
    )
  }
  // The exact bodies, as sent
  for (const [chunkIndex, records] of chunks.entries()) {
    const body = clientImportBody(
      { ...envelope, rawPayloadSha256: '0'.repeat(64) },
      { chunkIndex, chunkCount: chunks.length, records },
    )
    if (jsonBytes(body) > limitBytes) throw new RangeError(`Chunk ${chunkIndex} is over the upload limit`)
  }
  return chunks
}

/**
 * The `rawPayloadSha256` of one `client-imports` chunk: the SHA-256 of the canonical JSON (keys sorted recursively,
 * records in the order sent) of its records, exactly what the server hashes for the chunk's accepted records
 * (`canonicalSha256` in the backend, through the shared `canonicalJson`). The records must be what
 * `ImportRecordSchema` parsed ({@link entriesToImportRecords}), so the server accepts every one and hashes the same
 * values. `null` where SubtleCrypto is unavailable (the hash is an optional cross-check, §4.5, §7.3).
 */
export function chunkPayloadSha256(records: readonly ImportRecord[]): Promise<string | null> {
  return canonicalSha256Hex(records)
}

/** SHA-256 hex of the shared canonical JSON of `value`, the web side of the backend's `canonicalSha256` */
export function canonicalSha256Hex(value: unknown): Promise<string | null> {
  return sha256Hex(canonicalJson(value))
}

/** SHA-256 in hex through SubtleCrypto; `null` where it is unavailable (the hash is optional) */
export async function sha256Hex(text: string): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) return null
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** A fresh key for one user action (§5.5) */
export function newIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  // Older browsers: still unique enough for one user's actions
  return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`
}

export const AUTO_NET_IMPORT_BUCKET_MS = 15 * 60 * 1000

/** The key of the automatic maimai NET import of a save: one per 15-minute window (§5.5) */
export function autoNetImportKey(saveId: string, now: number = Date.now()): string {
  return `auto-net-${saveId}-${Math.floor(now / AUTO_NET_IMPORT_BUCKET_MS)}`
}

/**
 * Whose server import a request is, to tell it from another job of the same source the server answered 409
 * `IMPORT_IN_PROGRESS` with (another tab, another device, the automatic import):
 * - `account`: the source account the server records on the job (`sourceAccountKind`/`sourceAccountId`), when the
 *   client can know it; `null` when it cannot be known, so no other job is ever this request's. LXNS is always
 *   `null`: the server resolves it from the user's linked account, which may have been relinked to another account
 *   while a job of the old one ran;
 * - `trigger`: `auto` never revives what the user deleted (§5.3), so a `user` request is never another `auto` job.
 */
export interface ServerImportIdentity {
  trigger: ImportJobDTO['trigger']
  account: { kind: SourceAccountKind; id: string } | null
}

/**
 * Whether `job` is the import `identity` asked for, so its result is this request's. A job whose account is not
 * known yet (a server job records it once it has fetched) or cannot be compared (a maimai NET friend code, an LXNS
 * linked account) is not:
 * the caller waits for it and sends its own request again.
 */
export function isSameServerImport(job: ImportJobDTO, identity: ServerImportIdentity): boolean {
  if (job.trigger !== identity.trigger) return false
  if (identity.account === null) return false
  return job.sourceAccountKind === identity.account.kind && job.sourceAccountId === identity.account.id
}

/** The best of what an import job did, as the UI reports it */
export function importedCount(counts: ImportCountsDTO): number {
  return counts.inserted + counts.improved + counts.provenanceUpgraded + counts.unchanged + counts.keptUserEdit
}

// --- Errors ---

function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null && key in value
    ? (value as Record<string, unknown>)[key]
    : undefined
}

/** A non-2xx answer of a route the oRPC client does not cover (the maimai NET SSE route) */
export class CloudImportHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    readonly data: unknown,
    message?: string,
  ) {
    super(message ?? `HTTP ${status}${code ? ` ${code}` : ''}`)
    this.name = 'CloudImportHttpError'
  }
}

/** The running job a 409 `IMPORT_IN_PROGRESS` names, or `null` for any other error */
export function importInProgressJobId(error: unknown): string | null {
  const status = field(error, 'status')
  const code = field(error, 'code')
  if (status !== 409 && code !== 'CONFLICT') return null
  const data = field(error, 'data')
  const jobId = field(data, 'jobId')
  if (field(data, 'reason') !== 'IMPORT_IN_PROGRESS' || typeof jobId !== 'string') return null
  return jobId
}

/**
 * Whether a failed import request may be sent again with the same key: no answer (offline, a dropped connection),
 * 5xx, 429. A 4xx is the same answer every time.
 */
export function isRetryableImportError(error: unknown): { retry: boolean; afterMs?: number } {
  if (error instanceof TypeError) return { retry: true }
  const status = field(error, 'status')
  const code = field(error, 'code')
  if (status === 429 || code === 'TOO_MANY_REQUESTS') {
    const seconds = Number(field(field(error, 'data'), 'retryAfterSeconds'))
    return { retry: true, afterMs: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined }
  }
  if (typeof status === 'number') return { retry: status >= 500 }
  return { retry: code === 'INTERNAL_SERVER_ERROR' || code === 'BAD_GATEWAY' || code === 'SERVICE_UNAVAILABLE' }
}

/** The code of {@link ImportAlreadyRunningError} */
export const IMPORT_IN_PROGRESS = 'IMPORT_IN_PROGRESS'

/** A server import job that ended `failed` (or the NET stream's `error` event) */
export class ServerImportFailedError extends Error {
  constructor(
    /** The job's `errorCode`, or the NET stream's error code (`INVALID_CREDENTIALS`, `NET_MAINTENANCE`…) */
    readonly code: string,
    readonly job: ImportJobDTO | null,
    message?: string,
  ) {
    super(message ?? `Import failed: ${code}`)
    this.name = 'ServerImportFailedError'
  }
}

/** The save has changes the server has not taken yet: a "clear, then import" would race them */
export class CloudClearNotSentError extends Error {
  constructor() {
    super('The save could not be cleared on the server; nothing was imported')
    this.name = 'CloudClearNotSentError'
  }
}

/**
 * None of the entries can be uploaded (no public sheet ID, no valid achievement, or a record the server's
 * `ImportRecordSchema` rejects): nothing was sent, and a
 * "clear, then import" left the save as it was
 */
export class NothingToImportError extends Error {
  constructor(
    readonly skipped: number,
    /** Entries the server would reject (`ImportRecordSchema`): an out-of-range value, a claim it does not accept */
    readonly rejected: number = 0,
  ) {
    super('None of these records can be imported; nothing was imported')
    this.name = 'NothingToImportError'
  }
}

/** Server imports are off for the user (§7.4): the caller uses the fallback */
export class ServerImportsDisabledError extends Error {
  constructor() {
    super('Server imports are turned off')
    this.name = 'ServerImportsDisabledError'
  }
}
/**
 * Another import of the same source was running on the save, for another account or trigger, and was still (or
 * again) running when this request was sent once more: this import did not run. Its job is never reported as this
 * one's. A {@link ServerImportFailedError} with the code `IMPORT_IN_PROGRESS`, so every server import UI says so.
 */
export class ImportAlreadyRunningError extends ServerImportFailedError {
  constructor(job: ImportJobDTO | null) {
    super(
      IMPORT_IN_PROGRESS,
      job,
      'Another import of this source is running on this save; try again when it has finished',
    )
    this.name = 'ImportAlreadyRunningError'
  }
}