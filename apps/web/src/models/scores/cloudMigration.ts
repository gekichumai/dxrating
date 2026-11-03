import type { ImportJobDTO, ImportRecord, ImportResultDTO, SaveDTO } from '@gekichumai/api-contract'
import type { PlayEntry } from '../../components/rating/RatingCalculatorAddEntryForm'
import { RATING_ENTRIES_STORAGE_KEY } from '../../catalog/savedDataMigration'
import type { Region } from '../context/AppContext'
import {
  canonicalImportBody,
  chunkImportRecords,
  entriesToImportRecords,
  importInProgressJobId,
  isRetryableImportError,
  NothingToImportError,
  ServerImportFailedError,
  sha256Hex,
} from './cloudImports'

/**
 * The first sign-in migration of the web (meta#17, design §10, the revised #183): the visitor's local save goes to a
 * cloud save, only when they ask for it ("Back up to cloud"), never on its own.
 *
 * - No cloud save yet: `POST /saves` (idempotent through `clientProfileKey: 'web-local'`), then `client-imports`
 *   (`source: 'legacy-local'`, `trigger: 'migration'`, key `migrate-<deviceId>-web-local-<tag>`), chunked. Every record is
 *   `client_reported` and claims the provider its entry names; the server sets the entry method (§10.3).
 * - A cloud save another device already made: merge into it the same way (the default), use the cloud save only, or,
 *   after a second confirmation, replace it with this device's save (`/replace` with `ifRevision`).
 *
 * Before anything is sent, the local save is copied to `rating-calculator-entries.pre-cloud-backup` (kept 30 days,
 * like the `.legacy-backup` of the sheet ID migration); the local save itself stays, as the save used when signed
 * out. Every step can run again: a retry of the same upload reuses its keys, and a failure leaves nothing to clean up
 * (§10.6).
 */

/** The `clientProfileKey` of the web's one local save */
export const WEB_LOCAL_PROFILE_KEY = 'web-local'
export const CLOUD_BACKUP_STORAGE_KEY = `${RATING_ENTRIES_STORAGE_KEY}.pre-cloud-backup`
export const CLOUD_BACKUP_TTL_MS = 30 * 24 * 60 * 60 * 1000
/** A random ID of this browser, for the migration's idempotency key; never sent anywhere else */
export const DEVICE_ID_STORAGE_KEY = 'dxr-device-id'

export type MigrationMode = 'fresh' | 'merge' | 'cloud-only' | 'replace'

/** The routes the migration uses; the private API client, or a fake in tests and the demo */
export interface CloudMigrationApi {
  listSaves(): Promise<readonly SaveDTO[]>
  createSave(input: { name: string; region: SaveDTO['region']; clientProfileKey: string }): Promise<SaveDTO>
  clientImport(input: {
    id: string
    idempotencyKey: string
    source: 'legacy-local'
    trigger: 'migration'
    rawPayloadSha256: string | null
    chunkIndex: number
    chunkCount: number
    records: ImportRecord[]
  }): Promise<ImportResultDTO>
  replace(input: {
    id: string
    ifRevision: number
    idempotencyKey: string
    source: 'legacy-local'
    records: ImportRecord[]
  }): Promise<ImportResultDTO>
  getImportJob(jobId: string): Promise<ImportJobDTO>
}

// --- This device ---

/** This browser's random ID, created on first use (the migration's idempotency key needs one per device) */
export function getDeviceId(storage: Storage | null): string {
  try {
    const stored = storage?.getItem(DEVICE_ID_STORAGE_KEY)
    if (stored && /^[\w-]{8,64}$/.test(stored)) return stored
  } catch {
    // A refused storage: a fresh ID for this page
  }
  const id = randomId()
  try {
    storage?.setItem(DEVICE_ID_STORAGE_KEY, id)
  } catch {
    // Retries on this page still reuse it through the caller
  }
  return id
}

function randomId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** The upload attempt this browser is on (its content tag and nonce), so a retry resumes it (§10.6) */
export const MIGRATION_ATTEMPT_STORAGE_KEY = 'dxr-cloud-migration-attempt'

/**
 * The key of the migration upload: `migrate-<deviceId>-web-local-<tag>`, where the tag hashes the target save's ID
 * and every record sent. A retry of the same upload reuses it (and resumes its chunks); a migration into another
 * save (the first one was deleted) or with other records is a new import. `nonce`: a fresh start of the same
 * upload after its earlier job ended without finishing (abandoned after an interruption).
 */
