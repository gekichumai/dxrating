import { ORPCError } from '@orpc/server'
import { sql } from 'drizzle-orm'
import { Effect } from 'effect'
import { AdminDatabase, type DatabaseError } from '../db'
import type { Json } from './diff'

/**
 * A song's published values and where they came from (gekichumai/meta#50 Phase 3, slice 3), read from what the
 * assembly line already stores for each publication: the snapshot body and its provenance manifest
 * (`catalog_publication_provenance_manifests`). No new storage.
 *
 * The manifest gives **rule-level** provenance: for each output path, the sources that can supply it and the
 * transforms applied, plus, for each song, which source supplied its catalog entry, enrichment, regions and internal
 * IDs. A rule source like `assembly.songs.*.catalog` names that per-song lineage, so it resolves to the actual source
 * of this song. Per-value candidates and winner reasons are not recorded (door D1 in the plan).
 */
type Obj = Record<string, Json>
const isObject = (value: unknown): value is Obj => typeof value === 'object' && value !== null && !Array.isArray(value)

export interface FieldRule {
  outputPath: string
  sources: string[]
  transforms: string[]
}

/** The producer's own matcher (assembly-line `rule_matches`): exact, or a `.*` prefix */
export const ruleMatches = (rule: string, path: string) =>
  rule.endsWith('.*') ? path === rule.slice(0, -2) || path.startsWith(`${rule.slice(0, -2)}.`) : rule === path

export interface FieldValue {
  /** Relative to the song or sheet: `noteCounts.tap` */
  path: string
  /** The producer's leaf path, which its rules match: `songs[].sheets[].noteCounts.tap` */
  outputPath: string
  value: Json
}

/**
 * Leaves in the producer's form: object keys joined with `.`, a list as `[]`. A list of plain values stays one value
 * (its rule path ends in `[]`); an empty object or list is a leaf of its own, as in the producer.
 */
export const leaves = (value: Obj, prefix: string, skip: readonly string[] = []): FieldValue[] => {
  const out: FieldValue[] = []
  const walk = (node: Json, path: string, outputPath: string) => {
    if (isObject(node) && Object.keys(node).length > 0) {
      for (const [key, child] of Object.entries(node))
        walk(child, path ? `${path}.${key}` : key, `${outputPath}.${key}`)
    } else if (Array.isArray(node) && node.some((item) => isObject(item) || Array.isArray(item))) {
      node.forEach((child, index) => walk(child, `${path}[${index}]`, `${outputPath}[]`))
    } else {
      out.push({
        path,
        outputPath: Array.isArray(node) && node.length > 0 ? `${outputPath}[]` : outputPath,
        value: node,
      })
    }
  }
  for (const [key, child] of Object.entries(value)) if (!skip.includes(key)) walk(child, key, `${prefix}.${key}`)
  return out
}

export interface ResolvedSource {
  /** As the rule names it */
  source: string
  /** For a per-song lineage reference (`assembly.songs.*.regions`), the source(s) this song's lineage names; else null */
  resolved: string[] | null
}

export const resolveSources = (sources: readonly string[], lineage: Obj | null): ResolvedSource[] =>
  sources.map((source) => {
    const key = /^assembly\.songs\.\*\.(.+)$/.exec(source)?.[1]
    if (key === undefined) return { source, resolved: null }
    const named = lineage?.[key]
    return {
      source,
      resolved: Array.isArray(named) ? named.map(String) : named == null ? [] : [String(named)],
    }
  })

/**
 * The manifest covers the legacy dxdata.json the assembly line also writes, while a publication's snapshot is the
 * song-catalog v1 document. The same values sit at different paths there; this maps a published leaf path to the legacy
 * path whose rule covers it.
 */
export const legacyPath = (outputPath: string) => {
  if (outputPath === 'songs[].id') return 'songs[].songId'
  if (/^songs\[\]\.sheets\[\]\.serverIds(\[\])?$/.test(outputPath)) return 'songs[].sheets[].regions.jp'
  if (outputPath.startsWith('songs[].sheets[].serverOverrides'))
    return outputPath.replace('songs[].sheets[].serverOverrides', 'songs[].sheets[].regionOverrides')
  // An empty noteCounts (no counts known) is one leaf; its counts share one rule
  if (outputPath === 'songs[].sheets[].noteCounts') return 'songs[].sheets[].noteCounts.total'
  return outputPath
}

