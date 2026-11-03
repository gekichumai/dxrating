import { VERSION_ID_MAP } from '@gekichumai/dxdata'
import { resolveSongReference, searchKey, type CatalogSong, type McpCatalog, type PublishedSheet } from './catalog'

// Finding the charts a tool is asked about, and what a chart is on a server: what get_sheet and the rating tools share.

/** The names of each standard difficulty, by their search keys */
const DIFFICULTY_NAMES: Record<string, string> = Object.fromEntries(
  Object.entries({
    basic: ['basic', 'bas', 'bsc'],
    advanced: ['advanced', 'adv'],
    expert: ['expert', 'exp'],
    master: ['master', 'mas', 'mst'],
    remaster: ['remaster', 're:master', 'rem', 'remas', 're:mas'],
  }).flatMap(([difficulty, names]) => names.map((name) => [searchKey(name), difficulty])),
)

export interface SheetQuery {
  /** A song ID, a sheet ID, or a whole name that only one song has */
  song: string
  type?: string
  difficulty?: string
  server?: string
}

export type ResolvedSheets =
  | { ok: true; entry: CatalogSong; sheets: PublishedSheet[]; server: string | undefined }
  | { ok: false; error: string }

/** The server ID of an argument, or an error naming the servers */
export function parseServer(
  catalog: McpCatalog,
  server: string | undefined,
): { ok: true; server: string | undefined } | { ok: false; error: string } {
  const id = server?.trim().toLowerCase()
  if (id === undefined || catalog.serverNames.has(id)) return { ok: true, server: id }
  return {
    ok: false,
    error: `Unknown server ${JSON.stringify(server)}. Servers: ${[...catalog.serverNames.keys()].join(', ')}.`,
  }
}

/** The charts of the one song a query names, filtered by its type, difficulty and server; or what is wrong with it. */
export function resolveSheets(catalog: McpCatalog, query: SheetQuery): ResolvedSheets {
  const songs = resolveSongReference(catalog, query.song)
  if (songs.length === 0) {
    return {
      ok: false,
      error: `No song is named or has the ID ${JSON.stringify(query.song)}. Find its song ID with search_songs.`,
    }
  }
  if (songs.length > 1) {
    const candidates = songs
      .slice(0, 10)
      .map(({ song }) => `${song.id} (${song.title} / ${song.artist})`)
      .join(', ')
    return {
      ok: false,
      error: `${songs.length} songs are named ${JSON.stringify(query.song)}: ${candidates}. Pass a song ID.`,
    }
  }
  const [entry] = songs
  const { song } = entry

  const server = parseServer(catalog, query.server)
  if (!server.ok) return server

  let difficulty: string | undefined
  if (query.difficulty !== undefined) {
    const key = searchKey(query.difficulty)
    difficulty = DIFFICULTY_NAMES[key] ?? song.sheets.find((sheet) => searchKey(sheet.difficulty) === key)?.difficulty
    if (difficulty === undefined) {
      return {
        ok: false,
        error:
          `Unknown difficulty ${JSON.stringify(query.difficulty)}: basic, advanced, expert, master or remaster` +
          (song.sheets.some((sheet) => !(sheet.difficulty in DIFFICULTY_NAMES))
            ? ', or the label of an utage chart.'
            : '.'),
      }
    }
  }

  // a sheet given by its ID is that sheet, unless the filters say otherwise
  const bySheetId = song.sheets.find((sheet) => sheet.id === query.song.trim())
  const sheets = (bySheetId ? [bySheetId] : song.sheets).filter(
    (sheet) =>
      (query.type === undefined || sheet.type === query.type) &&
      (difficulty === undefined || sheet.difficulty === difficulty) &&
      (server.server === undefined || sheet.serverIds.includes(server.server)),
  )
  if (sheets.length === 0) {
    const available = song.sheets.map((sheet) => `${sheet.type} ${sheet.difficulty} (${sheet.serverIds.join('/')})`)
    return { ok: false, error: `${song.title} has no such chart. Its charts: ${available.join(', ')}.` }
  }
  return { ok: true, entry, sheets, server: server.server }
}

/** What a chart is on a server: its level, internal level and version there, which overrides may change. */
export function sheetOnServer(sheet: PublishedSheet, server: string | undefined) {
  const override = server === undefined ? undefined : sheet.serverOverrides?.[server]
  return {
    level: override?.level ?? sheet.level,
    internalLevel: override?.levelValue ?? sheet.internalLevelValue,
    version: override?.version ?? sheet.version,
  }
}

/** Whether a chart counts in ratings: utage (宴) charts do not */
export const isRatingEligible = (sheet: PublishedSheet) => sheet.type !== 'utage' && sheet.type !== 'utage2p'

/** The order of a game version, or undefined for one the code does not know yet */
export const versionOrder = (version: string): number | undefined => VERSION_ID_MAP.get(version)

/** The newest game version a server has a chart of: the version its players play, as the catalog knows it */
export function currentVersion(catalog: McpCatalog, server: string): string | undefined {
  let newest: { version: string; order: number } | undefined
  for (const { song } of catalog.songs) {
    for (const sheet of song.sheets) {
      if (!sheet.serverIds.includes(server)) continue
      const { version } = sheetOnServer(sheet, server)
      const order = versionOrder(version)
      if (order !== undefined && (!newest || order > newest.order)) newest = { version, order }
    }
  }
  return newest?.version
}