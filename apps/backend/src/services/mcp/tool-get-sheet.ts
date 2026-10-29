import { z } from 'zod'
import type { McpCatalog, PublishedSheet } from './catalog'
import {
  catalogInfo,
  catalogInfoSchema,
  langSchema,
  localized,
  sheetSummarySchema,
  sheetTypeSchema,
  structured,
  toolError,
  type Language,
} from './output'
import { resolveSheets, sheetOnServer } from './sheets'

const COVER_URL = 'https://shama.dxrating.net/images/cover/v2'

export const getSheetInput = {
  song: z
    .string()
    .min(1)
    .max(200)
    .describe(
      'Song ID (dsng_…) or sheet ID (dsht_…) from search_songs. A title or alias that only one song has works too.',
    ),
  type: sheetTypeSchema.optional().describe('Only the charts of this type: dx, std, utage or utage2p'),
  difficulty: z
    .string()
    .max(40)
    .optional()
    .describe('Only the charts of this difficulty: basic, advanced, expert, master or remaster (MAS, Re:MAS work)'),
  server: z
    .string()
    .max(20)
    .optional()
    .describe(
      'Game server: jp, intl, usa or cn. Only the charts on that server, with its own level where it differs. ' +
        'Omitted: every chart, with the servers of each.',
    ),
  lang: langSchema,
}

const sheetDetailSchema = sheetSummarySchema.extend({
  internalLevelByVersion: z
    .record(z.string(), z.number())
    .optional()
    .describe('Internal level in each past game version where it is known, as it changed between versions'),
  noteDesigner: z.string().nullable(),
  noteCounts: z.object({
    tap: z.number().int().optional(),
    hold: z.number().int().optional(),
    slide: z.number().int().optional(),
    touch: z.number().int().optional(),
    break: z.number().int().optional(),
    total: z.number().int().optional(),
  }),
  version: z.string().describe('Game version the chart was added in'),
  releaseDate: z.string().nullable().describe('Date the chart was released in Japan, YYYY-MM-DD'),
  servers: z.array(z.string()).describe('Servers the chart is on'),
  serverOverrides: z
    .record(
      z.string(),
      z.object({ level: z.string().optional(), levelValue: z.number().optional(), version: z.string().optional() }),
    )
    .optional()
    .describe('Level, internal level or version of the chart on servers where they differ from jp'),
  isSpecial: z.boolean(),
  comment: z.string().optional(),
  tags: z
    .array(z.object({ id: z.number().int(), name: z.string(), group: z.string().nullable() }))
    .describe('Community tags of the chart: its patterns and techniques'),
})

export const getSheetOutput = {
  song: z.object({
    songId: z.string(),
    title: z.string(),
    artist: z.string(),
    bpm: z.number().nullable(),
    category: z.string(),
    version: z.string().describe('Game version the song was added in'),
    isNew: z.boolean().describe('Whether the song is of the current version, whose charts count in the new 15 (b15)'),
    isLocked: z.boolean(),
    aliases: z.array(z.string()).describe('Community aliases and nicknames'),
    searchAcronyms: z.array(z.string()),
    coverUrl: z.string(),
  }),
  server: z.string().nullable(),
  sheets: z.array(sheetDetailSchema),
  ...catalogInfoSchema,
}

export const getSheetTool = {
  name: 'get_sheet',
  config: {
    title: 'Get song and charts',
    description:
      'Details of a maimai DX song and its charts (譜面): level, internal level (譜面定数) now and in past versions, ' +
      'note counts, note designer, release date, servers and community tags. Filter by type, difficulty and server.',
    inputSchema: getSheetInput,
    outputSchema: getSheetOutput,
  },
}

export function runGetSheet(
  catalog: McpCatalog,
  input: {
    song: string
    type?: z.infer<typeof sheetTypeSchema>
    difficulty?: string
    server?: string
    lang?: Language
  },
) {
  const resolved = resolveSheets(catalog, input)
  if (!resolved.ok) return toolError(resolved.error)
  const {
    entry: { song, aliases },
    sheets,
    server,
  } = resolved

  return structured({
    song: {
      songId: song.id,
      title: song.title,
      artist: song.artist,
      bpm: song.bpm ?? null,
      category: song.category,
      version: song.version,
      isNew: song.isNew,
      isLocked: song.isLocked,
      aliases,
      searchAcronyms: song.searchAcronyms,
      coverUrl: `${COVER_URL}/${song.imageName}.jpg`,
    },
    server: server ?? null,
    sheets: sheets.map((sheet) => sheetDetail(catalog, sheet, server, input.lang)),
    ...catalogInfo(catalog),
  })
}

function sheetDetail(
  catalog: McpCatalog,
  sheet: PublishedSheet,
  server: string | undefined,
  lang: Language | undefined,
) {
  const tags = (catalog.tagIdsBySheetId.get(sheet.id) ?? []).flatMap((tagId) => {
    const tag = catalog.tagsById.get(tagId)
    if (!tag) return []
    const group = tag.group_id === undefined ? undefined : catalog.tagGroupsById.get(tag.group_id)
    return [
      {
        id: tag.id,
        name: localized(tag.localized_name, lang),
        group: group ? localized(group.localized_name, lang) : null,
      },
    ]
  })
  return {
    sheetId: sheet.id,
    type: sheet.type,
    difficulty: sheet.difficulty,
    ...sheetOnServer(sheet, server),
    ...(sheet.multiverInternalLevelValue ? { internalLevelByVersion: sheet.multiverInternalLevelValue } : {}),
    noteDesigner: sheet.noteDesigner ?? null,
    noteCounts: sheet.noteCounts,
    releaseDate: sheet.releaseDate ?? null,
    servers: sheet.serverIds,
    ...(server === undefined && sheet.serverOverrides ? { serverOverrides: sheet.serverOverrides } : {}),
    isSpecial: sheet.isSpecial,
    ...(sheet.comment ? { comment: sheet.comment } : {}),
    tags,
  }
}