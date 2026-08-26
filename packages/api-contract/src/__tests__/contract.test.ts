import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  ArcadeInstallationIdSchema,
  ArcadeVenueDetailInputSchema,
  ArcadeVenueIdSchema,
  CHART_REPORT_CATEGORY_KEYS,
  CHART_REPORT_FIELD_KEYS,
  CHART_REPORT_TURNSTILE_ACTION,
  CHART_REPORT_VALUE_KINDS,
  chartReportContextErrors,
  chartReportErrors,
  CreateChartReportInputSchema,
  CreateChartReportOutputSchema,
  CommentWithProfileSchema,
  publicAppContract,
  publicErrors,
  ResolveChartReportContextInputSchema,
  ResolveChartReportContextOutputSchema,
  LxnsStartOutputSchema,
  PUBLIC_COMMENT_TOMBSTONE_CONTENT,
  PUBLIC_PROCEDURE_ACCESS_MODES,
} from '../contract.js'

const legacyCommentWithProfileSchema = z.object({
  id: z.number(),
  parent_id: z.number().nullable(),
  created_at: z.date().or(z.string()),
  content: z.string(),
  display_name: z.string().nullable(),
})

const collectAccessInventory = (
  node: Record<string, unknown>,
  prefix: readonly string[] = [],
): Record<string, string> => {
  const inventory: Record<string, string> = {}
  for (const [name, value] of Object.entries(node)) {
    if (!value || typeof value !== 'object') continue
    const candidate = value as Record<string, unknown>
    const definition = candidate['~orpc'] as
      | {
          readonly route?: unknown
          readonly meta?: { readonly access?: unknown }
        }
      | undefined
    const path = [...prefix, name]
    if (definition?.route) {
      inventory[path.join('.')] = String(definition.meta?.access)
      continue
    }
    Object.assign(inventory, collectAccessInventory(candidate, path))
  }
  return inventory
}

