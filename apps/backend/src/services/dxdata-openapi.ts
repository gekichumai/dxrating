import { toOpenAPISchema, type OpenAPI } from '@orpc/openapi'
import { JSON_SCHEMA_REGISTRY, ZodToJsonSchemaConverter } from '@orpc/zod/zod4'
import { z } from 'zod'
import { DXDATA_BROWSER_CACHE_CONTROL, DXDATA_CDN_CACHE_CONTROL, DXDATA_PATH } from './dxdata.js'

const PUBLIC_SONG_ID_PATTERN = /^dsng_[23456789abcdefghjkmnpqrstvwxyz]{10}$/
const PUBLIC_SHEET_ID_PATTERN = /^dsht_[23456789abcdefghjkmnpqrstvwxyz]{10}$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const OptionalDateSchema = z.string().regex(DATE_PATTERN).optional()

const DynamicNoteCountsSchema = z.strictObject({
  tap: z.number().int().nonnegative().optional(),
  hold: z.number().int().nonnegative().optional(),
  slide: z.number().int().nonnegative().optional(),
  touch: z.number().int().nonnegative().optional(),
  break: z.number().int().nonnegative().optional(),
  total: z.number().int().nonnegative().optional(),
})

const DynamicServerOverrideSchema = z.strictObject({
  level: z.string().optional(),
  levelValue: z.number().nonnegative().optional(),
  version: z.string().optional(),
})

const DynamicSheetSchema = z.strictObject({
  id: z.string().regex(PUBLIC_SHEET_ID_PATTERN),
  type: z.string().min(1),
  difficulty: z.string().min(1),
  level: z.string().min(1),
  internalLevelValue: z.number().nonnegative(),
  noteDesigner: z.string().optional(),
  noteCounts: DynamicNoteCountsSchema,
  serverIds: z.array(z.string().min(1)),
  serverOverrides: z.record(z.string().min(1), DynamicServerOverrideSchema).optional(),
  isSpecial: z.boolean(),
  version: z.string().min(1),
  internalId: z.number().int().nonnegative().optional(),
  releaseDate: OptionalDateSchema,
  multiverInternalLevelValue: z.record(z.string().min(1), z.number().nonnegative()).optional(),
  comment: z.string().optional(),
})

const DynamicSongSchema = z.strictObject({
  id: z.string().regex(PUBLIC_SONG_ID_PATTERN),
  category: z.string().min(1),
  title: z.string().min(1),
  artist: z.string(),
  bpm: z.number().positive().optional(),
  imageName: z.string(),
  version: z.string().min(1),
  isNew: z.boolean(),
  isLocked: z.boolean(),
  sheets: z.array(DynamicSheetSchema),
  searchAcronyms: z.array(z.string()),
})

const DynamicLocalizedStringSchema = z.record(z.string().min(1), z.string())

const DynamicTagGroupSchema = z.strictObject({
  id: z.number().int().positive(),
  localized_name: DynamicLocalizedStringSchema,
  color: z.string(),
})

const DynamicTagSchema = z.strictObject({
  id: z.number().int().positive(),
  localized_name: DynamicLocalizedStringSchema,
  localized_description: DynamicLocalizedStringSchema,
  group_id: z.number().int().positive().optional(),
})

const DynamicTagSongSchema = z.strictObject({
  song_id: z.string().regex(PUBLIC_SONG_ID_PATTERN),
  sheet_id: z.string().regex(PUBLIC_SHEET_ID_PATTERN),
  sheet_type: z.string().min(1),
  sheet_difficulty: z.string().min(1),
  tag_id: z.number().int().positive(),
})

const DynamicAliasSchema = z.strictObject({
  song_id: z.string().regex(PUBLIC_SONG_ID_PATTERN),
  name: z.string(),
})

/**
 * Executable consumer contract for the producer-owned public catalog body.
 *
 * The serving route deliberately does not parse a potentially large immutable
 * body on each request. CI instead publishes a fixture with the real producer
 * and validates it against this schema before the API contract can merge.
 */