export const migrationImportKey = (deviceId: string, tag: string, nonce: string | null = null) =>
  `migrate-${deviceId}-${WEB_LOCAL_PROFILE_KEY}-${tag}${nonce ? `-${nonce}` : ''}`

/**
 * The key of a "replace the cloud save" from this device, of that save (`saveTag`, a hash of its ID) at the revision
 * the user confirmed: a retry of the same confirmation reuses it; a confirmation over a newer revision, or over
 * another save, is a new request
 */
export const migrationReplaceKey = (deviceId: string, saveTag: string, ifRevision: number) =>
  `migrate-replace-${deviceId}-${WEB_LOCAL_PROFILE_KEY}-${saveTag}-r${ifRevision}`

/** 16 hex characters identifying `text` in a key: SHA-256 where available, else two FNV-1a hashes */
export async function migrationKeyTag(text: string): Promise<string> {
  const sha = await sha256Hex(text)
  if (sha) return sha.slice(0, 16)
  let a = 0x811c9dc5
  let b = 0x01000193
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index)
    a = Math.imul(a ^ code, 0x01000193) >>> 0
    b = Math.imul(b ^ code, 0x811c9dc5) >>> 0
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')
}

interface MigrationAttempt {
  tag: string
  nonce: string | null
}

/** The nonce of the stored attempt with this tag; another tag starts a new attempt (without a nonce) */
function resumeAttempt(storage: Storage | null, tag: string): MigrationAttempt {
  try {
    const parsed = JSON.parse(storage?.getItem(MIGRATION_ATTEMPT_STORAGE_KEY) ?? 'null') as Partial<MigrationAttempt>
    if (
      parsed?.tag === tag &&
      (parsed.nonce === null || (typeof parsed.nonce === 'string' && /^\w{1,16}$/.test(parsed.nonce)))
    ) {
      return { tag, nonce: parsed.nonce }
    }
  } catch {
    // Unreadable: a new attempt
  }
  const attempt = { tag, nonce: null }
  saveAttempt(storage, attempt)
  return attempt
}

function saveAttempt(storage: Storage | null, attempt: MigrationAttempt) {
  try {
    storage?.setItem(MIGRATION_ATTEMPT_STORAGE_KEY, JSON.stringify(attempt))
  } catch {
    // A refused storage: this page still uses it
  }
}

const newNonce = () => randomId().replace(/-/g, '').slice(0, 8)

// --- The local backup ---

interface CloudBackup {
  /** Device clock, ISO 8601 */
  backedUpAt: string
  /** The value of `rating-calculator-entries` as it was, verbatim */
  value: string
}

function readCloudBackup(storage: Storage): CloudBackup | null {
  try {
    const stored = storage.getItem(CLOUD_BACKUP_STORAGE_KEY)
    if (!stored) return null
    const parsed = JSON.parse(stored) as Partial<CloudBackup>
    if (typeof parsed.backedUpAt !== 'string' || typeof parsed.value !== 'string') return null
    return { backedUpAt: parsed.backedUpAt, value: parsed.value }
  } catch {
    return null
  }
}

const isExpired = (backup: CloudBackup, now: number) => {
  const time = Date.parse(backup.backedUpAt)
  return !Number.isFinite(time) || now - time >= CLOUD_BACKUP_TTL_MS
}

/**
 * Copies the local save to {@link CLOUD_BACKUP_STORAGE_KEY} with the time, once: a retry keeps the first copy, as
 * `backUpBeforeMigration` does, until it expires. An empty local save needs none. Never throws (a full storage must
 * not block the migration; the local save itself is never touched).
 */
export function backUpLocalSaveBeforeCloud(storage: Storage | null, now: number = Date.now()): boolean {
  if (!storage) return false
  try {
    const value = storage.getItem(RATING_ENTRIES_STORAGE_KEY)
    if (value === null) return false
    const existing = readCloudBackup(storage)
    if (existing && !isExpired(existing, now)) return true
    const backup: CloudBackup = {
      backedUpAt: new Date(now).toISOString(),
      value,
    }
    storage.setItem(CLOUD_BACKUP_STORAGE_KEY, JSON.stringify(backup))
    return true
  } catch {
    return false
  }
}

