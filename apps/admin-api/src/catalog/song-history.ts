import { sql } from 'drizzle-orm'
import { Effect } from 'effect'
import { AdminDatabase } from '../db'
import { diffCatalogs, type Json, type SongDiff } from './diff'

/**
 * One song across the last publications of a channel (gekichumai/meta#50 Phase 3, slice 4): what each publication
 * changed in it. Built from the immutable snapshots, no new storage. This is the history **as the publications
 * recorded it**, which is not the same thing as a curated game-version history (assembly-line#44).
 *
 * Postgres pulls only this song out of each snapshot (about 0.1 s per 4 MB snapshot), so the API never loads whole
 * catalogs for it. A snapshot never changes, so a song extracted from one is cached by (body sha256, song ID).
 */
const CACHE_SIZE = 512
const cache = new Map<string, Json | null>()
const remember = (key: string, song: Json | null) => {
  cache.delete(key)
  cache.set(key, song)
  while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!)
}

/** Test-only */
export const clearSongHistoryCache = () => cache.clear()

/** Test-only: add unrelated entries until the cache has `free` places left */
export const fillSongHistoryCache = (free: number) => {
  for (let i = 0; cache.size < CACHE_SIZE - free; i++) remember(`filler-${i}`, null)
}

export interface HistoryEntry {
  revision: number
  publishedAt: string
  bodySha256: string
  /** Whether the song is in this publication */
  present: boolean
  /** What this publication changed against the older one before it in the window; null for the oldest one shown */
  change: SongDiff | null
}

export const songHistory = (input: { channel: string; songId: string; limit: number }) =>
  Effect.gen(function* () {
    const db = yield* AdminDatabase
    const receipts = (yield* db.use('list publications for history', (d) =>
      d.execute(sql`
        SELECT receipt.revision::text AS revision, receipt.published_at, snapshot.body_sha256
        FROM dxdata.catalog_publication_receipts AS receipt
        INNER JOIN dxdata.catalog_snapshots AS snapshot ON snapshot.catalog_run_id = receipt.catalog_run_id
        WHERE receipt.channel = ${input.channel}
        ORDER BY receipt.revision DESC
        LIMIT ${input.limit}
      `),
    )).rows.map((row) => ({
      revision: Number(row.revision),
      publishedAt: (row.published_at instanceof Date
        ? row.published_at
        : new Date(String(row.published_at))
      ).toISOString(),
      bodySha256: String(row.body_sha256),
    }))

    const key = (sha: string) => `${sha}:${input.songId}`
    // This request's songs, held apart from the shared cache: storing the misses may evict a hit, which must not
    // read as the song being absent from that publication
    const songs = new Map<string, Json | null>()
    for (const sha of new Set(receipts.map((r) => r.bodySha256)))
      if (cache.has(key(sha))) songs.set(sha, cache.get(key(sha))!)
    const missing = [...new Set(receipts.map((r) => r.bodySha256))].filter((sha) => !songs.has(sha))
    if (missing.length > 0) {
      const extracted = yield* db.use('extract song from snapshots', (d) =>
        d.execute(sql`
          SELECT snapshot.body_sha256,
            (
              SELECT song FROM jsonb_array_elements(snapshot.body_text::jsonb -> 'songs') AS song
              WHERE song ->> 'id' = ${input.songId} OR song ->> 'songId' = ${input.songId}
              LIMIT 1
            ) AS song
          FROM dxdata.catalog_snapshots AS snapshot
          WHERE snapshot.body_sha256 IN (${sql.join(
            missing.map((sha) => sql`${sha}`),
            sql`, `,
          )})
        `),
      )
      for (const row of extracted.rows) {
        const song = (row.song as Json | null) ?? null
        songs.set(String(row.body_sha256), song)
        remember(key(String(row.body_sha256)), song)
      }
    }

    const songAt = (sha: string) => songs.get(sha) ?? null
    const oldestFirst = [...receipts].reverse()
    const entries: HistoryEntry[] = oldestFirst.map((receipt, index) => {
      const song = songAt(receipt.bodySha256)
      if (index === 0) return { ...receipt, present: song !== null, change: null }
      const before = songAt(oldestFirst[index - 1]!.bodySha256)
      const diff = diffCatalogs({ songs: before === null ? [] : [before] }, { songs: song === null ? [] : [song] })
      return { ...receipt, present: song !== null, change: diff.songs[0] ?? null }
    })
    const current = songAt(receipts[0]?.bodySha256 ?? '') as Record<string, Json> | null
    return {
      channel: input.channel,
      songId: input.songId,
      title: current && typeof current.title === 'string' ? current.title : null,
      /** Newest first */
      entries: entries.reverse(),
    }
  })