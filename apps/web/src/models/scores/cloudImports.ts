import {
  CLOUD_SAVE_MAX_IMPORT_CHUNKS,
  CLOUD_SAVE_MAX_IMPORT_RECORDS,
  type ImportJobDTO,
  type ImportRecord,
} from '@gekichumai/api-contract'
import { type ClientImportSource, PUBLIC_SHEET_ID_PATTERN, toAchievementInt } from '@gekichumai/maimai-domain'
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

/**
 * The records of an upload: one per chart (the best achievement of duplicates, the first on a tie), public sheet
 * IDs and valid achievements only. Provenance never leaves the device: a record claims at most its provider.
 * `skipped` counts the entries left out (no public sheet ID, no valid achievement), `duplicates` the entries folded
 * into another of the same chart.
 */
export function entriesToImportRecords(
  entries: readonly PlayEntry[],
  plan: ClientImportPlan,
): { records: ImportRecord[]; skipped: number; duplicates: number } {
  const bySheetId = new Map<string, ImportRecord>()
  let skipped = 0
  let duplicates = 0
  for (const entry of entries) {
    const achievement = typeof entry.achievementRate === 'number' ? toAchievementInt(entry.achievementRate) : null
    if (achievement === null || typeof entry.sheetId !== 'string' || !PUBLIC_SHEET_ID_PATTERN.test(entry.sheetId)) {
      skipped++
      continue
    }
    // Demo data is never synced, not even as a claim
    const provider: string | undefined = entry.source?.provider
    const claimedSource =
      plan.claimedSource ?? (plan.source === 'dxrating-json' && provider && provider !== 'demo' ? provider : null)
    const record: ImportRecord = {
      sheetId: entry.sheetId,
      achievement,
      comboFlag: entry.comboFlag ?? null,
      syncFlag: entry.syncFlag ?? null,
      dxScore: typeof entry.dxScore === 'number' && Number.isInteger(entry.dxScore) ? entry.dxScore : null,
      best50Bucket: entry.source?.best50Bucket ?? null,
      providerRecordId: entry.source?.providerId ? String(entry.source.providerId).slice(0, 128) : null,
      claimedSource,
    }
    const existing = bySheetId.get(entry.sheetId)
    if (existing) duplicates++
    if (!existing || record.achievement > existing.achievement) bySheetId.set(entry.sheetId, record)
  }
  return { records: [...bySheetId.values()], skipped, duplicates }
}

/** Splits an upload into `client-imports` chunks of at most 5000 records (§7.3) */
export function chunkImportRecords(records: readonly ImportRecord[]): ImportRecord[][] {
  const chunks: ImportRecord[][] = []
  for (let start = 0; start < records.length; start += CLOUD_SAVE_MAX_IMPORT_RECORDS) {
    chunks.push(records.slice(start, start + CLOUD_SAVE_MAX_IMPORT_RECORDS))
  }
  if (chunks.length > CLOUD_SAVE_MAX_IMPORT_CHUNKS) {
    throw new RangeError(
      `An import holds at most ${CLOUD_SAVE_MAX_IMPORT_CHUNKS * CLOUD_SAVE_MAX_IMPORT_RECORDS} records`,
    )
  }
  return chunks
}

const CANONICAL_RECORD_KEYS = [
  'sheetId',
  'achievement',
  'comboFlag',
  'syncFlag',
  'dxScore',
  'best50Bucket',
  'providerRecordId',
  'claimedSource',
] as const satisfies (keyof ImportRecord)[]

/**
 * The canonical body of an upload: every record sorted by sheet ID, its keys in a fixed order, absent values as
 * `null`. Its SHA-256 goes with each chunk as `rawPayloadSha256`, which the server compares with the hash it computes
 * itself (a cross-check only, §4.5, §7.3).
 */
export function canonicalImportBody(records: readonly ImportRecord[]): string {
  const sorted = [...records].sort((a, b) => (a.sheetId < b.sheetId ? -1 : a.sheetId > b.sheetId ? 1 : 0))
  return JSON.stringify(
    sorted.map((record) => Object.fromEntries(CANONICAL_RECORD_KEYS.map((key) => [key, record[key] ?? null]))),
  )
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
 * None of the entries can be uploaded (no public sheet ID, or no valid achievement): nothing was sent, and a
 * "clear, then import" left the save as it was
 */
export class NothingToImportError extends Error {
  constructor(readonly skipped: number) {
    super('None of these records match a chart; nothing was imported')
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