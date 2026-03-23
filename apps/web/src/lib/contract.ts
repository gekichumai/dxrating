import { oc } from '@orpc/contract'
import { z } from 'zod'

/**
 * A localized string is an object mapping language codes to translated strings.
 * Supported language codes: "en", "ja", "zh-Hans", "zh-Hant"
 */
export const LocalizedStringSchema = z
  .record(z.string(), z.string())
  .describe('Localized string. Keys are language codes: "en", "ja", "zh-Hans", "zh-Hant"')

// Define schemas matching the database/logic requirements
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

export const CreateTagSongInputSchema = z.object({
  songId: z.string(),
  sheetType: z.string(),
  sheetDifficulty: z.string(),
  tagId: z.number(),
})

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

export const TrendingResultSchema = z.object({
  songId: z.string(),
})

export const TrendingResponseSchema = z.object({
  results: z.array(TrendingResultSchema),
  dateFrom: z.string(),
  dateTo: z.string(),
})

export const appContract = oc.router({
  tags: {
    list: oc
      .route({
        method: 'GET',
        path: '/tags',
        summary: 'List all tags, groups, and song associations',
      })
      .output(TagsListResponseSchema),
    attach: oc
      .route({
        method: 'POST',
        path: '/tags/attach',
        summary: 'Attach a tag to a song sheet',
      })
      .input(CreateTagSongInputSchema)
      .output(z.object({ id: z.number() })),
  },
  comments: {
    create: oc
      .route({
        method: 'POST',
        path: '/comments',
        summary: 'Create a new comment',
      })
      .input(CreateCommentInputSchema)
      .output(CommentSchema),
    list: oc
      .route({
        method: 'GET',
        path: '/comments',
        summary: 'List comments for a specific song sheet',
      })
      .input(FetchCommentsInputSchema)
      .output(z.array(CommentWithProfileSchema)),
  },
  monitoring: {
    tunnel: oc
      .route({
        method: 'POST',
        path: '/monitoring/tunnel',
        summary: 'Sentry tunnel',
      })
      .input(
        z.object({
          envelope: z.string(),
        }),
      )
      .output(z.void()),
  },
  aliases: {
    list: oc
      .route({
        method: 'GET',
        path: '/aliases',
        summary: 'List all song aliases',
      })
      .output(
        z.array(
          z.object({
            song_id: z.string(),
            name: z.string(),
          }),
        ),
      ),
    create: oc
      .route({
        method: 'POST',
        path: '/aliases',
        summary: 'Create a new song alias',
      })
      .input(
        z.object({
          songId: z.string(),
          name: z.string(),
        }),
      )
      .output(z.object({ id: z.number() })),
  },
  analytics: {
    trending: oc
      .route({
        method: 'GET',
        path: '/analytics/trending',
        summary: 'Get trending sheets based on view counts',
      })
      .output(TrendingResponseSchema),
  },
  lxns: {
    authorize: oc
      .route({
        method: 'POST',
        path: '/io/import/lxns/authorize',
        summary: 'Get LXNS OAuth authorization URL',
      })
      .output(z.object({ url: z.string() })),
    status: oc
      .route({
        method: 'GET',
        path: '/io/import/lxns/status',
        summary: 'Check LXNS OAuth connection status',
      })
      .output(z.object({ connected: z.boolean() })),
    start: oc
      .route({
        method: 'POST',
        path: '/io/import/lxns/start',
        summary: 'Import scores from LXNS using stored OAuth token',
      })
      .output(
        z.object({
          scores: z.array(
            z.object({
              id: z.number(),
              songName: z.string(),
              level: z.string(),
              levelIndex: z.number(),
              achievements: z.number(),
              fc: z.string().nullable(),
              fs: z.string().nullable(),
              type: z.string(),
              dxScore: z.number().optional(),
            }),
          ),
          count: z.number(),
        }),
      ),
    disconnect: oc
      .route({
        method: 'POST',
        path: '/io/import/lxns/disconnect',
        summary: 'Disconnect LXNS account',
      })
      .output(z.object({ success: z.boolean() })),
  },
})