/** Removes the backup once it is 30 days old (or unreadable); run on every page load */
export function pruneExpiredCloudBackup(storage: Storage | null, now: number = Date.now()) {
  if (!storage) return
  try {
    if (storage.getItem(CLOUD_BACKUP_STORAGE_KEY) === null) return
    const backup = readCloudBackup(storage)
    if (!backup || isExpired(backup, now)) storage.removeItem(CLOUD_BACKUP_STORAGE_KEY)
  } catch {
    // Nothing to prune
  }
}

// --- Matching ---

/**
 * The cloud save the local save belongs to (§10.2): the one made from the web's local save (`clientProfileKey`),
 * else one of the same region (the most recently updated). `null`: none, the migration creates one.
 */
export function findMigrationTarget(saves: readonly SaveDTO[], region: Region): SaveDTO | null {
  const byKey = saves.find((save) => save.clientProfileKey === WEB_LOCAL_PROFILE_KEY)
  if (byKey) return byKey
  const sameRegion = saves
    .filter((save) => save.region === region)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
  return sameRegion[0] ?? null
}

// --- Running it ---

/** The cloud save changed after the user looked at it: `/replace` answered 412 with its current revision */
export class MigrationConflictError extends Error {
  constructor(readonly revision: number | null) {
    super('The cloud save changed since it was loaded')
    this.name = 'MigrationConflictError'
  }
}

/** `POST /saves` answered 409: the user has as many saves as allowed */
export class SaveLimitError extends Error {
  constructor() {
    super('The cloud save limit is reached')
    this.name = 'SaveLimitError'
  }
}

export interface MigrationOptions {
  api: CloudMigrationApi
  /** The local save's entries */
  entries: readonly PlayEntry[]
  mode: MigrationMode
  /** `fresh`: the new save's region (AppContext) and name (localized) */
  region: Region
  name: string
  /** `merge`, `cloud-only`, `replace`: the existing save */
  target?: SaveDTO | null
  deviceId: string
  storage: Storage | null
  now?: () => number
  /** The first wait before a request is sent again; doubles each time, 1 s by default */
  retryDelayMs?: number
  /** How often a running job is polled, 2 s by default */
  pollIntervalMs?: number
}

export interface MigrationOutcome {
  /** The save to make active */
  saveId: string
  /** Records sent (0 for `cloud-only`) */
  uploaded: number
  /** Entries left out (no public sheet ID or no valid achievement) */
  skipped: number
  job: ImportJobDTO | null
}

const ATTEMPTS = 3
/** How long a running import of the save is waited for */
const JOB_WAIT_MS = 16 * 60_000

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const field = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null && key in value ? (value as Record<string, unknown>)[key] : undefined

const isSaveLimit = (error: unknown) =>
  (field(error, 'status') === 409 || field(error, 'code') === 'CONFLICT') &&
  field(field(error, 'data'), 'reason') === 'SAVE_LIMIT'

const isPreconditionFailed = (error: unknown) =>
  field(error, 'status') === 412 || field(error, 'code') === 'PRECONDITION_FAILED'

/**
 * Runs the migration the user chose. Throws {@link NothingToImportError} before anything is sent when no entry can
 * be uploaded, {@link SaveLimitError}, {@link MigrationConflictError} (replace only), or the request's error.
 */
