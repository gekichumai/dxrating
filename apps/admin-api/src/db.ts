import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Context, Data, Effect, Layer } from 'effect'
import pg from 'pg'
import { AdminApiConfigService } from './config'

export class DatabaseError extends Data.TaggedError('DatabaseError')<{
  readonly operation: string
  readonly cause: unknown
}> {}

/** Anything shaped like a connection string, whatever the scheme, with its credentials */
const CONNECTION_STRING = /\b[a-z][a-z0-9+.-]*:\/\/[^\s'"]*@[^\s'"]*/gi

/** Removes connection strings and the configured password from a message */
export const redact = (text: string, secrets: readonly string[] = []) =>
  secrets
    .filter((secret) => secret.length >= 4)
    .reduce((out, secret) => out.split(secret).join('[redacted]'), text.replace(CONNECTION_STRING, '[redacted-url]'))

const field = (value: unknown, key: string) =>
  value && typeof value === 'object' && key in value ? (value as Record<string, unknown>)[key] : undefined

/**
 * The root cause of a database failure, safe to log: pg and Node network fields (`code`, `syscall`, `hostname`, …)
 * and a redacted message. Drizzle wraps the driver's error in one whose message holds the query and its parameters,
 * so the message comes from the innermost cause only.
 */
export const describeCause = (cause: unknown, secrets: readonly string[] = []) => {
  let root = cause
  for (let depth = 0; depth < 5 && field(root, 'cause') !== undefined; depth++) root = field(root, 'cause')
  // AggregateError (e.g. ECONNREFUSED on both IPv4 and IPv6) carries its first failure, with the address, in `errors`
  const errors = field(root, 'errors')
  if (Array.isArray(errors) && errors.length > 0) root = errors[0]
  const pick = (key: string) => {
    const value = field(root, key)
    return typeof value === 'string' || typeof value === 'number' ? value : undefined
  }
  const message = root instanceof Error ? root.message : typeof root === 'string' ? root : undefined
  return {
    name: root instanceof Error ? root.name : typeof root,
    code: pick('code'),
    severity: pick('severity'),
    syscall: pick('syscall'),
    hostname: pick('hostname'),
    address: pick('address'),
    port: pick('port'),
    routine: pick('routine'),
    message: message === undefined ? undefined : redact(message, secrets),
  }
}

/** The password in a connection string, so a driver message that echoes it can be redacted */
export const passwordOf = (connectionString: string | undefined) => {
  if (!connectionString) return []
  try {
    const password = decodeURIComponent(new URL(connectionString).password)
    return password ? [password] : []
  } catch {
    return []
  }
}

/** One JSON line to stdout (Coolify's log view), never the connection string */
export const logDatabaseEvent = (event: 'db_error' | 'db_ping_ok', details: Record<string, unknown>) =>
  console.log(JSON.stringify({ level: event === 'db_error' ? 'error' : 'info', event, ...details }))

/** The admin API's own pool, as the restricted role `dxrating_admin`. The schema comes from apps/backend. */
export class AdminDatabase extends Context.Service<
  AdminDatabase,
  {
    readonly use: <A>(operation: string, run: (db: NodePgDatabase) => Promise<A>) => Effect.Effect<A, DatabaseError>
    /**
     * `select 1` on its own short-lived connection (never one of the pool's), bounded by a deadline so a stalled
     * server cannot hang the caller. Logs `db_ping_ok`, or `db_error` with operation `ping`.
     */
    readonly ping: Effect.Effect<void, DatabaseError>
  }
>()('dxrating-admin/Database') {}

export const adminDatabaseFromPool = (
  pool: pg.Pool,
  options: { readonly connectionString?: string; readonly pingTimeoutMs?: number } = {},
) => {
  const db = drizzle({ client: pool })
  const secrets = passwordOf(options.connectionString)
  const pingTimeoutMs = options.pingTimeoutMs ?? 5_000
  const use = <A>(operation: string, run: (db: NodePgDatabase) => Promise<A>) =>
    Effect.tryPromise({ try: () => run(db), catch: (cause) => new DatabaseError({ operation, cause }) }).pipe(
      Effect.tapError((error) =>
        Effect.sync(() =>
          logDatabaseEvent('db_error', { operation: error.operation, cause: describeCause(error.cause, secrets) }),
        ),
      ),
    )
  const ping = Effect.gen(function* () {
    const started = Date.now()
    yield* Effect.tryPromise({
      try: async () => {
        const client = new pg.Client({
          connectionString: options.connectionString,
          connectionTimeoutMillis: pingTimeoutMs,
          query_timeout: pingTimeoutMs,
        })
        // Swallows late socket errors from a connection we are abandoning
        client.on('error', () => undefined)
        try {
          await client.connect()
          await client.query('select 1')
        } finally {
          // Not awaited: ending a stalled connection must not hold the probe
          void client.end().catch(() => undefined)
        }
      },
      catch: (cause) => new DatabaseError({ operation: 'ping', cause }),
    }).pipe(
      Effect.timeoutOrElse({
        duration: pingTimeoutMs * 2,
        orElse: () =>
          Effect.fail(new DatabaseError({ operation: 'ping', cause: new Error(`no reply in ${pingTimeoutMs * 2}ms`) })),
      }),
      Effect.tapError((error) =>
        Effect.sync(() =>
          logDatabaseEvent('db_error', { operation: error.operation, cause: describeCause(error.cause, secrets) }),
        ),
      ),
    )
    logDatabaseEvent('db_ping_ok', { ms: Date.now() - started })
  })
  return Layer.succeed(AdminDatabase, { use, ping })
}

export const AdminDatabaseLive = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* AdminApiConfigService
    const pool = yield* Effect.acquireRelease(
      Effect.sync(() => {
        const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 4, connectionTimeoutMillis: 10_000 })
        // An idle client that loses its connection emits here; unhandled, it would crash the process
        pool.on('error', (cause) =>
          logDatabaseEvent('db_error', {
            operation: 'idle client',
            cause: describeCause(cause, passwordOf(config.DATABASE_URL)),
          }),
        )
        return pool
      }),
      (pool) => Effect.promise(() => pool.end()),
    )
    return adminDatabaseFromPool(pool, { connectionString: config.DATABASE_URL })
  }),
)