describe('publicAppContract', () => {
  it('classifies every procedure in the fail-closed access inventory', () => {
    const inventory = collectAccessInventory(publicAppContract)
    expect(inventory).toEqual({
      'aliases.create': 'authenticated_write',
      'aliases.list': 'public_read',
      'analytics.trending': 'public_read',
      'arcades.games': 'public_read',
      'arcades.venue': 'public_read',
      'arcades.venues': 'public_read',
      'chartReports.create': 'authenticated_write',
      'chartReports.resolveContext': 'authenticated_read',
      'comments.create': 'authenticated_write',
      'comments.list': 'public_read',
      'lxns.authorize': 'authenticated_write',
      'lxns.disconnect': 'authenticated_write',
      'lxns.start': 'authenticated_write',
      'lxns.status': 'authenticated_read',
      'tags.attach': 'authenticated_write',
      'tags.list': 'public_read',
    })
    expect(Object.values(inventory).every((access) => PUBLIC_PROCEDURE_ACCESS_MODES.includes(access as never))).toBe(
      true,
    )
  })

  it('exposes browser-callable routes without backend-only routes', () => {
    expect(Object.keys(publicAppContract)).toEqual([
      'chartReports',
      'tags',
      'comments',
      'aliases',
      'analytics',
      'arcades',
      'lxns',
    ])
    expect('maimai' in publicAppContract).toBe(false)
    expect('chartOgImage' in publicAppContract).toBe(false)
    expect('monitoring' in publicAppContract).toBe(false)
    expect('admin' in publicAppContract).toBe(false)
  })

  it('owns a strict, bounded chart-report submission payload without server-authoritative fields', () => {
    const input = CreateChartReportInputSchema.parse({
      songId: 'dsng_23456789ab',
      chartId: 'dsht_abcdefghjk',
      fieldKey: 'chart.multiver_internal_levels',
      category: 'incorrect_value',
      publicationRevision: '42',
      currentValue: { CiRCLE: 14.7 },
      proposedValue: null,
      explanation: 'The current release no longer contains this override.',
      sourceUrls: ['https://example.com/evidence'],
      turnstileToken: 'opaque-turnstile-token',
    })
    expect(input.fieldKey).toBe('chart.multiver_internal_levels')
    expect(input.proposedValue).toBeNull()
    expect(CHART_REPORT_FIELD_KEYS).toHaveLength(28)
    expect(CHART_REPORT_CATEGORY_KEYS).toEqual(['incorrect_value', 'missing_value', 'outdated_value', 'other'])

    for (const forbiddenKey of [
      'reporterUserId',
      'state',
      'publicationFingerprintSha256',
      'publicationCatalogRunId',
      'closedAt',
      'internalNote',
      'file',
    ]) {
      expect(
        CreateChartReportInputSchema.safeParse({
          ...input,
          [forbiddenKey]: 'forged',
        }).success,
      ).toBe(false)
    }
    expect(
      CreateChartReportInputSchema.safeParse({
        ...input,
        turnstileToken: 'x'.repeat(2_049),
      }).success,
    ).toBe(false)
    expect(
      CreateChartReportInputSchema.safeParse({
        ...input,
        publicationRevision: 'not-a-revision',
      }).success,
    ).toBe(false)
    expect(
      CreateChartReportInputSchema.safeParse({
        ...input,
        sourceUrls: Array(6).fill('https://example.com/'),
      }).success,
    ).toBe(false)
    expect(
      CreateChartReportInputSchema.safeParse({
        ...input,
        currentValue: 'x'.repeat(2_049),
      }).success,
    ).toBe(false)
    expect(
      CreateChartReportInputSchema.safeParse({
        ...input,
        currentValue: '漢'.repeat(2_048),
      }).success,
    ).toBe(false)
    expect(
      CreateChartReportInputSchema.safeParse({
        ...input,
        currentValue: Object.fromEntries(Array.from({ length: 101 }, (_, index) => [`version-${index}`, 14.7])),
      }).success,
    ).toBe(false)
    expect(
      CreateChartReportInputSchema.safeParse({
        ...input,
        currentValue: { ['漢'.repeat(256)]: 14.7 },
      }).success,
    ).toBe(false)
  })

  it('resolves one reportable field through a bounded authenticated public context contract', () => {
    expect(
      ResolveChartReportContextInputSchema.parse({
        songId: 'legacy-song-id',
        chartType: 'dx',
        chartDifficulty: 'master',
        fieldKey: 'chart.internal_level',
      }),
    ).toEqual({
      songId: 'legacy-song-id',
      chartType: 'dx',
      chartDifficulty: 'master',
      fieldKey: 'chart.internal_level',
    })
    expect(
      ResolveChartReportContextOutputSchema.parse({
        songId: 'dsng_23456789ab',
        chartId: 'dsht_abcdefghjk',
        fieldKey: 'chart.internal_level',
        publicationRevision: '42',
        currentValue: 14.8,
        valueKind: 'number',
      }),
    ).toEqual({
      songId: 'dsng_23456789ab',
      chartId: 'dsht_abcdefghjk',
      fieldKey: 'chart.internal_level',
      publicationRevision: '42',
      currentValue: 14.8,
      valueKind: 'number',
    })
    expect(
      ResolveChartReportContextInputSchema.safeParse({
        songId: 'x'.repeat(256),
        chartType: 'dx',
        chartDifficulty: 'master',
        fieldKey: 'chart.level',
      }).success,
    ).toBe(false)
    expect(
      ResolveChartReportContextInputSchema.safeParse({
        songId: 'legacy-song-id',
        chartType: 'dx',
        chartDifficulty: 'master',
        fieldKey: 'chart.level',
        chartId: 'dsht_abcdefghjk',
      }).success,
    ).toBe(false)
    expect(
      ResolveChartReportContextOutputSchema.safeParse({
        songId: 'dsng_23456789ab',
        chartId: 'dsht_abcdefghjk',
        fieldKey: 'chart.level',
        publicationRevision: '42',
        currentValue: '14+',
        valueKind: 'string',
        publicationFingerprintSha256: 'a'.repeat(64),
      }).success,
    ).toBe(false)
    expect(CHART_REPORT_VALUE_KINDS).toEqual([
      'string',
      'nullable_string',
      'number',
      'nullable_number',
      'integer',
      'nullable_integer',
      'boolean',
      'nullable_number_map',
    ])
    expect(CHART_REPORT_TURNSTILE_ACTION).toBe('chart-report')
    expect(chartReportContextErrors.CHART_REPORT_CONTEXT_NOT_FOUND).toEqual({
      status: 404,
      message: 'The requested chart report context was not found',
    })
  })

  it('returns only a minimal report receipt and declares typed safe failures', () => {
    expect(
      CreateChartReportOutputSchema.parse({
        id: '0198e8d1-e05f-7f7f-89ba-fbc33e4b0bd1',
        state: 'open',
        createdAt: '2026-08-24T12:00:00.000Z',
      }),
    ).toEqual({
      id: '0198e8d1-e05f-7f7f-89ba-fbc33e4b0bd1',
      state: 'open',
      createdAt: '2026-08-24T12:00:00.000Z',
    })
    expect(chartReportErrors.CHART_REPORT_STALE_PUBLICATION.status).toBe(409)
    expect(chartReportErrors.CHART_REPORT_RATE_LIMITED.status).toBe(429)
    expect(chartReportErrors.CHART_REPORT_RATE_LIMITED.data.keyof().options).toEqual(['retryAfterSeconds'])
    expect(JSON.stringify(chartReportErrors)).not.toMatch(/token|secret|reporter|email|internalNote/i)
    expect(Object.keys(publicAppContract.chartReports)).toEqual(['resolveContext', 'create'])
  })

  it('keeps removed comments compatible with existing required-string readers', () => {
    const publicComment = CommentWithProfileSchema.parse({
      id: 41,
      parent_id: 17,
      created_at: '2026-08-24T12:00:00.000Z',
      content: PUBLIC_COMMENT_TOMBSTONE_CONTENT,
      display_name: 'Previous author',
    })

    expect(PUBLIC_COMMENT_TOMBSTONE_CONTENT).toBe('[deleted]')
    expect(legacyCommentWithProfileSchema.parse(publicComment)).toEqual(publicComment)
    expect(
      CommentWithProfileSchema.safeParse({
        ...publicComment,
        content: undefined,
      }).success,
    ).toBe(false)
  })

  it('serializes only the stable public comment projection', () => {
    const publicComment = CommentWithProfileSchema.parse({
      id: 41,
      parent_id: null,
      created_at: '2026-08-24T12:00:00.000Z',
      content: PUBLIC_COMMENT_TOMBSTONE_CONTENT,
      display_name: null,
      original_body: 'retained original text',
      deletion_reason: 'private moderation reason',
      moderator_user_id: 'moderator-1',
      moderation_history: [{ action: 'delete' }],
      state_version: '99',
    })

    expect(publicComment).toEqual({
      id: 41,
      parent_id: null,
      created_at: '2026-08-24T12:00:00.000Z',
      content: PUBLIC_COMMENT_TOMBSTONE_CONTENT,
      display_name: null,
    })
    expect(Object.keys(CommentWithProfileSchema.shape)).toEqual([
      'id',
      'parent_id',
      'created_at',
      'content',
      'display_name',
    ])
    expect(Object.keys(publicAppContract.comments)).toEqual(['create', 'list'])
  })

  it('keeps public active-ban errors generic and free of moderation state', () => {
    expect(publicErrors.ACCOUNT_BANNED).toEqual({
      status: 403,
      message: 'This account is banned',
    })
    expect(publicErrors.ACCOUNT_BANNED).not.toHaveProperty('data')

    for (const procedure of Object.values(publicAppContract).flatMap((group) => Object.values(group))) {
      const error = procedure['~orpc'].errorMap.ACCOUNT_BANNED
      expect(error).toEqual({
        status: 403,
        message: 'This account is banned',
      })
      expect(error).not.toHaveProperty('data')
    }
  })

  it('owns shared route payload schemas', () => {
    expect(
      LxnsStartOutputSchema.parse({
        scores: [
          {
            id: 1,
            songName: 'Test Song',
            level: '14+',
            levelIndex: 3,
            achievements: 100.5,
            fc: null,
            fs: 'fs',
            type: 'dx',
          },
        ],
        count: 1,
      }),
    ).toEqual({
      scores: [
        {
          id: 1,
          songName: 'Test Song',
          level: '14+',
          levelIndex: 3,
          achievements: 100.5,
          fc: null,
          fs: 'fs',
          type: 'dx',
        },
      ],
      count: 1,
    })
  })

  it('accepts only typed public arcade record identifiers', () => {
    expect(ArcadeVenueIdSchema.parse('dven_23456789ab')).toBe('dven_23456789ab')
    expect(ArcadeInstallationIdSchema.parse('dins_cdefghjkmn')).toBe('dins_cdefghjkmn')
    expect(ArcadeVenueDetailInputSchema.parse({ id: 'dven_pqrstvwxyz' })).toEqual({ id: 'dven_pqrstvwxyz' })

    for (const invalid of ['123', 'dven_1234567890', 'dven_23456789ai', 'venue_23456789ab']) {
      expect(ArcadeVenueIdSchema.safeParse(invalid).success).toBe(false)
    }
    for (const invalid of ['501', 'dins_1234567890', 'dins_23456789ao', 'installation_23456789ab']) {
      expect(ArcadeInstallationIdSchema.safeParse(invalid).success).toBe(false)
    }
  })
})