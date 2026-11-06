import { randomUUID } from 'node:crypto'
import type { ImportSource, ImportTrigger } from '@gekichumai/maimai-domain'
import { Effect } from 'effect'
import pg from 'pg'
import { Database } from '../db/index'
import { appRuntime } from '../runtime'
import { completeImportJob, type MergeRecord } from '../services/cloud-save/merge'
import { startImportJob } from '../services/cloud-save/jobs'
import { authenticatedFetch, extractSessionCookie, getBaseUrl, signIn, signUp } from './setup'

const SHEET_ALPHABET = '23456789abcdefghjkmnpqrstvwxyz'

/** A valid public sheet ID (`dsht_` + 10 characters of the public alphabet) for `n` */
export function sheetId(n: number): string {
  let value = n
  let id = ''
  for (let i = 0; i < 10; i++) {
    id = SHEET_ALPHABET[value % 30] + id
    value = Math.floor(value / 30)
  }
  return `dsht_${id}`
}

/** A UUIDv7 (the shape of a mutation ID) */
export function uuidv7(): string {
  const random = randomUUID().replace(/-/g, '')
  const time = Date.now().toString(16).padStart(12, '0')
  const hex = `${time}7${random.slice(13, 16)}${((parseInt(random[16]!, 16) & 0x3) | 0x8).toString(16)}${random.slice(17, 32)}`
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

export const runDatabase = <A, E>(evaluate: (database: typeof Database.Service) => Effect.Effect<A, E>) =>
  appRuntime.runPromise(Effect.flatMap(Database, evaluate))

export const testPool = () => new pg.Pool({ connectionString: process.env.DATABASE_URL })

/** Signs up and in; returns the session cookie and the user ID */
export async function session(pool: pg.Pool, email: string, { cloudSave = true } = {}) {
  await signUp(email, 'password123', email.split('@')[0]!)
  const cookie = extractSessionCookie(await signIn(email, 'password123'))
  const { rows } = await pool.query<{ id: string }>('SELECT id FROM "user" WHERE email = $1', [email.toLowerCase()])
  const userId = rows[0]!.id
  if (cloudSave) {
    await pool.query(
      `INSERT INTO feature_flag_overrides (flag, user_id, enabled, source) VALUES ('cloud_save', $1, true, 'admin')`,
      [userId],
    )
  }
  return { cookie, userId }
}

export interface ApiResponse<T = any> {
  status: number
  body: T
  headers: Headers
}

/** Calls `/api/v1<path>` with the session cookie and parses the JSON answer */
export async function api<T = any>(
  cookie: string | null,
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResponse<T>> {
  const init: RequestInit = { method }
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body)
    init.headers = { 'Content-Type': 'application/json' }
  }
  const url = `${getBaseUrl()}/api/v1${path}`
  const response = cookie ? await authenticatedFetch(url, cookie, init) : await fetch(url, init)
  const text = await response.text()
  let parsed: unknown = text
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    // not JSON
  }
  return { status: response.status, body: parsed as T, headers: response.headers }
}

export const setMutation = (
  sheet: string,
  achievement: number,
  options: { basedOnRevision?: number; comboFlag?: string | null; syncFlag?: string | null; mutationId?: string } = {},
) => ({
  mutationId: options.mutationId ?? uuidv7(),
  op: 'set',
  sheetId: sheet,
  value: { achievement, comboFlag: options.comboFlag ?? null, syncFlag: options.syncFlag ?? null },
  entryMethod: 'typed',
  ...(options.basedOnRevision === undefined ? {} : { basedOnRevision: options.basedOnRevision }),
})

export const deleteMutation = (sheet: string, basedOnRevision?: number) => ({
  mutationId: uuidv7(),
  op: 'delete' as const,
  sheetId: sheet,
  ...(basedOnRevision === undefined ? {} : { basedOnRevision }),
})

/**
 * Runs an import through the shared merge module, as a server job would after fetching: creates the job (with a
 * fetch time and payload hash for server sources) and completes it.
 */
export async function importRecords(
  userId: string,
  saveId: string,
  source: ImportSource,
  records: MergeRecord[],
  options: { trigger?: ImportTrigger; sourceAccountId?: string | null; sha?: string; idempotencyKey?: string } = {},
) {
  return runDatabase((database) =>
    Effect.gen(function* () {
      const server = ['maimai-net-jp', 'maimai-net-intl', 'lxns', 'diving-fish'].includes(source)
      const { job } = yield* startImportJob(database, {
        userId,
        saveId,
        source,
        trigger: options.trigger ?? 'user',
        idempotencyKey: options.idempotencyKey ?? `test-${randomUUID()}`,
        sourceAccountId: options.sourceAccountId ?? null,
        sourceAccountKind: options.sourceAccountId ? (server ? 'lxns_friend_code' : 'claimed') : null,
        fetchedAt: server ? new Date() : null,
        rawPayloadSha256: options.sha ?? (server ? 'a'.repeat(64) : null),
      })
      return yield* completeImportJob(database, { userId, saveId, jobId: job.id, records })
    }),
  )
}