import { z } from 'zod'
import type { CatalogSong, McpCatalog, PublishedSheet } from './catalog'
import { catalogInfo, catalogInfoSchema, sheetSummarySchema, structured, toolError } from './output'
import { parseServer, sheetOnServer } from './sheets'

// The songs and charts released recently, by release date, newest first, as the release calendar of the Discover tab
// of the iOS app groups them (ChartDiscovery.releaseGroups): the date of a chart is its release date, else that of
// its game version; a song is new on the date of its first chart (on the server asked for), and the charts it gains
// on a later date are new charts of an existing song.

/** The days back from today that are listed by default, and the most that can be asked for */
const DEFAULT_DAYS = 30
const MAX_DAYS = 3650
/** The number of songs to return, across dates; a version update releases a hundred or so at once */
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

const DATE = /^\d{4}-\d{2}-\d{2}$/

export const listRecentSongsInput = {
  server: z
    .string()
    .max(20)
    .optional()
    .describe(
      'Game server: jp, intl, usa or cn. Only the charts on that server, with its own level where it differs; a ' +
        'song is new on the date of its first chart there. Omitted: every chart of every server.',
    ),
  since: z
    .string()
    .regex(DATE)
    .optional()
    .describe('First release date to list, YYYY-MM-DD. Give since or days, not both.'),
  days: z
    .number()
    .int()
    .min(1)
    .max(MAX_DAYS)
    .optional()
    .describe(`Release dates from this many days before today (UTC). Default ${DEFAULT_DAYS}.`),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .optional()
    .describe(`Most songs to return, newest dates first, 1 to ${MAX_LIMIT}. Default ${DEFAULT_LIMIT}.`),
}

const releasedSheetSchema = sheetSummarySchema.extend({
  version: z.string().describe('Game version the chart was added in, on the server asked for'),
})

const releasedSongSchema = z.object({
  songId: z.string().describe('Song ID, for get_sheet'),
  sheetIds: z.array(z.string()).describe('IDs of the charts released on this date'),
  title: z.string(),
  artist: z.string(),
  category: z.string(),
  unlockRequired: z.boolean().describe('Whether the song must be unlocked in the game before it can be played'),
  sheets: z.array(releasedSheetSchema).describe('The charts released on this date'),
})

export const listRecentSongsOutput = {
  server: z.string().nullable().describe('Server of the charts, or null for every server'),
  since: z.string().describe('First release date listed, YYYY-MM-DD'),
  total: z.number().int().describe('Songs released since then, before limit'),
  truncated: z.boolean().describe('Whether limit left out songs (of the oldest dates)'),
  releases: z
    .array(
      z.object({
        date: z.string().describe('Release date, YYYY-MM-DD; a date after today is announced'),
        newSongs: z.array(releasedSongSchema).describe('Songs whose first chart was released on this date (新曲)'),
        newCharts: z
          .array(releasedSongSchema)
          .describe('Songs released before that gained charts on this date (新譜面), with only those charts'),
      }),
    )
    .describe('Release dates, newest first'),
  ...catalogInfoSchema,
}

export const listRecentSongsTool = {
  name: 'list_recent_songs',
  config: {
    title: 'List recent songs',
    description:
      'Lists the maimai DX songs and charts released recently, by release date, newest first: on each date the new ' +
      'songs, and the new charts added to songs released before, with the level and internal level (譜面定数) of ' +
      'each chart. Use it for "what is new" questions. Release dates are those of Japan.',
    inputSchema: listRecentSongsInput,
    outputSchema: listRecentSongsOutput,
  },
}

type ReleasedSong = z.infer<typeof releasedSongSchema>

/** The release date of a chart: its own, else that of its game version, as the iOS app reads it */
const releaseDateOf = (sheet: PublishedSheet, versionDates: Map<string, string>) =>
  sheet.releaseDate ?? versionDates.get(sheet.version)

