/**
 * The field-level difference between two published dxdata catalogs (gekichumai/meta#50 Phase 3, slice 2). Pure: it
 * takes two parsed catalog bodies. Published snapshots are song-catalog v1 documents (assembly-line
 * `contracts/song-catalog/v1`): songs and sheets carry stable public IDs (`dsng_…`, `dsht_…`), so they match by `id`.
 * The legacy dxdata.json shape has none, so there songs match by `songId` and sheets by `type` + `difficulty`. Every
 * other top-level list (versions, tags, aliases, …) is compared as a set of entries; `updatedAt` (`updateTime` in the
 * legacy shape) is reported apart, never as a change.
 *
 * Paths are relative to the song or sheet, e.g. `internalLevelValue`, `noteCounts.tap`, `regions.cn`. A list of
 * plain values (`searchAcronyms`) is one value; a list of objects is indexed (`foo[2].bar`).
 */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

export interface FieldChange {
  path: string
  /** `undefined` (omitted in JSON) when the field is absent on that side, which is not the same as `null` */
  before?: Json
  after?: Json
}

export interface SheetDiff {
  /** The sheet's public ID, or `type:difficulty` in the legacy shape */
  id: string
  type: string
  difficulty: string
  kind: 'added' | 'removed' | 'changed'
  /** Only for `changed` */
  fields: FieldChange[]
}

export interface SongDiff {
  /** The song's public ID (`dsng_…`), or `songId` in the legacy shape */
  songId: string
  title: string
  kind: 'added' | 'removed' | 'changed'
  /** Song-level fields; only for `changed` */
  fields: FieldChange[]
  sheets: SheetDiff[]
}

export interface ListDiff {
  key: string
  beforeCount: number
  afterCount: number
  added: Json[]
  removed: Json[]
}

export interface CatalogDiff {
  summary: {
    songsAdded: number
    songsRemoved: number
    songsChanged: number
    sheetsAdded: number
    sheetsRemoved: number
    sheetsChanged: number
    fieldChanges: number
  }
  /** How many changes each path pattern has, most first: `sheets[].internalLevelValue` → 12 */
  pathCounts: { path: string; count: number }[]
  /** In the newer catalog's order, then the removed songs in the older one's */
  songs: SongDiff[]
  lists: ListDiff[]
  updateTime: { before: Json | undefined; after: Json | undefined }
}

const LIST_ENTRY_LIMIT = 50