export async function runCloudMigration(options: MigrationOptions): Promise<MigrationOutcome> {
  const { api, mode, storage } = options
  const now = options.now ?? Date.now
  const retryDelayMs = options.retryDelayMs ?? 1_000

  const withRetries = async <T>(request: () => Promise<T>): Promise<T> => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await request()
      } catch (error) {
        const retry = isRetryableImportError(error)
        if (!retry.retry || attempt >= ATTEMPTS) throw error
        await delay(retry.afterMs ?? retryDelayMs * 2 ** (attempt - 1))
      }
    }
  }

  const waitForJob = async (jobId: string): Promise<ImportJobDTO> => {
    const deadline = now() + JOB_WAIT_MS
    for (;;) {
      const job = await withRetries(() => api.getImportJob(jobId))
      if (job.status !== 'running') return job
      if (now() > deadline) throw new ServerImportFailedError('abandoned', job)
      await delay(options.pollIntervalMs ?? 2_000)
    }
  }

  // Before anything else: whatever happens next, the local save as it was is kept for 30 days
  backUpLocalSaveBeforeCloud(storage, now())

  if (mode === 'cloud-only') {
    if (!options.target) throw new Error('No cloud save to use')
    return { saveId: options.target.id, uploaded: 0, skipped: 0, job: null }
  }

  const { records, skipped } = entriesToImportRecords(options.entries as PlayEntry[], {
    source: 'legacy-local',
    claimedSource: null,
  })
  if (records.length === 0) throw new NothingToImportError(skipped)

  if (mode === 'replace') {
    const target = options.target
    if (!target) throw new Error('No cloud save to replace')
    const saveTag = await migrationKeyTag(target.id)
    try {
      const result = await withRetries(() =>
        api.replace({
          id: target.id,
          ifRevision: target.revision,
          idempotencyKey: migrationReplaceKey(options.deviceId, saveTag, target.revision),
          source: 'legacy-local',
          records,
        }),
      )
      return {
        saveId: target.id,
        uploaded: records.length,
        skipped,
        job: result.job,
      }
    } catch (error) {
      if (isPreconditionFailed(error)) {
        const revision = Number(field(field(error, 'data'), 'revision'))
        throw new MigrationConflictError(Number.isInteger(revision) ? revision : null)
      }
      throw error
    }
  }

  let saveId: string
  if (mode === 'merge') {
    if (!options.target) throw new Error('No cloud save to merge into')
    saveId = options.target.id
  } else {
    try {
      // Idempotent: a retry, or another tab doing the same, gets the save the first request made
      const save = await withRetries(() =>
        api.createSave({
          name: options.name,
          region: options.region,
          clientProfileKey: WEB_LOCAL_PROFILE_KEY,
        }),
      )
      saveId = save.id
    } catch (error) {
      if (isSaveLimit(error)) throw new SaveLimitError()
      throw error
    }
  }

  const chunks = chunkImportRecords(records)
  const hashes = await Promise.all(chunks.map((chunk) => sha256Hex(canonicalImportBody(chunk))))
  const attempt = resumeAttempt(storage, await migrationKeyTag(`${saveId}\n${canonicalImportBody(records)}`))

  /** Sends every chunk under the attempt's key; stops early when the key's job already ended (a replay) */
  const upload = async (): Promise<ImportJobDTO> => {
    const idempotencyKey = migrationImportKey(options.deviceId, attempt.tag, attempt.nonce)
    let job: ImportJobDTO | null = null
    for (const [chunkIndex, chunk] of chunks.entries()) {
      for (let tries = 1; ; tries++) {
        try {
          const result = await withRetries(() =>
            api.clientImport({
              id: saveId,
              idempotencyKey,
              source: 'legacy-local',
              trigger: 'migration',
              rawPayloadSha256: hashes[chunkIndex] ?? null,
              chunkIndex,
              chunkCount: chunks.length,
              records: chunk,
            }),
          )
          job = result.job
          break
        } catch (error) {
          // Another import of the save is running (another tab, another device): wait for it, then send this chunk
          const running = importInProgressJobId(error)
          if (!running || tries >= ATTEMPTS) throw error
          await waitForJob(running)
        }
      }
      if (job.status !== 'running') break
    }
    if (job!.status === 'running') job = await waitForJob(job!.id)
    return job!
  }

  let job = await upload()
  if (job.status === 'failed') {
    // The key's job ended unfinished (an interrupted upload abandoned by the server): start this upload over under
    // a new key, once; merging keeps the best, so records the old job applied are harmless to send again
    attempt.nonce = newNonce()
    saveAttempt(storage, attempt)
    job = await upload()
  }
  if (job.status === 'failed') throw new ServerImportFailedError(job.errorCode ?? 'failed', job)
  return { saveId, uploaded: records.length, skipped, job }
}

/** A short code for analytics: never a message, an ID or a value */
export function migrationErrorCode(error: unknown): string {
  if (error instanceof MigrationConflictError) return 'conflict'
  if (error instanceof SaveLimitError) return 'save_limit'
  if (error instanceof NothingToImportError) return 'nothing_to_import'
  if (error instanceof ServerImportFailedError) return error.code === 'abandoned' ? 'abandoned' : 'job_failed'
  if (error instanceof TypeError) return 'network'
  const status = field(error, 'status')
  if (typeof status === 'number') return `http_${status}`
  const code = field(error, 'code')
  return typeof code === 'string' && /^[A-Z_]{1,40}$/.test(code) ? code.toLowerCase() : 'unknown'
}