export const PublishedDxdataCatalogSchema = z.strictObject({
  schemaVersion: z.literal(1),
  updatedAt: z.string().min(1),
  categories: z.array(z.strictObject({ category: z.string().min(1) })),
  versions: z.array(
    z.strictObject({
      version: z.string().min(1),
      abbr: z.string().optional(),
      releaseDate: OptionalDateSchema,
    }),
  ),
  types: z.array(
    z.strictObject({
      type: z.string().min(1),
      name: z.string().min(1),
      abbr: z.string().optional(),
      iconUrl: z.string().optional(),
      iconHeight: z.number().int().positive().optional(),
    }),
  ),
  difficulties: z.array(
    z.strictObject({
      difficulty: z.string().min(1),
      name: z.string().min(1),
      color: z.string().optional(),
    }),
  ),
  servers: z.array(z.strictObject({ id: z.string().min(1), name: z.string().min(1) })),
  songs: z.array(DynamicSongSchema),
  tagGroups: z.array(DynamicTagGroupSchema),
  tags: z.array(DynamicTagSchema),
  tagSongs: z.array(DynamicTagSongSchema),
  aliases: z.array(DynamicAliasSchema),
})

const publishedDxdataCatalogExample = {
  schemaVersion: 1,
  updatedAt: '2026-08-30T15:00:13.396044948+00:00',
  categories: [{ category: 'niconico＆ボーカロイド' }, { category: 'maimai' }, { category: '宴会場' }],
  versions: [
    { version: 'ORANGE PLUS', abbr: 'ORANGE+ (暁)', releaseDate: '2015-03-19' },
    { version: 'Splash', abbr: 'Splash (爽)', releaseDate: '2020-09-17' },
    { version: 'PRiSM', abbr: 'PRiSM (鏡)', releaseDate: '2024-09-12' },
  ],
  types: [
    { type: 'dx', name: 'DX（でらっくす）', abbr: 'DX', iconUrl: 'type-dx.png', iconHeight: 22 },
    { type: 'std', name: 'STD（スタンダード）', abbr: 'STD', iconUrl: 'type-std.png', iconHeight: 22 },
    { type: 'utage', name: '宴（宴会場）', abbr: '宴' },
  ],
  difficulties: [
    { difficulty: 'basic', name: 'BASIC', color: '#22bb5b' },
    { difficulty: 'master', name: 'MASTER', color: '#9e45e2' },
    { difficulty: 'remaster', name: 'Re:MASTER', color: '#ba67f8' },
  ],
  servers: [
    { id: 'jp', name: '日本版' },
    { id: 'intl', name: '海外版 (International ver.)' },
    { id: 'usa', name: 'アメリカ海外版 (USA International ver.)' },
  ],
  songs: [
    {
      id: 'dsng_d9dbdcaw9v',
      category: 'niconico＆ボーカロイド',
      title: 'ウミユリ海底譚',
      artist: 'n-buna',
      bpm: 120,
      imageName: 'e05e2a6fc30cd26f1b87310732062c03fdcc3900808695594d4b7d1c625c7315',
      version: 'ORANGE PLUS',
      isNew: false,
      isLocked: false,
      sheets: [
        {
          id: 'dsht_jxnmx39rwt',
          type: 'std',
          difficulty: 'master',
          level: '13',
          internalLevelValue: 13.4,
          noteDesigner: 'はっぴー',
          noteCounts: { tap: 648, hold: 21, slide: 76, break: 14, total: 759 },
          serverIds: ['jp', 'intl', 'usa'],
          isSpecial: false,
          version: 'ORANGE PLUS',
          internalId: 417,
          releaseDate: '2015-05-14',
          multiverInternalLevelValue: {
            BUDDiES: 13.4,
            'FESTiVAL PLUS': 13.4,
            'maimaiでらっくす PLUS': 12.8,
          },
        },
      ],
      searchAcronyms: ['umiyuri', 'Umiyuri', 'Umiyuri Kaiteitan'],
    },
    {
      id: 'dsng_e3bzx8srqf',
      category: 'maimai',
      title: '全世界共通リズム感テスト',
      artist: '☆リズムに合わせてボタンを叩き達成率を競うゲームです☆',
      bpm: 120,
      imageName: '692ae385226bd2ff2c7134b8593c195ef5d4294194c672eb33ce97394ec882ef',
      version: 'ORANGE PLUS',
      isNew: false,
      isLocked: false,
      sheets: [
        {
          id: 'dsht_zqs3r86ssb',
          type: 'std',
          difficulty: 'basic',
          level: '6',
          internalLevelValue: 6,
          noteDesigner: '-',
          noteCounts: { tap: 48, hold: 0, slide: 0, break: 17, total: 65 },
          serverIds: ['intl', 'usa'],
          serverOverrides: { intl: { version: 'Splash' } },
          isSpecial: false,
          version: 'ORANGE PLUS',
          internalId: 854,
          releaseDate: '2015-04-01',
        },
      ],
      searchAcronyms: [],
    },
    {
      id: 'dsng_phnye8rsgn',
      category: '宴会場',
      title: '[習]ウミユリ海底譚',
      artist: 'n-buna',
      bpm: 120,
      imageName: 'e05e2a6fc30cd26f1b87310732062c03fdcc3900808695594d4b7d1c625c7315',
      version: 'PRiSM',
      isNew: false,
      isLocked: false,
      sheets: [
        {
          id: 'dsht_cjgcb6z68z',
          type: 'utage',
          difficulty: '【習】',
          level: '12+?',
          internalLevelValue: 12.7,
          noteCounts: { tap: 549, hold: 7, slide: 109, touch: 0, break: 1, total: 666 },
          serverIds: ['jp', 'intl', 'usa'],
          isSpecial: true,
          version: 'PRiSM',
          internalId: 110417,
          releaseDate: '2024-09-12',
          comment: 'ウミユリ練習譚',
        },
      ],
      searchAcronyms: ['[习]ウミユリ海底谭', '我们当年哪有这条件'],
    },
  ],
  tagGroups: [
    {
      id: 1,
      localized_name: { en: 'Patterns', ja: 'パターン', 'zh-Hans': '配置' },
      color: '#7dd3fc',
    },
  ],
  tags: [
    {
      id: 1,
      localized_name: { en: 'Umiyuri', ja: 'ウミユリ配置', 'zh-Hans': '错位' },
      localized_description: {
        en: "Umiyuri patterns require completing other notes between hitting the star head and beginning the star slide. After finishing those notes, you return to complete the star slide.\n\n~~Have you AP'd Kaitei Tan yet?~~",
        ja: 'ズレ配置とは、スターのヘッドを叩いてからスライドを始めるまでの間に、他のノーツを処理する必要がある配置のことです。他のノーツを処理した後、スライドに戻って完成させます。\n\n~~海底譚APした？~~',
        'zh-Hans':
          '错位是指从击打星星头后、直到可以正常滑动星星条前的时间内，需要完成其他音符。在完成其他音符后，再回来开始完成星星条的一种配置。\n\n~~海底谭AP了吗~~',
      },
      group_id: 1,
    },
  ],
  tagSongs: [
    {
      song_id: 'dsng_d9dbdcaw9v',
      sheet_id: 'dsht_jxnmx39rwt',
      sheet_type: 'std',
      sheet_difficulty: 'master',
      tag_id: 1,
    },
  ],
  aliases: [
    { song_id: 'dsng_d9dbdcaw9v', name: '海底谭你学不会' },
    { song_id: 'dsng_d9dbdcaw9v', name: '海𠷡' },
  ],
} satisfies z.infer<typeof PublishedDxdataCatalogSchema>

