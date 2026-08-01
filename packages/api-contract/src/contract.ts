import { oc } from '@orpc/contract'
import { z } from 'zod'

/**
 * A localized string is an object mapping language codes to translated strings.
 * Supported language codes: "en", "ja", "zh-Hans", "zh-Hant"
 */
export const LocalizedStringSchema = z
  .record(z.string(), z.string())
  .describe('Localized string. Keys are language codes: "en", "ja", "zh-Hans", "zh-Hant"')

export const TagSchema = z.object({
  id: z.number(),
  localized_name: LocalizedStringSchema,
  localized_description: LocalizedStringSchema,
  group_id: z.number().nullable(),
})

export const TagGroupSchema = z.object({
  id: z.number(),
  localized_name: LocalizedStringSchema,
  color: z.string(),
})

export const TagSongSchema = z.object({
  song_id: z.string(),
  sheet_id: z.string().optional(),
  sheet_type: z.string(),
  sheet_difficulty: z.string(),
  tag_id: z.number(),
})

export const TagsListResponseSchema = z.object({
  tags: z.array(TagSchema),
  tagGroups: z.array(TagGroupSchema),
  tagSongs: z.array(TagSongSchema),
})

export const TagSongAttachSchema = z.object({
  songId: z.string(),
  sheetId: z.string().optional(),
  sheetType: z.string(),
  sheetDifficulty: z.string(),
  tagId: z.number(),
})

export const CreateTagSongInputSchema = TagSongAttachSchema

export const CreateCommentInputSchema = z.object({
  songId: z.string(),
  sheetId: z.string().optional(),
  sheetType: z.string(),
  sheetDifficulty: z.string(),
  parentId: z.number().optional(),
  content: z.string(),
})

export const CommentSchema = z.object({
  id: z.number(),
  created_at: z.date().or(z.string()),
})

export const FetchCommentsInputSchema = z.object({
  songId: z.string(),
  sheetId: z.string().optional(),
  sheetType: z.string(),
  sheetDifficulty: z.string(),
})

export const CommentWithProfileSchema = z.object({
  id: z.number(),
  parent_id: z.number().nullable(),
  created_at: z.date().or(z.string()),
  content: z.string(),
  display_name: z.string().nullable(),
})

export const CreateAliasInputSchema = z.object({
  songId: z.string(),
  name: z.string(),
})

export const AliasSchema = z.object({
  song_id: z.string(),
  name: z.string(),
})

export const TrendingResultSchema = z.object({
  songId: z.string(),
})

export const TrendingResponseSchema = z.object({
  results: z.array(TrendingResultSchema),
  dateFrom: z.string(),
  dateTo: z.string(),
})

export const CatalogIdSchemeInputSchema = z
  .object({
    idScheme: z.enum(['legacy', 'public']).optional(),
  })
  .optional()

export const LxnsScoreSchema = z.object({
  id: z.number(),
  songName: z.string(),
  level: z.string(),
  levelIndex: z.number(),
  achievements: z.number(),
  fc: z.string().nullable(),
  fs: z.string().nullable(),
  type: z.string(),
  dxScore: z.number().optional(),
})

export const LxnsStartOutputSchema = z.object({
  scores: z.array(LxnsScoreSchema),
  count: z.number(),
})

export const ArcadeGameSchema = z.object({
  id: z.string(),
  name: z.string(),
  manufacturer: z.string(),
})

export const ArcadeGamesListResponseSchema = z.object({
  items: z.array(ArcadeGameSchema),
})

export const ArcadeInstallationIdSchema = z.string().regex(/^dins_[23456789abcdefghjkmnpqrstvwxyz]{10}$/)
export const ArcadeVenueIdSchema = z.string().regex(/^dven_[23456789abcdefghjkmnpqrstvwxyz]{10}$/)

export const ArcadeInstallationSchema = z.object({
  id: ArcadeInstallationIdSchema,
  gameId: z.string(),
  gameName: z.string(),
  machineCount: z.number().int().nonnegative().optional(),
  version: z.string().optional(),
  cabinetModel: z.string().optional(),
  status: z.string().optional(),
  region: z.string().optional(),
  network: z.string().optional(),
  price: z.string().optional(),
  condition: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  observedAt: z.string().datetime(),
})

export const ArcadeChainSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string(),
  countryCodes: z.array(z.string()),
})

export const ArcadeVenueSchema = z.object({
  id: ArcadeVenueIdSchema,
  name: z.string(),
  chainId: z.string().optional(),
  countryCode: z.string().optional(),
  region: z.string().optional(),
  city: z.string().optional(),
  address: z.string().optional(),
  postalCode: z.string().optional(),
  phone: z.string().optional(),
  websiteUrl: z.string().optional(),
  timezone: z.string().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  installations: z.array(ArcadeInstallationSchema),
})

const ArcadeGamesFilterSchema = z
  .union([z.string(), z.array(z.string())])
  .transform((value) =>
    (Array.isArray(value) ? value : [value])
      .flatMap((item) => item.split(','))
      .map((item) => item.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.string().max(64)).min(1).max(20))

const ArcadeChainsFilterSchema = z
  .union([z.string(), z.array(z.string())])
  .transform((value) =>
    (Array.isArray(value) ? value : [value])
      .flatMap((item) => item.split(','))
      .map((item) => item.trim())
      .filter(Boolean),
  )
  .pipe(
    z
      .array(
        z
          .string()
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
          .max(64),
      )
      .min(1)
      .max(50),
  )

