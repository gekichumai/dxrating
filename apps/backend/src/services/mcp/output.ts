import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import type { McpCatalog, PublishedSheet } from './catalog'

// What the results of the tools share: the credit of the data, the languages of the localized names, the summary of
// a sheet, and the shape of a result.

export const SITE_URL = 'https://dxrating.net'
/** The icon of the site, for clients and directories to show */
export const ICONS = [{ src: 'https://shama.dxrating.net/favicon/pack/v1/apple-touch-icon.png', mimeType: 'image/png' }]
export const DATA_LICENSE = 'CC BY-NC 4.0'
export const DATA_LICENSE_URL = 'https://creativecommons.org/licenses/by-nc/4.0/'

export const sourceSchema = z.object({
  name: z.literal('DXRating'),
  url: z.string(),
  license: z.literal(DATA_LICENSE),
  licenseUrl: z.string(),
  attribution: z.string(),
})

export const source: z.infer<typeof sourceSchema> = {
  name: 'DXRating',
  url: SITE_URL,
  license: DATA_LICENSE,
  licenseUrl: DATA_LICENSE_URL,
  attribution: `Data: DXRating (${SITE_URL}), ${DATA_LICENSE}`,
}

/** The languages of the localized names (tags), as the web app has them */
export const LANGUAGES = ['en', 'ja', 'zh-Hans', 'zh-Hant'] as const
export type Language = (typeof LANGUAGES)[number]

export const langSchema = z
  .enum(LANGUAGES)
  .optional()
  .describe('Language of the tag names: en (default), ja, zh-Hans or zh-Hant. Use the language of the user.')

/** The name of a localized string in lang, else in English, else in Japanese, else in any language. */
export function localized(names: Record<string, string>, lang: Language = 'en'): string {
  return names[lang] ?? names.en ?? names.ja ?? Object.values(names)[0] ?? ''
}

export const sheetTypeSchema = z.enum(['dx', 'std', 'utage', 'utage2p'])

export const sheetSummarySchema = z.object({
  sheetId: z.string(),
  type: z.string().describe('dx (DX chart), std (standard chart), utage or utage2p (宴, joke charts)'),
  difficulty: z.string().describe('basic, advanced, expert, master, remaster, or the label of an utage chart: 【習】'),
  level: z.string().describe('Level shown in the game: 13+'),
  internalLevel: z.number().describe('Internal level (譜面定数) of the current version, which ratings are made of'),
})

export function sheetSummary(sheet: PublishedSheet): z.infer<typeof sheetSummarySchema> {
  return {
    sheetId: sheet.id,
    type: sheet.type,
    difficulty: sheet.difficulty,
    level: sheet.level,
    internalLevel: sheet.internalLevelValue,
  }
}

export const catalogInfoSchema = {
  dataAsOf: z.string().describe('When the catalog was last updated'),
  source: sourceSchema,
}

export const catalogInfo = (catalog: McpCatalog) => ({ dataAsOf: catalog.updatedAt, source })

/** A result of structured content, which is also sent as text for clients that only read text. */
export function structured<T extends Record<string, unknown>>(content: T): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(content) }], structuredContent: content }
}

/** An error the model can act on: a wrong argument, or data that is not loaded yet. */
export function toolError(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true }
}

export const CATALOG_LOADING_MESSAGE =
  'DXRating is still loading its song catalog (the server restarted recently). Retry in about a minute.'