const isObject = (value: unknown): value is Record<string, Json> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** JSON with sorted keys, so two equal values always compare equal */
export const canonical = (value: unknown): string =>
  JSON.stringify(value, (_, v: unknown) =>
    isObject(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : v,
  ) ?? 'undefined'

const flatten = (value: Json | undefined, path: string, out: Map<string, Json | undefined>) => {
  if (isObject(value)) {
    const entries = Object.entries(value)
    // An empty object is a value of its own, so `{}` → absent still shows up
    if (entries.length === 0 && path) out.set(path, value)
    for (const [key, child] of entries) flatten(child, path ? `${path}.${key}` : key, out)
  } else if (Array.isArray(value) && value.some((item) => isObject(item) || Array.isArray(item))) {
    value.forEach((child, index) => flatten(child, `${path}[${index}]`, out))
  } else {
    out.set(path, value)
  }
}

export const diffFields = (before: Record<string, Json>, after: Record<string, Json>, skip: readonly string[] = []) => {
  const a = new Map<string, Json | undefined>()
  const b = new Map<string, Json | undefined>()
  for (const [key, value] of Object.entries(before)) if (!skip.includes(key)) flatten(value, key, a)
  for (const [key, value] of Object.entries(after)) if (!skip.includes(key)) flatten(value, key, b)
  const changes: FieldChange[] = []
  for (const path of new Set([...a.keys(), ...b.keys()])) {
    const was = a.get(path)
    const now = b.get(path)
    if (canonical(was) === canonical(now)) continue
    const change: FieldChange = { path }
    if (was !== undefined) change.before = was
    if (now !== undefined) change.after = now
    changes.push(change)
  }
  return changes.sort((x, y) => (x.path < y.path ? -1 : x.path > y.path ? 1 : 0))
}

/** `foo[3].bar` → `foo[].bar`, so counts group by field rather than by index */
const pattern = (path: string) => path.replace(/\[\d+\]/g, '[]')

const TIMESTAMP_KEYS = ['updatedAt', 'updateTime']
const songKey = (song: Record<string, Json>) => String(song.id ?? song.songId)
const sheetKey = (sheet: Record<string, Json>) =>
  sheet.id == null ? `${String(sheet.type)}:${String(sheet.difficulty)}` : String(sheet.id)
const sheetIdent = (sheet: Record<string, Json>) => ({
  id: sheetKey(sheet),
  type: String(sheet.type),
  difficulty: String(sheet.difficulty),
})
const songsOf = (catalog: Record<string, Json>) => (Array.isArray(catalog.songs) ? catalog.songs : []).filter(isObject)
const sheetsOf = (song: Record<string, Json>) => (Array.isArray(song.sheets) ? song.sheets : []).filter(isObject)

export const diffCatalogs = (before: Record<string, Json>, after: Record<string, Json>): CatalogDiff => {
  const counts = new Map<string, number>()
  const count = (path: string) => counts.set(path, (counts.get(path) ?? 0) + 1)
  const summary = {
    songsAdded: 0,
    songsRemoved: 0,
    songsChanged: 0,
    sheetsAdded: 0,
    sheetsRemoved: 0,
    sheetsChanged: 0,
    fieldChanges: 0,
  }

  const oldSongs = new Map(songsOf(before).map((song) => [songKey(song), song]))
  const newIds = new Set<string>()
  const songs: SongDiff[] = []

  for (const song of songsOf(after)) {
    const songId = songKey(song)
    newIds.add(songId)
    const old = oldSongs.get(songId)
    if (!old) {
      summary.songsAdded++
      summary.sheetsAdded += sheetsOf(song).length
      songs.push({
        songId,
        title: String(song.title ?? songId),
        kind: 'added',
        fields: [],
        sheets: sheetsOf(song).map((sheet) => ({ ...sheetIdent(sheet), kind: 'added', fields: [] })),
      })
      continue
    }

    const fields = diffFields(old, song, ['sheets'])
    for (const field of fields) count(pattern(field.path))
    const oldSheets = new Map(sheetsOf(old).map((sheet) => [sheetKey(sheet), sheet]))
    const newKeys = new Set<string>()
    const sheets: SheetDiff[] = []
    for (const sheet of sheetsOf(song)) {
      const key = sheetKey(sheet)
      newKeys.add(key)
      const was = oldSheets.get(key)
      const ident = sheetIdent(sheet)
      if (!was) {
        sheets.push({ ...ident, kind: 'added', fields: [] })
        summary.sheetsAdded++
        count('sheets[]')
        continue
      }
      const sheetFields = diffFields(was, sheet)
      if (sheetFields.length === 0) continue
      sheets.push({ ...ident, kind: 'changed', fields: sheetFields })
      summary.sheetsChanged++
      summary.fieldChanges += sheetFields.length
      for (const field of sheetFields) count(`sheets[].${pattern(field.path)}`)
    }
    for (const [key, sheet] of oldSheets) {
      if (newKeys.has(key)) continue
      sheets.push({ ...sheetIdent(sheet), kind: 'removed', fields: [] })
      summary.sheetsRemoved++
      count('sheets[]')
    }

    if (fields.length === 0 && sheets.length === 0) continue
    summary.songsChanged++
    summary.fieldChanges += fields.length
    songs.push({ songId, title: String(song.title ?? songId), kind: 'changed', fields, sheets })
  }

  for (const [songId, song] of oldSongs) {
    if (newIds.has(songId)) continue
    summary.songsRemoved++
    summary.sheetsRemoved += sheetsOf(song).length
    songs.push({
      songId,
      title: String(song.title ?? songId),
      kind: 'removed',
      fields: [],
      sheets: sheetsOf(song).map((sheet) => ({ ...sheetIdent(sheet), kind: 'removed', fields: [] })),
    })
  }
  if (summary.songsAdded) counts.set('songs (added)', summary.songsAdded)
  if (summary.songsRemoved) counts.set('songs (removed)', summary.songsRemoved)

  const lists: ListDiff[] = []
  for (const key of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
    if (key === 'songs' || TIMESTAMP_KEYS.includes(key)) continue
    const was = Array.isArray(before[key]) ? (before[key] as Json[]) : before[key] === undefined ? [] : [before[key]!]
    const now = Array.isArray(after[key]) ? (after[key] as Json[]) : after[key] === undefined ? [] : [after[key]!]
    const wasSet = new Set(was.map(canonical))
    const nowSet = new Set(now.map(canonical))
    const added = now.filter((item) => !wasSet.has(canonical(item)))
    const removed = was.filter((item) => !nowSet.has(canonical(item)))
    if (added.length === 0 && removed.length === 0) continue
    lists.push({
      key,
      beforeCount: was.length,
      afterCount: now.length,
      added: added.slice(0, LIST_ENTRY_LIMIT),
      removed: removed.slice(0, LIST_ENTRY_LIMIT),
    })
  }

  return {
    summary,
    pathCounts: [...counts]
      .map(([path, n]) => ({ path, count: n }))
      .sort((a, b) => b.count - a.count || (a.path < b.path ? -1 : 1)),
    songs,
    lists,
    updateTime: { before: before.updatedAt ?? before.updateTime, after: after.updatedAt ?? after.updateTime },
  }
}

/** Keeps the songs with a change whose path pattern is `path` (e.g. `sheets[].internalLevelValue`), and only those changes */
export const filterByPath = (songs: SongDiff[], path: string): SongDiff[] =>
  songs.flatMap((song) => {
    if (path === 'songs (added)' || path === 'songs (removed)')
      return song.kind === (path === 'songs (added)' ? 'added' : 'removed') ? [song] : []
    if (song.kind !== 'changed') return []
    const fields = song.fields.filter((field) => pattern(field.path) === path)
    const sheets = song.sheets.flatMap((sheet) => {
      if (path === 'sheets[]') return sheet.kind === 'changed' ? [] : [sheet]
      const kept = sheet.fields.filter((field) => `sheets[].${pattern(field.path)}` === path)
      return kept.length ? [{ ...sheet, fields: kept }] : []
    })
    return fields.length || sheets.length ? [{ ...song, fields, sheets }] : []
  })