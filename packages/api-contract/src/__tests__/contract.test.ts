import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  ArcadeInstallationIdSchema,
  ArcadeVenueDetailInputSchema,
  ArcadeVenueIdSchema,
  CommentWithProfileSchema,
  publicAppContract,
  publicErrors,
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
    expect(Object.keys(publicAppContract)).toEqual(['tags', 'comments', 'aliases', 'analytics', 'arcades', 'lxns'])
    expect('maimai' in publicAppContract).toBe(false)
    expect('chartOgImage' in publicAppContract).toBe(false)
    expect('monitoring' in publicAppContract).toBe(false)
    expect('admin' in publicAppContract).toBe(false)
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