import { getTableName, is, type Table } from 'drizzle-orm'
import type { EffectCacheShape } from 'drizzle-orm/cache/core/cache-effect'
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core'
import { Clock, Context, Effect } from 'effect'
import { Sentry } from '../lib/functions/sentry'
import * as authSchema from './auth-schema'
import * as schema from './schema'

const DEFAULT_TTL_MS = 30 * 60 * 1000
const CHANGES_ROWS = new Set(['cascade', 'set null', 'set default'])

const tablesChangedBy = (() => {
  const dependents = new Map<string, string[]>()
  for (const table of [...Object.values(schema), ...Object.values(authSchema)]) {
    if (!is(table, PgTable)) continue
    const { name, foreignKeys } = getTableConfig(table)
    for (const foreignKey of foreignKeys) {
      if (!CHANGES_ROWS.has(foreignKey.onDelete ?? '') && !CHANGES_ROWS.has(foreignKey.onUpdate ?? '')) continue
      const referenced = getTableConfig(foreignKey.reference().foreignTable).name
      dependents.set(referenced, [...(dependents.get(referenced) ?? []), name])
    }
  }
  return (written: Iterable<string>) => {
    const changed = new Set(written)
    for (const table of changed) for (const dependent of dependents.get(table) ?? []) changed.add(dependent)
    return changed
  }
})()

/** The tables written inside the current transaction, invalidated once it commits */
export const TransactionWrites = Context.Reference<Set<string> | undefined>('dxrating/TransactionWrites', {
  defaultValue: () => undefined,
})

/**
 * The cache of `.$withCache()` selects. Drizzle keys each entry by its SQL and parameters and records the tables it
 * reads; every insert, update or delete through Drizzle drops the entries that read the table it wrote, or a table
 * whose rows that write changes through a foreign key action.
 */
export const makeQueryCache = () => {
  const entries = new Map<string, { rows: unknown; tables: readonly string[]; expiresAt: number }>()

  const invalidate = (written: Iterable<string>) => {
    const changed = tablesChangedBy(written)
    for (const [key, entry] of entries) if (entry.tables.some((table) => changed.has(table))) entries.delete(key)
  }

  const shape: EffectCacheShape = {
    strategy: () => 'explicit',
    get: (key, tables) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis
        const entry = entries.get(key)
        const hit = entry !== undefined && entry.expiresAt > now
        if (entry && !hit) entries.delete(key)
        Sentry.metrics.count(hit ? 'cache.hit' : 'cache.miss', 1, { attributes: { key: tables.join(',') } })
        return hit ? (entry.rows as unknown[]) : undefined
      }),
    put: (key, rows, tables, isTag, config) =>
      isTag || tables.length === 0
        ? Effect.die(
            new Error('Use .$withCache() with no tag and no autoInvalidate: false, so writes can invalidate it'),
          )
        : Effect.gen(function* () {
            const ttlMs = config?.px ?? (config?.ex === undefined ? DEFAULT_TTL_MS : config.ex * 1000)
            entries.set(key, { rows, tables, expiresAt: (yield* Clock.currentTimeMillis) + ttlMs })
          }),
    onMutate: ({ tables }) =>
      Effect.gen(function* () {
        const names = [tables ?? []]
          .flat()
          .map((table: string | Table) => (typeof table === 'string' ? table : getTableName(table)))
        const pending = yield* TransactionWrites
        if (pending) for (const name of names) pending.add(name)
        else invalidate(names)
      }),
  }

  return { shape, invalidate }
}