/** Published fields the legacy output has no rule for, and what they are */
const NOTES: Record<string, string> = {
  'songs[].sheets[].id': 'Public sheet ID, kept stable by the assembly line’s catalog',
  'songs[].version': 'Song-level version of the published catalog; the manifest’s rules cover only sheet versions',
  'songs[].readingSource': 'Names the source of `reading`',
}

export const annotate = (
  fields: FieldValue[],
  rules: readonly FieldRule[] | null,
  lineage: Obj | null,
  owner: Obj = {},
) =>
  fields.map((field) => {
    const path = legacyPath(field.outputPath)
    const rule = rules?.find((candidate) => ruleMatches(candidate.outputPath, path))
    // `reading` names its own source
    const self =
      field.outputPath === 'songs[].reading' && typeof owner.readingSource === 'string'
        ? {
            outputPath: 'songs[].readingSource',
            sources: [{ source: 'readingSource', resolved: [owner.readingSource] }],
            transforms: [],
          }
        : null
    return {
      ...field,
      rule: rule
        ? { outputPath: rule.outputPath, sources: resolveSources(rule.sources, lineage), transforms: rule.transforms }
        : self,
      note:
        field.outputPath === 'songs[].id'
          ? 'Public song ID, kept stable by the assembly line’s catalog'
          : (NOTES[field.outputPath] ?? null),
    }
  })

/** Parsed snapshot bodies by sha256, newest use last; they never change. Two cover "current" plus one other. */
const SNAPSHOT_CACHE = 2
const snapshots = new Map<string, Map<string, Obj>>()

const songsBySha = (sha: string, load: () => Effect.Effect<string | undefined, DatabaseError>) =>
  Effect.gen(function* () {
    const cached = snapshots.get(sha)
    if (cached) {
      snapshots.delete(sha)
      snapshots.set(sha, cached)
      return cached
    }
    const text = yield* load()
    const body = JSON.parse(text ?? '{}') as Obj
    const songs = new Map<string, Obj>()
    for (const song of Array.isArray(body.songs) ? body.songs : [])
      if (isObject(song)) songs.set(String(song.id ?? song.songId), song)
    snapshots.set(sha, songs)
    while (snapshots.size > SNAPSHOT_CACHE) snapshots.delete(snapshots.keys().next().value!)
    return songs
  })

/** Test-only */
export const clearSnapshotCache = () => snapshots.clear()

const publicationOf = (channel: string, revision: number | undefined) =>
  Effect.gen(function* () {
    const db = yield* AdminDatabase
    const rows = yield* db.use('resolve publication', (d) =>
      d.execute(sql`
        SELECT receipt.revision::text AS revision, receipt.publication_fingerprint_sha256 AS fingerprint,
          receipt.published_at, snapshot.body_sha256
        FROM dxdata.catalog_publication_receipts AS receipt
        INNER JOIN dxdata.catalog_snapshots AS snapshot ON snapshot.catalog_run_id = receipt.catalog_run_id
        WHERE receipt.channel = ${channel}
          AND (${revision ?? null}::bigint IS NULL OR receipt.revision = ${revision ?? null}::bigint)
        ORDER BY receipt.revision DESC
        LIMIT 1
      `),
    )
    const row = rows.rows[0]
    if (!row)
      return yield* Effect.fail(
        new ORPCError('NOT_FOUND', {
          message: revision === undefined ? `No publications on ${channel}` : `No revision ${revision}`,
        }),
      )
    const publication = {
      revision: Number(row.revision),
      fingerprint: String(row.fingerprint),
      publishedAt: (row.published_at instanceof Date
        ? row.published_at
        : new Date(String(row.published_at))
      ).toISOString(),
      bodySha256: String(row.body_sha256),
    }
    const songs = yield* songsBySha(publication.bodySha256, () =>
      db
        .use('read publication snapshot', (d) =>
          d.execute(
            sql`SELECT body_text FROM dxdata.catalog_snapshots WHERE body_sha256 = ${publication.bodySha256} LIMIT 1`,
          ),
        )
        .pipe(Effect.map((result) => result.rows[0]?.body_text as string | undefined)),
    )
    return { publication, songs }
  })

const normalize = (text: string) => text.normalize('NFKC').toLowerCase()

