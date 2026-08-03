import { toOpenAPISchema, type OpenAPI } from '@orpc/openapi'
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4'
import { z } from 'zod'
import { DXDATA_PATH } from './dxdata.js'

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

const catalogResponseHeaders = {
  'Content-Length': {
    description: 'UTF-8 byte length of the selected immutable catalog representation.',
    schema: { type: 'integer', minimum: 1 },
  },
  ETag: {
    description: 'Strong validator containing the SHA-256 digest of the response body.',
    schema: { type: 'string', pattern: '^"[0-9a-f]{64}"$' },
  },
  'Cache-Control': {
    description: 'Browser cache policy.',
    schema: { type: 'string' },
  },
  'CDN-Cache-Control': {
    description: 'Shared CDN cache policy.',
    schema: { type: 'string' },
  },
  'Cloudflare-CDN-Cache-Control': {
    description: 'Cloudflare-specific shared cache policy.',
    schema: { type: 'string' },
  },
  'Cache-Tag': {
    description: 'Surrogate cache tag used to invalidate the catalog.',
    schema: { type: 'string', enum: ['dxdata'] },
  },
} satisfies Record<string, OpenAPI.HeaderObject>

const uncachedResponseHeaders = {
  'Cache-Control': {
    description: 'Always `no-store` for endpoint failures.',
    schema: { type: 'string', enum: ['no-store'] },
  },
  'CDN-Cache-Control': {
    description: 'Always `no-store` for endpoint failures.',
    schema: { type: 'string', enum: ['no-store'] },
  },
  'Cloudflare-CDN-Cache-Control': {
    description: 'Always `no-store` for endpoint failures.',
    schema: { type: 'string', enum: ['no-store'] },
  },
} satisfies Record<string, OpenAPI.HeaderObject>

const uncachedErrorResponse = {
  description: 'The published catalog is unavailable. This response is never cacheable.',
  headers: uncachedResponseHeaders,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        required: ['error'],
        properties: { error: { type: 'string' } },
        additionalProperties: false,
      },
    },
  },
} satisfies OpenAPI.ResponseObject

const uncachedHeadErrorResponse = {
  description: 'The published catalog is unavailable. This response is never cacheable.',
  headers: uncachedResponseHeaders,
} satisfies OpenAPI.ResponseObject

const conditionalRequestParameter = {
  name: 'If-None-Match',
  in: 'header',
  required: false,
  description: 'A strong or weak ETag validator, a comma-separated validator list, or `*`.',
  schema: { type: 'string' },
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
        'Returns one schema-versioned, null-free immutable catalog document, including the tag and alias snapshot. Stored provenance and legacy identifiers are not exposed. Use `If-None-Match` or HEAD to avoid downloading an unchanged catalog.',
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
            },
          },
        },
        '304': {
          description: 'The supplied validator matches the current published catalog.',
          headers: catalogResponseHeaders,
        },
        '500': uncachedErrorResponse,
        '503': uncachedErrorResponse,
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