JSON_SCHEMA_REGISTRY.add(PublishedDxdataCatalogSchema, { examples: [publishedDxdataCatalogExample] })

const exampleCatalogEtag = '"78af90bc0094b4167143fabea17666892ec38c8de7723254fd74d3389da648e2"'

const catalogResponseHeaders = {
  'Content-Length': {
    description: 'UTF-8 byte length of the selected immutable catalog representation.',
    schema: { type: 'integer', minimum: 1, example: 4115441 },
    example: 4115441,
  },
  ETag: {
    description: 'Strong validator containing the SHA-256 digest of the response body.',
    schema: { type: 'string', pattern: '^"[0-9a-f]{64}"$', example: exampleCatalogEtag },
    example: exampleCatalogEtag,
  },
  'Cache-Control': {
    description: 'Browser cache policy.',
    schema: { type: 'string', example: DXDATA_BROWSER_CACHE_CONTROL },
    example: DXDATA_BROWSER_CACHE_CONTROL,
  },
  'CDN-Cache-Control': {
    description: 'Shared CDN cache policy.',
    schema: { type: 'string', example: DXDATA_CDN_CACHE_CONTROL },
    example: DXDATA_CDN_CACHE_CONTROL,
  },
  'Cloudflare-CDN-Cache-Control': {
    description: 'Cloudflare-specific shared cache policy.',
    schema: { type: 'string', example: DXDATA_CDN_CACHE_CONTROL },
    example: DXDATA_CDN_CACHE_CONTROL,
  },
  'Cache-Tag': {
    description: 'Surrogate cache tag used to invalidate the catalog.',
    schema: { type: 'string', enum: ['dxdata'], example: 'dxdata' },
    example: 'dxdata',
  },
} satisfies Record<string, OpenAPI.HeaderObject>