/** Whether a YYYY-MM-DD text is a day of the calendar: not 2026-02-30 or 2026-02-29, which Date.parse rolls over */
const isCalendarDate = (text: string) => {
  const time = Date.parse(`${text}T00:00:00Z`)
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === text
}

/** The day, YYYY-MM-DD in UTC, days before now */
const daysBefore = (now: Date, days: number) => new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10)

export function runListRecentSongs(
  catalog: McpCatalog,
  {
    server: serverArg,
    since: sinceArg,
    days,
    limit = DEFAULT_LIMIT,
  }: { server?: string; since?: string; days?: number; limit?: number },
  now = new Date(),
) {
  if (sinceArg !== undefined && days !== undefined) return toolError('Give since or days, not both.')
  if (sinceArg !== undefined && !isCalendarDate(sinceArg)) {
    return toolError(`since ${JSON.stringify(sinceArg)} is not a date: give YYYY-MM-DD.`)
  }
  const parsed = parseServer(catalog, serverArg)
  if (!parsed.ok) return toolError(parsed.error)
  const { server } = parsed
  const since = sinceArg ?? daysBefore(now, days ?? DEFAULT_DAYS)

  const versionDates = new Map<string, string>()
  for (const { version, releaseDate } of catalog.document.versions) {
    if (releaseDate && !versionDates.has(version)) versionDates.set(version, releaseDate)
  }

  const byDate = new Map<string, { newSongs: ReleasedSong[]; newCharts: ReleasedSong[] }>()
  const order = new Map<CatalogSong, number>(catalog.songs.map((entry, index) => [entry, index]))
  const entriesByDate = new Map<string, { entry: CatalogSong; sheets: PublishedSheet[]; isNew: boolean }[]>()
  for (const entry of catalog.songs) {
    const dated = entry.song.sheets.flatMap((sheet) => {
      if (server !== undefined && !sheet.serverIds.includes(server)) return []
      const date = releaseDateOf(sheet, versionDates)
      return date ? [{ sheet, date }] : []
    })
    if (dated.length === 0) continue
    const first = dated.reduce((min, { date }) => (date < min ? date : min), dated[0].date)
    const sheetsByDate = new Map<string, PublishedSheet[]>()
    for (const { sheet, date } of dated) {
      if (date < since) continue
      sheetsByDate.set(date, [...(sheetsByDate.get(date) ?? []), sheet])
    }
    for (const [date, sheets] of sheetsByDate) {
      entriesByDate.set(date, [...(entriesByDate.get(date) ?? []), { entry, sheets, isNew: date === first }])
    }
  }

  const dates = [...entriesByDate.keys()].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
  let total = 0
  let returned = 0
  for (const date of dates) {
    const entries = entriesByDate
      .get(date)!
      .sort(
        (a, b) =>
          a.entry.song.title.localeCompare(b.entry.song.title, 'ja') || order.get(a.entry)! - order.get(b.entry)!,
      )
    total += entries.length
    for (const { entry, sheets, isNew } of entries) {
      if (returned >= limit) continue
      returned++
      const { song } = entry
      const released: ReleasedSong = {
        songId: song.id,
        sheetIds: sheets.map((sheet) => sheet.id),
        title: song.title,
        artist: song.artist,
        category: song.category,
        unlockRequired: song.isLocked,
        sheets: sheets.map((sheet) => {
          const onServer = sheetOnServer(sheet, server)
          return {
            sheetId: sheet.id,
            type: sheet.type,
            difficulty: sheet.difficulty,
            level: onServer.level,
            internalLevel: onServer.internalLevel,
            version: onServer.version,
          }
        }),
      }
      const group = byDate.get(date) ?? { newSongs: [], newCharts: [] }
      ;(isNew ? group.newSongs : group.newCharts).push(released)
      byDate.set(date, group)
    }
  }

  return structured({
    server: server ?? null,
    since,
    total,
    truncated: returned < total,
    releases: [...byDate].map(([date, group]) => ({ date, ...group })),
    ...catalogInfo(catalog),
  })
}