import { ORPCError } from '@orpc/server'
import { sql } from 'drizzle-orm'
import { Effect } from 'effect'
import { AdminDatabase } from '../db'
import { type CatalogDiff, diffCatalogs, filterByPath, type Json } from './diff'

/**
 * The diff between two publications of a channel, computed on the fly from their immutable snapshots (meta#50 Phase 3
 * slice 2; no materialized diff table). A snapshot never changes, so a computed diff is kept, keyed by the two body
 * hashes, in a small in-memory LRU: about 9 MB of JSON per side is parsed once per pair, not once per page.
 */
const CACHE_SIZE = 8
const cache = new Map<string, CatalogDiff>()

const remember = (key: string, diff: CatalogDiff) => {
  cache.delete(key)
  cache.set(key, diff)
  while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!)
  return diff
}

interface Side {
  revision: number
  fingerprint: string
  publishedAt: string
  bodySha256: string
}

const sideOf = (row: Record<string, unknown>): Side => ({
  revision: Number(row.revision),
  fingerprint: String(row.fingerprint),
  publishedAt: (row.published_at instanceof Date ? row.published_at : new Date(String(row.published_at))).toISOString(),
  bodySha256: String(row.body_sha256),
})

const notFound = (message: string) => new ORPCError('NOT_FOUND', { message })

export const diffPublications = (input: {
  channel: string
  from?: number | undefined
  to?: number | undefined
  path?: string | undefined
  offset: number
  limit: number
}) =>
  Effect.gen(function* () {
    const db = yield* AdminDatabase
    const resolve = (revision: number | undefined, below?: number) =>
      db.use('resolve publication', (d) =>
        d.execute(sql`
          SELECT receipt.revision::text AS revision, receipt.publication_fingerprint_sha256 AS fingerprint,
            receipt.published_at, snapshot.body_sha256
          FROM dxdata.catalog_publication_receipts AS receipt
          INNER JOIN dxdata.catalog_snapshots AS snapshot ON snapshot.catalog_run_id = receipt.catalog_run_id
          WHERE receipt.channel = ${input.channel}
            AND (${revision ?? null}::bigint IS NULL OR receipt.revision = ${revision ?? null}::bigint)
            AND (${below ?? null}::bigint IS NULL OR receipt.revision < ${below ?? null}::bigint)
          ORDER BY receipt.revision DESC
          LIMIT 1
        `),
      )

    const toRow = (yield* resolve(input.to)).rows[0]
    if (!toRow)
      return yield* Effect.fail(
        notFound(input.to === undefined ? `No publications on ${input.channel}` : `No revision ${input.to}`),
      )
    const to = sideOf(toRow)
    const fromRow = (yield* resolve(input.from, input.from === undefined ? to.revision : undefined)).rows[0]
    if (!fromRow)
      return yield* Effect.fail(
        notFound(
          input.from === undefined ? `Revision ${to.revision} is the first publication` : `No revision ${input.from}`,
        ),
      )
    const from = sideOf(fromRow)

    const key = `${from.bodySha256}:${to.bodySha256}`
    const cached = cache.get(key)
    const diff = cached
      ? remember(key, cached)
      : yield* Effect.gen(function* () {
          const bodies = yield* db.use('read publication snapshots', (d) =>
            d.execute(sql`
              SELECT body_sha256, body_text FROM dxdata.catalog_snapshots
              WHERE body_sha256 IN (${from.bodySha256}, ${to.bodySha256})
            `),
          )
          const text = new Map(bodies.rows.map((row) => [String(row.body_sha256), String(row.body_text)]))
          const parse = (sha: string) => JSON.parse(text.get(sha) ?? '{}') as Record<string, Json>
          return remember(key, diffCatalogs(parse(from.bodySha256), parse(to.bodySha256)))
        })

    const songs = input.path ? filterByPath(diff.songs, input.path) : diff.songs
    const page = songs.slice(input.offset, input.offset + input.limit)
    return {
      channel: input.channel,
      from,
      to,
      summary: diff.summary,
      pathCounts: diff.pathCounts,
      lists: diff.lists,
      updateTime: diff.updateTime,
      path: input.path ?? null,
      songsTotal: songs.length,
      songs: page,
      nextOffset: input.offset + input.limit < songs.length ? input.offset + input.limit : null,
    }
  })

/** Test-only: forget computed diffs */
export const clearDiffCache = () => cache.clear()