const uncachedResponseHeaders = {
  'Cache-Control': {
    description: 'Always `no-store` for endpoint failures.',
    schema: { type: 'string', enum: ['no-store'], example: 'no-store' },
    example: 'no-store',
  },
  'CDN-Cache-Control': {
    description: 'Always `no-store` for endpoint failures.',
    schema: { type: 'string', enum: ['no-store'], example: 'no-store' },
    example: 'no-store',
  },
  'Cloudflare-CDN-Cache-Control': {
    description: 'Always `no-store` for endpoint failures.',
    schema: { type: 'string', enum: ['no-store'], example: 'no-store' },
    example: 'no-store',
  },
} satisfies Record<string, OpenAPI.HeaderObject>

const uncachedErrorResponse = (error: string) =>
  ({
    description: 'The published catalog is unavailable. This response is never cacheable.',
    headers: uncachedResponseHeaders,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['error'],
          properties: { error: { type: 'string', example: error } },
          additionalProperties: false,
        },
        examples: {
          error: { summary: error, value: { error } },
        },
      },
    },
  }) satisfies OpenAPI.ResponseObject

const uncachedHeadErrorResponse = {
  description: 'The published catalog is unavailable. This response is never cacheable.',
  headers: uncachedResponseHeaders,
} satisfies OpenAPI.ResponseObject

const conditionalRequestParameter = {
  name: 'If-None-Match',
  in: 'header',
  required: false,
  description: 'A strong or weak ETag validator, a comma-separated validator list, or `*`.',
  schema: { type: 'string', example: exampleCatalogEtag },
  examples: {
    strong: { summary: 'Strong validator', value: exampleCatalogEtag },
    weak: { summary: 'Weak validator', value: `W/${exampleCatalogEtag}` },
    any: { summary: 'Any current representation', value: '*' },
  },
} satisfies OpenAPI.ParameterObject

const zodToJsonSchema = new ZodToJsonSchemaConverter()

export const addPublishedDxdataToOpenApi = (document: OpenAPI.Document): OpenAPI.Document => {
  const [, catalogSchema] = zodToJsonSchema.convert(PublishedDxdataCatalogSchema, { strategy: 'output' })

  document.components ??= {}
  document.components.schemas ??= {}
  document.components.schemas.PublishedDxdataCatalog = toOpenAPISchema(catalogSchema)
  document.paths ??= {}
  document.paths[DXDATA_PATH.replace('/api/v1', '')] = {
    get: {
      operationId: 'getPublishedDxdataCatalog',
      summary: 'Get the complete published DX data catalog',
      description:
        'Returns one schema-versioned, null-free immutable catalog document, including the tag and alias snapshot. Use `If-None-Match` or HEAD to avoid downloading an unchanged catalog.',
      tags: ['DX Data'],
      security: [],
      parameters: [conditionalRequestParameter],
      responses: {
        '200': {
          description: 'The complete published catalog.',
          headers: catalogResponseHeaders,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PublishedDxdataCatalog' },
              examples: {
                representativeCatalog: {
                  summary: 'Representative published catalog',
                  description: 'Large collections are shortened to one to three real entries.',
                  value: publishedDxdataCatalogExample,
                },
              },
            },
          },
        },
        '304': {
          description: 'The supplied validator matches the current published catalog.',
          headers: catalogResponseHeaders,
        },
        '500': uncachedErrorResponse('Internal server error'),
        '503': uncachedErrorResponse('DX data catalog is unavailable'),
      },
    },
    head: {
      operationId: 'headPublishedDxdataCatalog',
      summary: 'Get published DX data catalog metadata',
      description: 'Returns catalog headers without loading or returning the stored catalog body.',
      tags: ['DX Data'],
      security: [],
      parameters: [conditionalRequestParameter],
      responses: {
        '200': {
          description: 'Metadata for the complete published catalog.',
          headers: catalogResponseHeaders,
        },
        '304': {
          description: 'The supplied validator matches the current published catalog.',
          headers: catalogResponseHeaders,
        },
        '500': uncachedHeadErrorResponse,
        '503': uncachedHeadErrorResponse,
      },
    },
  }

  return document
}