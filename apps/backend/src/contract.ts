import { publicContractRoutes, publicProcedure } from '@gekichumai/api-contract'
import { z } from 'zod'

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

const ChartOgImageInputSchema = z.object({
  songId: z.string(),
  type: z.string(),
  difficulty: z.string(),
})

const ChartOgImageOutputSchema = z.object({
  headers: z.record(z.string(), z.string()),
  body: z.instanceof(Blob),
})

export const appContract = publicProcedure.router({
  ...publicContractRoutes,
  maimai: {
    fetchRecords: publicProcedure
      .meta({ access: 'identity_independent' })
      .route({
        method: 'POST',
        path: '/io/import/maimai-net',
        summary: 'Fetch records from MaimaiNET',
        tags: ['Import'],
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
  chartOgImage: {
    render: publicProcedure
      .meta({ access: 'public_read' })
      .route({
        method: 'GET',
        path: '/songs/{songId}/{type}/{difficulty}/og-image',
        summary: 'Render chart OpenGraph image',
        tags: ['internal'],
        outputStructure: 'detailed',
      })
      .input(ChartOgImageInputSchema)
      .output(ChartOgImageOutputSchema),
  },
})