export const searchSongs = (input: { channel: string; revision?: number | undefined; q: string; limit: number }) =>
  Effect.gen(function* () {
    const { publication, songs } = yield* publicationOf(input.channel, input.revision)
    const q = normalize(input.q.trim())
    const matches: { songId: string; title: string; artist: string; sheetCount: number }[] = []
    let total = 0
    for (const song of songs.values()) {
      const haystack = [
        song.id,
        song.songId,
        song.title,
        song.artist,
        song.reading,
        ...(Array.isArray(song.searchAcronyms) ? song.searchAcronyms : []),
      ]
      if (q && !haystack.some((value) => typeof value === 'string' && normalize(value).includes(q))) continue
      total++
      if (matches.length < input.limit)
        matches.push({
          songId: String(song.id ?? song.songId),
          title: String(song.title ?? song.songId),
          artist: String(song.artist ?? ''),
          sheetCount: Array.isArray(song.sheets) ? song.sheets.length : 0,
        })
    }
    return { channel: input.channel, publication, total, songs: matches }
  })

export const songProvenance = (input: { channel: string; revision?: number | undefined; songId: string }) =>
  Effect.gen(function* () {
    const { publication, songs } = yield* publicationOf(input.channel, input.revision)
    const song = songs.get(input.songId)
    if (!song)
      return yield* Effect.fail(
        new ORPCError('NOT_FOUND', { message: `No song ${input.songId} in revision ${publication.revision}` }),
      )

    const db = yield* AdminDatabase
    // The manifest's per-song lineage is keyed by the legacy song ID; the catalog maps a public ID to it
    const legacySongId =
      typeof song.id === 'string'
        ? (((yield* db.use('map public song ID', (d) =>
            d.execute(sql`SELECT legacy_song_id FROM dxdata.canonical_songs WHERE id = ${song.id as string}`),
          )).rows[0]?.legacy_song_id as string | null | undefined) ?? null)
        : String(song.songId)
    const manifestRows = yield* db.use('read provenance manifest', (d) =>
      d.execute(sql`
        SELECT manifest.schema_version, manifest.generated_at,
          manifest.manifest -> 'fieldRules' AS field_rules,
          manifest.manifest -> 'coverage' AS coverage,
          manifest.manifest #> ${'{sources,assembly,songs}'}::text[] -> ${legacySongId} AS lineage,
          manifest.manifest #> ${'{sources,assembly,sources}'}::text[] AS assembly_sources,
          manifest.manifest #> ${'{sources,runtime}'}::text[] AS runtime_sources
        FROM dxdata.catalog_publication_provenance_manifests AS manifest
        WHERE manifest.channel = ${input.channel}
          AND manifest.publication_fingerprint_sha256 = ${publication.fingerprint}
      `),
    )
    const row = manifestRows.rows[0]
    const rules = Array.isArray(row?.field_rules)
      ? (row.field_rules as Obj[]).map((rule) => ({
          outputPath: String(rule.outputPath),
          sources: Array.isArray(rule.sources) ? rule.sources.map(String) : [],
          transforms: Array.isArray(rule.transforms) ? rule.transforms.map(String) : [],
        }))
      : null
    const lineage = isObject(row?.lineage) ? row.lineage : null

    return {
      channel: input.channel,
      publication,
      song: {
        songId: String(song.id ?? song.songId),
        legacySongId,
        title: String(song.title ?? song.songId),
        artist: String(song.artist ?? ''),
      },
      manifest: row
        ? {
            schemaVersion: Number(row.schema_version),
            generatedAt: (row.generated_at instanceof Date
              ? row.generated_at
              : new Date(String(row.generated_at))
            ).toISOString(),
            coverage: (isObject(row.coverage) ? row.coverage : null) as Json,
            /** Input artifacts of this build: name → { path, sha256, recordCount } */
            sources: (isObject(row.assembly_sources) ? row.assembly_sources : null) as Json,
            runtime: (row.runtime_sources ?? null) as Json,
          }
        : null,
      lineage: lineage as Json,
      fields: annotate(leaves(song, 'songs[]', ['sheets']), rules, lineage, song),
      sheets: (Array.isArray(song.sheets) ? song.sheets : []).filter(isObject).map((sheet) => ({
        id: String(sheet.id ?? `${String(sheet.type)}:${String(sheet.difficulty)}`),
        type: String(sheet.type),
        difficulty: String(sheet.difficulty),
        fields: annotate(leaves(sheet, 'songs[].sheets[]'), rules, lineage),
      })),
    }
  })