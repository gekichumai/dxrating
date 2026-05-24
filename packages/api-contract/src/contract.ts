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
  sheetType: z.string(),
  sheetDifficulty: z.string(),
  tagId: z.number(),
})

export const CreateTagSongInputSchema = TagSongAttachSchema

export const CreateCommentInputSchema = z.object({
  songId: z.string(),
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
      .output(TrendingResponseSchema),
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