export const ArcadeVenuesListInputSchema = z
  .object({
    minLatitude: z.coerce.number().min(-90).max(90).optional(),
    minLongitude: z.coerce.number().min(-180).max(180).optional(),
    maxLatitude: z.coerce.number().min(-90).max(90).optional(),
    maxLongitude: z.coerce.number().min(-180).max(180).optional(),
    games: ArcadeGamesFilterSchema.optional(),
    chains: ArcadeChainsFilterSchema.optional(),
    query: z.string().trim().min(1).max(100).optional(),
    status: z.string().trim().min(1).max(64).optional(),
  })
  .superRefine((value, ctx) => {
    const bbox = [value.minLatitude, value.minLongitude, value.maxLatitude, value.maxLongitude]
    const supplied = bbox.filter((coordinate) => coordinate !== undefined).length
    if (supplied !== 0 && supplied !== bbox.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'All four bounding-box coordinates must be provided together',
        path: ['minLatitude'],
      })
    }
    if (value.minLatitude !== undefined && value.maxLatitude !== undefined && value.minLatitude > value.maxLatitude) {
      ctx.addIssue({
        code: 'custom',
        message: 'minLatitude must be less than or equal to maxLatitude',
        path: ['minLatitude'],
      })
    }
    if (
      value.minLongitude !== undefined &&
      value.maxLongitude !== undefined &&
      value.minLongitude > value.maxLongitude
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'minLongitude must be less than or equal to maxLongitude',
        path: ['minLongitude'],
      })
    }
  })

export const ArcadeVenuesListResponseSchema = z.object({
  items: z.array(ArcadeVenueSchema),
  chains: z.array(ArcadeChainSchema),
})

export const ArcadeVenueDetailInputSchema = z.object({
  id: ArcadeVenueIdSchema,
})

export const publicContractRoutes = {
  tags: {
    list: oc
      .route({
        method: 'GET',
        path: '/tags',
        summary: 'List all tags, groups, and song associations',
        tags: ['Tags'],
        spec: (spec) => ({ ...spec, security: [] }),
      })
      .input(CatalogIdSchemeInputSchema)
      .output(TagsListResponseSchema),
    attach: oc
      .route({
        method: 'POST',
        path: '/tags/attach',
        summary: 'Attach a tag to a song',
        tags: ['Tags'],
      })
      .input(TagSongAttachSchema)
      .output(z.object({ id: z.number() })),
  },
  comments: {
    create: oc
      .route({
        method: 'POST',
        path: '/comments',
        summary: 'Create a new comment',
        tags: ['Comments'],
      })
      .input(CreateCommentInputSchema)
      .output(CommentSchema),
    list: oc
      .route({
        method: 'GET',
        path: '/comments',
        summary: 'List comments for a specific song sheet',
        tags: ['Comments'],
        spec: (spec) => ({ ...spec, security: [] }),
      })
      .input(FetchCommentsInputSchema)
      .output(z.array(CommentWithProfileSchema)),
  },
  aliases: {
    list: oc
      .route({
        method: 'GET',
        path: '/aliases',
        summary: 'List all song aliases',
        tags: ['Aliases'],
        spec: (spec) => ({ ...spec, security: [] }),
      })
      .input(CatalogIdSchemeInputSchema)
      .output(z.array(AliasSchema)),
    create: oc
      .route({
        method: 'POST',
        path: '/aliases',
        summary: 'Create a new song alias',
        tags: ['Aliases'],
      })
      .input(CreateAliasInputSchema)
      .output(z.object({ id: z.number() })),
  },
  analytics: {
    trending: oc
      .route({
        method: 'GET',
        path: '/analytics/trending',
        summary: 'Get trending sheets based on view counts',
        tags: ['Analytics'],
        spec: (spec) => ({ ...spec, security: [] }),
      })
      .input(CatalogIdSchemeInputSchema)
      .output(TrendingResponseSchema),
  },
  arcades: {
    games: oc
      .route({
        method: 'GET',
        path: '/arcades/games',
        summary: 'List supported arcade games',
        tags: ['Arcades'],
        spec: (spec) => ({ ...spec, security: [] }),
      })
      .output(ArcadeGamesListResponseSchema),
    venues: oc
      .route({
        method: 'GET',
        path: '/arcades/venues',
        summary: 'List arcade venues',
        tags: ['Arcades'],
        spec: (spec) => ({ ...spec, security: [] }),
      })
      .input(ArcadeVenuesListInputSchema)
      .output(ArcadeVenuesListResponseSchema),
    venue: oc
      .route({
        method: 'GET',
        path: '/arcades/venues/{id}',
        summary: 'Get an arcade venue',
        tags: ['Arcades'],
        spec: (spec) => ({ ...spec, security: [] }),
      })
      .input(ArcadeVenueDetailInputSchema)
      .output(ArcadeVenueSchema),
  },
  lxns: {
    authorize: oc
      .route({
        method: 'POST',
        path: '/io/import/lxns/authorize',
        summary: 'Get LXNS OAuth authorization URL',
        tags: ['Import'],
      })
      .output(z.object({ url: z.string() })),
    status: oc
      .route({
        method: 'GET',
        path: '/io/import/lxns/status',
        summary: 'Check LXNS OAuth connection status',
        tags: ['Import'],
      })
      .output(z.object({ connected: z.boolean() })),
    start: oc
      .route({
        method: 'POST',
        path: '/io/import/lxns/start',
        summary: 'Import scores from LXNS using stored OAuth token',
        tags: ['Import'],
      })
      .output(LxnsStartOutputSchema),
    disconnect: oc
      .route({
        method: 'POST',
        path: '/io/import/lxns/disconnect',
        summary: 'Disconnect LXNS account',
        tags: ['Import'],
      })
      .output(z.object({ success: z.boolean() })),
  },
}

export const publicAppContract = oc.router(publicContractRoutes)