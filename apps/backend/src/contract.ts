import { oc } from '@orpc/contract'
import { z } from 'zod'
import { LxnsPlayerResponseSchema, LxnsScoreResponseSchema } from './services/functions/fetch-lxns-data'

const AchievementRecordSchema = z.object({
  sheet: z.object({
    songId: z.string(),
    type: z.string(),
    difficulty: z.string(),
  }),
  achievement: z.object({
    rate: z.number(),
    dxScore: z.object({
      achieved: z.number(),
      total: z.number(),
    }),
    flags: z.array(
      z.enum([
        'fullCombo',
        'fullCombo+',
        'allPerfect',
        'allPerfect+',
        'syncPlay',
        'fullSync',
        'fullSync+',
        'fullSyncDX',
        'fullSyncDX+',
      ]),
    ),
  }),
})

const MusicRecordSchema = AchievementRecordSchema
const RecentRecordSchema = AchievementRecordSchema.and(
  z.object({
    play: z.object({
      track: z.number(),
      timestamp: z.string().optional(),
    }),
  }),
)

// Define schemas matching the database/logic requirements
export const TagSchema = z.object({
  id: z.number(),
  localized_name: z.string(),
  localized_description: z.string(),
  group_id: z.number().nullable(),
})

export const TagGroupSchema = z.object({
  id: z.number(),
  localized_name: z.string(),
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

export const TagSongAttachSchema = z.object({
  songId: z.string(),
  sheetType: z.string(),
  sheetDifficulty: z.string(),
  tagId: z.number(),
})

export const MonitoringTunnelInputSchema = z.object({
  envelope: z.string(),
})

export const CreateAliasInputSchema = z.object({
  songId: z.string(),
  name: z.string(),
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
        summary: 'Attach a tag to a song',
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
      .input(MonitoringTunnelInputSchema)
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
      .input(CreateAliasInputSchema)
      .output(z.object({ id: z.number() })),
  },
  maimai: {
    fetchRecords: oc
      .route({
        method: 'POST',
        path: '/maimai/fetch-records',
        summary: 'Fetch records from MaimaiNET',
      })
      .input(
        z.object({
          id: z.string(),
          password: z.string(),
          region: z.enum(['jp', 'intl']),
        }),
      )
      .output(
        z.object({
          recentRecords: z.array(RecentRecordSchema),
          musicRecords: z.array(MusicRecordSchema),
        }),
      ),
  },
  lxns: {
    getPlayer: oc
      .route({
        method: 'GET',
        path: '/lxns/player',
        summary: 'Get player data from LXNS',
      })
      .input(z.object({ qq: z.string() }))
      .output(LxnsPlayerResponseSchema),
    getScores: oc
      .route({
        method: 'GET',
        path: '/lxns/scores',
        summary: 'Get scores from LXNS',
      })
      .input(z.object({ friendCode: z.string() }))
      .output(LxnsScoreResponseSchema),
  },
})
