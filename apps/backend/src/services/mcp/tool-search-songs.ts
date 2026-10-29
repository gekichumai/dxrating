import { z } from 'zod'
import { searchSongs, type McpCatalog } from './catalog'
import { catalogInfo, catalogInfoSchema, sheetSummary, sheetSummarySchema, sheetTypeSchema, structured } from './output'

/** The number of songs to return; a common word in titles matches a few hundred */
const DEFAULT_LIMIT = 10
const MAX_LIMIT = 50

export const searchSongsInput = {
  query: z
    .string()
    .min(1)
    .max(200)
    .describe(
      'Title, alias, nickname, romanization or artist, in any language: ウミユリ海底譚, umiyuri, 海底谭, n-buna. ' +
        'Width, case, kana and punctuation are ignored.',
    ),
  type: sheetTypeSchema
    .optional()
    .describe('Only the songs that have a chart of this type, and only those charts: dx, std, utage or utage2p'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .optional()
    .describe(`Most songs to return, 1 to ${MAX_LIMIT}. Default ${DEFAULT_LIMIT}.`),
}

export const searchSongsOutput = {
  query: z.string(),
  total: z.number().int().describe('Songs that match, before limit'),
  truncated: z.boolean().describe('Whether limit left out songs'),
  songs: z.array(
    z.object({
      songId: z.string().describe('Song ID, for get_sheet'),
      title: z.string(),
      artist: z.string(),
      category: z.string(),
      version: z.string().describe('Game version the song was added in'),
      matched: z
        .object({
          kind: z.enum(['title', 'acronym', 'alias', 'artist']),
          text: z.string(),
        })
        .describe('The name of the song the query matched'),
      sheets: z.array(sheetSummarySchema),
    }),
  ),
  ...catalogInfoSchema,
}

export const searchSongsTool = {
  name: 'search_songs',
  config: {
    title: 'Search songs',
    description:
      'Finds maimai DX songs by title, alias, nickname, romanization or artist, best match first, with the level ' +
      'and internal level (譜面定数) of each chart. Use it to get the song ID of a song the user names.',
    inputSchema: searchSongsInput,
    outputSchema: searchSongsOutput,
  },
}

export function runSearchSongs(
  catalog: McpCatalog,
  { query, type, limit = DEFAULT_LIMIT }: { query: string; type?: z.infer<typeof sheetTypeSchema>; limit?: number },
) {
  const matches = searchSongs(catalog, query).flatMap((match) => {
    const sheets = type === undefined ? match.entry.song.sheets : match.entry.song.sheets.filter((s) => s.type === type)
    return sheets.length > 0 ? [{ ...match, sheets }] : []
  })
  const songs = matches.slice(0, limit).map(({ entry: { song }, matched, sheets }) => ({
    songId: song.id,
    title: song.title,
    artist: song.artist,
    category: song.category,
    version: song.version,
    matched,
    sheets: sheets.map(sheetSummary),
  }))
  return structured({
    query,
    total: matches.length,
    truncated: matches.length > songs.length,
    songs,
    ...catalogInfo(catalog),
  })
}