import * as Sentry from '@sentry/node'
import { ORPCError, implement } from '@orpc/server'
import { TAG_SONG_HIDDEN_SCORE_THRESHOLD } from '@gekichumai/api-contract'
import { appContract } from './contract'
import { Database } from './db/index'
import { Clock, Data, Duration, Effect, Schema, Semaphore } from 'effect'
import { HttpBody, HttpClientResponse } from 'effect/http'
import type { RequestHeadersHandlerPluginContext, ResponseHeadersHandlerPluginContext } from '@orpc/server/plugins'
import type { ApplicationServices } from './runtime'
import { handlerGen, type WithEffectContext } from '@orpc/experimental-effect'
import { ApplicationCache } from './services/cache'
import { HttpClient } from './services/http-client'
import {
  tags,
  tagGroups,
  tagSongs,
  tagSongVotes,
  comments,
  commentReports,
  userBlocks,
  profiles,
  songAliases,
  arcadeGames,
  arcadeChains,
  arcadeVenues,
  arcadeInstallationIdentities,
  arcadeInstallations,
} from './db/schema'
import { eq, and, desc, asc, exists, gte, ilike, inArray, isNull, lte, notExists, or, sql, type SQL } from 'drizzle-orm'
import type { BackendAuth } from './auth'
import { AppConfig } from './config'
import { renderChartOgImageOutputEffect } from './services/functions/chart-og-image/index'
import { CatalogIdentityError } from './services/catalog-identities'
import { CatalogIdentities, McpCatalogSource } from './services/application'

export interface ApiContext
  extends
    WithEffectContext<ApplicationServices>,
    RequestHeadersHandlerPluginContext,
    ResponseHeadersHandlerPluginContext {
  user?: BackendAuth['$Infer']['Session']['user']
  signal?: AbortSignal
}

class UnauthorizedError extends Data.TaggedError('UnauthorizedError')<{ readonly message: string }> {
  constructor() {
    super({ message: 'Unauthorized' })
  }
}

export const withCatalogIdentityErrors = <A, R>(effect: Effect.Effect<A, CatalogIdentityError, R>) =>
  effect.pipe(
    Effect.mapError((error) => {
      const code = {
        bad_request: 'BAD_REQUEST',
        not_found: 'NOT_FOUND',
        unavailable: 'SERVICE_UNAVAILABLE',
      }[error.code] as 'BAD_REQUEST' | 'NOT_FOUND' | 'SERVICE_UNAVAILABLE'
      return new ORPCError(code, { message: error.message, cause: error })
    }),
  )

type TagsListResult = {
  tags: Array<{
    id: number
    localized_name: Record<string, string>
    localized_description: Record<string, string>
    group_id: number | null
  }>
  tagGroups: Array<{ id: number; localized_name: Record<string, string>; color: string }>
  tagSongs: Array<{
    song_id: string
    sheet_type: string
    sheet_difficulty: string
    tag_id: number
    score: number
  }>
}

type AliasListResult = Array<{ song_id: string; name: string }>
type TrendingCacheResult = {
  results: Array<{ songId: string; count: number }>
  dateFrom: string
  dateTo: string
}

const os = implement(appContract).$context<ApiContext>()

/** Window during which the creator of a tag-sheet association may remove it. */
const TAG_SONG_DETACH_WINDOW_MS = 60 * 60 * 1000

const tagSongScore = sql<number>`coalesce(sum(${tagSongVotes.value}), 0)::int`
const tagSongUpvotes = sql<number>`count(*) filter (where ${tagSongVotes.value} = 1)::int`
const tagSongDownvotes = sql<number>`count(*) filter (where ${tagSongVotes.value} = -1)::int`

type TagSongRow = typeof tagSongs.$inferSelect

/**
 * A legacy song ID rename can split one tag-sheet association across several
 * tag_songs rows. Every row for the same tag on the same sheet is treated as
 * one association, identified by its oldest (canonical) row.
 */
type TagSongGroup = { canonical: TagSongRow; rows: TagSongRow[]; ids: number[] }

const findTagSongGroups = Effect.fn('Tags.findGroups')(function* (tagSongIds: readonly number[]) {
  const database = yield* Database
  const catalogIdentities = yield* CatalogIdentities
  const groups = new Map<number, TagSongGroup>()
  if (tagSongIds.length === 0) return groups

  const requested = yield* database.query('Tags.findRequested', (db) =>
    db
      .select()
      .from(tagSongs)
      .where(inArray(tagSongs.id, [...tagSongIds])),
  )
  const bySheet = new Map<string, TagSongRow[]>()
  for (const row of requested) {
    const key = JSON.stringify([row.song_id, row.sheet_type, row.sheet_difficulty])
    bySheet.set(key, [...(bySheet.get(key) ?? []), row])
  }

  for (const rows of bySheet.values()) {
    const identity = yield* withCatalogIdentityErrors(
      catalogIdentities.resolveSheetInput({
        songId: rows[0].song_id,
        sheetType: rows[0].sheet_type,
        sheetDifficulty: rows[0].sheet_difficulty,
      }),
    )
    const siblings = yield* database.query('Tags.findSiblings', (db) =>
      db
        .select()
        .from(tagSongs)
        .where(
          and(
            inArray(tagSongs.song_id, identity.legacySongIds),
            eq(tagSongs.sheet_type, identity.sheetType),
            eq(tagSongs.sheet_difficulty, identity.sheetDifficulty),
            inArray(
              tagSongs.tag_id,
              rows.map((row) => row.tag_id),
            ),
          ),
        )
        .orderBy(tagSongs.id),
    )

    for (const row of rows) {
      const members = siblings.filter((sibling) => sibling.tag_id === row.tag_id)
      const groupRows = members.length > 0 ? members : [row]
      groups.set(row.id, { canonical: groupRows[0], rows: groupRows, ids: groupRows.map((member) => member.id) })
    }
  }
  return groups
})

const findTagSongGroup = (tagSongId: number) =>
  findTagSongGroups([tagSongId]).pipe(Effect.map((groups) => groups.get(tagSongId)))

const readTagSongVoteBreakdown = Effect.fn('Tags.readVoteBreakdown')(function* (group: TagSongGroup, userId: string) {
  const database = yield* Database
  const [breakdown] = yield* database.query('Tags.voteBreakdown', (db) =>
    db
      .select({
        upvotes: tagSongUpvotes,
        downvotes: tagSongDownvotes,
        score: tagSongScore,
      })
      .from(tagSongVotes)
      .where(inArray(tagSongVotes.tag_song_id, group.ids)),
  )

  const [userVote] = yield* database.query('Tags.userVote', (db) =>
    db
      .select({ value: tagSongVotes.value })
      .from(tagSongVotes)
      .where(and(inArray(tagSongVotes.tag_song_id, group.ids), eq(tagSongVotes.user_id, userId))),
  )

  return {
    tagSongId: group.canonical.id,
    upvotes: breakdown?.upvotes ?? 0,
    downvotes: breakdown?.downvotes ?? 0,
    score: breakdown?.score ?? 0,
    userVote: userVote?.value ?? null,
  }
})

// Scores of rows collapsed into one association add up: votes are kept to one
// per user per association (see tags.vote), so no voter is counted twice.
const sumTagSongScores = <T extends { score: number }>(kept: T, duplicate: T): T => ({
  ...kept,
  score: kept.score + duplicate.score,
})

// Quality gate: associations the community has buried never reach the global
// list, so filters and chips derived from it stay clean. It is applied only
// after collapsing, so a buried row cannot hide a live sibling or vice versa.
const isTagSongVisible = (tagSong: { score: number }) => tagSong.score > TAG_SONG_HIDDEN_SCORE_THRESHOLD

const tagsHandler = {
  list: os.tags.list.handler(
    handlerGen(function* ({ input }) {
      const database = yield* Database
      const cache = yield* ApplicationCache
      const catalogIdentities = yield* CatalogIdentities
      const cached = yield* cache.get<TagsListResult>('tags:list')
      let result: TagsListResult
      if (cached) {
        yield* Effect.sync(() => Sentry.metrics.count('cache.hit', 1, { attributes: { key: 'tags:list' } }))
        result = cached
      } else {
        yield* Effect.sync(() => Sentry.metrics.count('cache.miss', 1, { attributes: { key: 'tags:list' } }))

        const [allTags, allGroups, allTagSongs] = yield* Effect.all(
          [
            database.query('Tags.list', (db) =>
              db
                .select({
                  id: tags.id,
                  localized_name: tags.localized_name,
                  localized_description: tags.localized_description,
                  group_id: tags.group_id,
                })
                .from(tags),
            ),
            database.query('Tags.listGroups', (db) =>
              db
                .select({
                  id: tagGroups.id,
                  localized_name: tagGroups.localized_name,
                  color: tagGroups.color,
                })
                .from(tagGroups),
            ),
            database.query('Tags.listSongTags', (db) =>
              db
                .select({
                  song_id: tagSongs.song_id,
                  sheet_type: tagSongs.sheet_type,
                  sheet_difficulty: tagSongs.sheet_difficulty,
                  tag_id: tagSongs.tag_id,
                  score: tagSongScore,
                })
                .from(tagSongs)
                .leftJoin(tagSongVotes, eq(tagSongVotes.tag_song_id, tagSongs.id))
                .groupBy(tagSongs.id)
                .orderBy(tagSongs.id),
            ),
          ],
          { concurrency: 'unbounded' },
        )

        result = {
          tags: allTags,
          tagGroups: allGroups,
          tagSongs: allTagSongs,
        }
        yield* cache.set('tags:list', result)
      }

      // The cache holds raw per-row scores; collapsing and gating happen per
      // request so they always use the current catalog snapshot.
      const collapsed = yield* withCatalogIdentityErrors(
        catalogIdentities.collapseLegacyTagSongs(result.tagSongs, sumTagSongScores),
      )

      if (input?.idScheme === 'public') {
        const tagSongs = yield* withCatalogIdentityErrors(
          catalogIdentities.translateTagSongsToPublic(collapsed, sumTagSongScores),
        )
        return { ...result, tagSongs: tagSongs.filter(isTagSongVisible) }
      }
      return { ...result, tagSongs: collapsed.filter(isTagSongVisible) }
    }),
  ),
  attach: os.tags.attach.handler(
    handlerGen(function* ({ input, context }) {
      const database = yield* Database
      const cache = yield* ApplicationCache
      const catalogIdentities = yield* CatalogIdentities
      const user = context.user
      if (!user) return yield* new UnauthorizedError()

      const identity = yield* withCatalogIdentityErrors(catalogIdentities.resolveSheetInput(input))

      const existing = yield* database.query('Tags.findAttachment', (db) =>
        db
          .select()
          .from(tagSongs)
          .where(
            and(
              inArray(tagSongs.song_id, identity.legacySongIds),
              eq(tagSongs.sheet_type, identity.sheetType),
              eq(tagSongs.sheet_difficulty, identity.sheetDifficulty),
              eq(tagSongs.tag_id, input.tagId),
            ),
          )
          .orderBy(tagSongs.id),
      )

      if (existing.length > 0) return { id: existing[0].id }

      const res = yield* database
        .transaction((tx) =>
          Effect.gen(function* () {
            const inserted = yield* database.query('Tags.attach', () =>
              tx
                .insert(tagSongs)
                .values({
                  song_id: identity.legacySongId,
                  sheet_type: identity.sheetType,
                  sheet_difficulty: identity.sheetDifficulty,
                  tag_id: input.tagId,
                  created_by: user.id,
                })
                .returning({ id: tagSongs.id }),
            )
            // Attaching a tag is itself an endorsement, so the creator starts it at +1.
            yield* database.query('Tags.attachCreatorVote', () =>
              tx
                .insert(tagSongVotes)
                .values({ tag_song_id: inserted[0].id, user_id: user.id, value: 1 })
                .onConflictDoNothing(),
            )
            return inserted
          }),
        )
        .pipe(
          Effect.tap(() => cache.delete('tags:list')),
          Effect.uninterruptible,
        )

      return res[0]
    }),
  ),
  sheetTags: os.tags.sheetTags.handler(
    handlerGen(function* ({ input }) {
      const database = yield* Database
      const catalogIdentities = yield* CatalogIdentities
      const identity = yield* withCatalogIdentityErrors(catalogIdentities.resolveSheetInput(input))

      // Grouped by tag rather than by row, so an association split across legacy
      // IDs by a rename surfaces once, under its canonical (oldest) row.
      const rows = yield* database.query('Tags.sheetTags', (db) =>
        db
          .select({
            id: sql<number>`min(${tagSongs.id})`.mapWith(tagSongs.id),
            tag_id: tagSongs.tag_id,
            created_at: sql<Date>`(array_agg(${tagSongs.created_at} order by ${tagSongs.id}))[1]`.mapWith(
              tagSongs.created_at,
            ),
            created_by: sql<string>`(array_agg(${tagSongs.created_by} order by ${tagSongs.id}))[1]`,
            upvotes: tagSongUpvotes,
            downvotes: tagSongDownvotes,
            score: tagSongScore,
          })
          .from(tagSongs)
          .leftJoin(tagSongVotes, eq(tagSongVotes.tag_song_id, tagSongs.id))
          .where(
            and(
              inArray(tagSongs.song_id, identity.legacySongIds),
              eq(tagSongs.sheet_type, identity.sheetType),
              eq(tagSongs.sheet_difficulty, identity.sheetDifficulty),
            ),
          )
          .groupBy(tagSongs.tag_id)
          .orderBy(sql`min(${tagSongs.id})`),
      )

      // Unlike tags.list this endpoint returns buried associations too, so the
      // sheet view can offer them behind a "hidden tags" disclosure.
      return rows.map((row) => ({
        ...row,
        song_id: input.songId,
        sheet_id: input.sheetId,
        sheet_type: input.sheetType,
        sheet_difficulty: input.sheetDifficulty,
      }))
    }),
  ),
  vote: os.tags.vote.handler(
    handlerGen(function* ({ input, context }) {
      const database = yield* Database
      const cache = yield* ApplicationCache
      const user = context.user
      if (!user) return yield* new UnauthorizedError()

      const group = yield* findTagSongGroup(input.tagSongId)
      if (!group) return yield* Effect.fail(new ORPCError('NOT_FOUND', { message: 'Tag association not found' }))

      // Votes always land on the canonical row, and any the user left on sibling
      // rows are dropped, keeping one vote per user per association.
      const siblingIds = group.ids.filter((id) => id !== group.canonical.id)
      yield* database
        .transaction((tx) =>
          Effect.gen(function* () {
            if (siblingIds.length > 0) {
              yield* database.query('Tags.dropSiblingVotes', () =>
                tx
                  .delete(tagSongVotes)
                  .where(and(eq(tagSongVotes.user_id, user.id), inArray(tagSongVotes.tag_song_id, siblingIds))),
              )
            }
            yield* database.query('Tags.vote', () =>
              tx
                .insert(tagSongVotes)
                .values({ tag_song_id: group.canonical.id, user_id: user.id, value: input.value })
                .onConflictDoUpdate({
                  target: [tagSongVotes.tag_song_id, tagSongVotes.user_id],
                  set: { value: input.value },
                }),
            )
          }),
        )
        .pipe(
          // A vote can push an association across the visibility threshold.
          Effect.tap(() => cache.delete('tags:list')),
          Effect.uninterruptible,
        )

      return yield* readTagSongVoteBreakdown(group, user.id)
    }),
  ),
  userVotes: os.tags.userVotes.handler(
    handlerGen(function* ({ input, context }) {
      const database = yield* Database
      const user = context.user
      if (!user) return yield* new UnauthorizedError()

      const groups = yield* findTagSongGroups(input.tagSongIds)
      const groupIds = [...groups.values()].flatMap((group) => group.ids)
      if (groupIds.length === 0) return {}

      const votes = yield* database.query('Tags.userVotes', (db) =>
        db
          .select({ tag_song_id: tagSongVotes.tag_song_id, value: tagSongVotes.value })
          .from(tagSongVotes)
          .where(and(eq(tagSongVotes.user_id, user.id), inArray(tagSongVotes.tag_song_id, groupIds)))
          .orderBy(desc(tagSongVotes.id)),
      )

      // Keyed by the id the caller asked about; a vote on any row of that
      // association counts, with the most recent winning.
      const result: Record<string, number> = {}
      for (const [requestedId, group] of groups) {
        const vote = votes.find((candidate) => group.ids.includes(candidate.tag_song_id))
        if (vote) result[String(requestedId)] = vote.value
      }
      return result
    }),
  ),
  detach: os.tags.detach.handler(
    handlerGen(function* ({ input, context }) {
      const database = yield* Database
      const cache = yield* ApplicationCache
      const user = context.user
      if (!user) return yield* new UnauthorizedError()

      const group = yield* findTagSongGroup(input.tagSongId)
      if (!group) return yield* Effect.fail(new ORPCError('NOT_FOUND', { message: 'Tag association not found' }))
      // Removing an association removes every row it spans, so the caller must
      // have created all of them; nobody can take down someone else's row.
      if (group.rows.some((row) => row.created_by !== user.id)) {
        return yield* Effect.fail(
          new ORPCError('FORBIDDEN', { message: 'Only the creator of a tag association may remove it' }),
        )
      }
      // Rows are ordered oldest first, so the canonical row bounds the window.
      const now = yield* Clock.currentTimeMillis
      if (now - group.canonical.created_at.getTime() > TAG_SONG_DETACH_WINDOW_MS) {
        return yield* Effect.fail(
          new ORPCError('FORBIDDEN', {
            message: 'Tag associations can only be removed within an hour of being created',
          }),
        )
      }

      // Votes are removed by the tag_song_votes foreign key cascade.
      yield* database
        .query('Tags.detach', (db) => db.delete(tagSongs).where(inArray(tagSongs.id, group.ids)))
        .pipe(
          Effect.tap(() => cache.delete('tags:list')),
          Effect.uninterruptible,
        )

      return { success: true }
    }),
  ),
}

const moderateComment = Effect.fn('Comments.moderate')(function* (
  viewerId: string | undefined,
  commentId: number,
  action: 'report' | 'block',
) {
  if (!viewerId) return yield* Effect.fail(new ORPCError('UNAUTHORIZED'))
  const database = yield* Database
  const result = yield* database.transaction((tx) =>
    Effect.gen(function* () {
      const [comment] = yield* database.query('Comments.findAuthor', () =>
        tx
          .select({ authorId: comments.created_by, content: comments.content })
          .from(comments)
          .where(eq(comments.id, commentId))
          .for('share'),
      )
      if (!comment) return yield* Effect.fail(new ORPCError('NOT_FOUND', { message: 'Comment not found' }))
      if (comment.authorId === viewerId)
        return yield* Effect.fail(new ORPCError('BAD_REQUEST', { message: 'Cannot report or block yourself' }))
      yield* database.query('Comments.report', () =>
        tx
          .insert(commentReports)
          .values({ reporter_id: viewerId, comment_id: commentId, action })
          .onConflictDoNothing(),
      )
      if (action === 'block') {
        yield* database.query('Comments.blockAuthor', () =>
          tx.insert(userBlocks).values({ blocker_id: viewerId, blocked_id: comment.authorId }).onConflictDoNothing(),
        )
      }
      return { success: true, author_id: comment.authorId, content: comment.content }
    }),
  )
  // Every report/block reaches the operator (App Review guideline 1.2): one Sentry issue per
  // comment, so the first report alerts and repeats group under it. Triage with moderate-comments.ts.
  yield* Effect.sync(() =>
    Sentry.captureMessage(`Comment ${action === 'block' ? 'author blocked' : 'reported'}: #${commentId}`, {
      level: 'warning',
      fingerprint: ['comment-moderation', String(commentId)],
      tags: { moderation_action: action, comment_id: String(commentId) },
      extra: { commentId, authorId: result.author_id, reporterId: viewerId, content: result.content.slice(0, 500) },
    }),
  )
  return { success: result.success, author_id: result.author_id }
})

const commentsHandler = {
  report: os.comments.report.handler(
    handlerGen(function* ({ input, context }) {
      return yield* moderateComment(context.user?.id, input.commentId, 'report')
    }),
  ),
  blockAuthor: os.comments.blockAuthor.handler(
    handlerGen(function* ({ input, context }) {
      return yield* moderateComment(context.user?.id, input.commentId, 'block')
    }),
  ),
  create: os.comments.create.handler(
    handlerGen(function* ({ input, context }) {
      const database = yield* Database
      const catalogIdentities = yield* CatalogIdentities
      const user = context.user
      if (!user) {
        return yield* new UnauthorizedError()
      }

      const identity = yield* withCatalogIdentityErrors(catalogIdentities.resolveSheetInput(input))

      const parentId = input.parentId
      if (parentId !== undefined) {
        const [parent] = yield* database.query('Comments.findParent', (db) =>
          db
            .select({
              song_id: comments.song_id,
              sheet_type: comments.sheet_type,
              sheet_difficulty: comments.sheet_difficulty,
            })
            .from(comments)
            .where(eq(comments.id, parentId))
            .limit(1),
        )
        if (!parent) {
          return yield* Effect.fail(new ORPCError('NOT_FOUND', { message: 'Parent comment not found' }))
        }
        if (
          !identity.legacySongIds.includes(parent.song_id) ||
          parent.sheet_type !== identity.sheetType ||
          parent.sheet_difficulty !== identity.sheetDifficulty
        ) {
          return yield* Effect.fail(
            new ORPCError('BAD_REQUEST', { message: 'Parent comment belongs to a different chart' }),
          )
        }
      }

      const newComment = yield* database.query('Comments.create', (db) =>
        db
          .insert(comments)
          .values({
            song_id: identity.legacySongId,
            sheet_type: identity.sheetType,
            sheet_difficulty: identity.sheetDifficulty,
            parent_id: input.parentId,
            content: input.content,
            created_by: user.id,
          })
          .returning({ id: comments.id, created_at: comments.created_at }),
      )

      return newComment[0]
    }),
  ),
  list: os.comments.list.handler(
    handlerGen(function* ({ input, context }) {
      const database = yield* Database
      const catalogIdentities = yield* CatalogIdentities
      const viewerId = context.user?.id
      const identity = yield* withCatalogIdentityErrors(catalogIdentities.resolveSheetInput(input))
      const result = yield* database.query('Comments.list', (db) =>
        db
          .select({
            id: comments.id,
            author_id: comments.created_by,
            parent_id: comments.parent_id,
            created_at: comments.created_at,
            content: comments.content,
            display_name: profiles.display_name,
          })
          .from(comments)
          .leftJoin(profiles, eq(profiles.id, comments.created_by))
          .where(
            and(
              isNull(comments.removed_at),
              viewerId
                ? notExists(
                    db
                      .select({ id: commentReports.id })
                      .from(commentReports)
                      .where(and(eq(commentReports.reporter_id, viewerId), eq(commentReports.comment_id, comments.id))),
                  )
                : undefined,
              viewerId
                ? notExists(
                    db
                      .select({ id: userBlocks.blocked_id })
                      .from(userBlocks)
                      .where(and(eq(userBlocks.blocker_id, viewerId), eq(userBlocks.blocked_id, comments.created_by))),
                  )
                : undefined,
              inArray(comments.song_id, identity.legacySongIds),
              eq(comments.sheet_type, identity.sheetType),
              eq(comments.sheet_difficulty, identity.sheetDifficulty),
            ),
          )
          .orderBy(desc(comments.created_at)),
      )

      return result
    }),
  ),
}

const aliasesHandler = {
  list: os.aliases.list.handler(
    handlerGen(function* ({ input }) {
      const database = yield* Database
      const cache = yield* ApplicationCache
      const catalogIdentities = yield* CatalogIdentities
      const cached = yield* cache.get<AliasListResult>('aliases:list')
      let result: AliasListResult
      if (cached) {
        yield* Effect.sync(() => Sentry.metrics.count('cache.hit', 1, { attributes: { key: 'aliases:list' } }))
        result = cached
      } else {
        yield* Effect.sync(() => Sentry.metrics.count('cache.miss', 1, { attributes: { key: 'aliases:list' } }))

        result = yield* database.query('Aliases.list', (db) =>
          db
            .select({
              song_id: songAliases.song_id,
              name: songAliases.name,
            })
            .from(songAliases),
        )

        yield* cache.set('aliases:list', result)
      }

      if (input?.idScheme === 'public') {
        const publicIds = yield* withCatalogIdentityErrors(
          catalogIdentities.translateSongIdsToPublic(result.map((alias) => alias.song_id)),
        )
        return result.flatMap((alias) => {
          const songId = publicIds.get(alias.song_id)
          return songId === undefined ? [] : [{ ...alias, song_id: songId }]
        })
      }
      return result
    }),
  ),
  create: os.aliases.create.handler(
    handlerGen(function* ({ input, context }) {
      const database = yield* Database
      const cache = yield* ApplicationCache
      const catalogIdentities = yield* CatalogIdentities
      const user = context.user
      if (!user) return yield* new UnauthorizedError()

      const identity = yield* withCatalogIdentityErrors(catalogIdentities.resolveSongInput(input.songId))

      const res = yield* database
        .query('Aliases.create', (db) =>
          db
            .insert(songAliases)
            .values({
              song_id: identity.legacySongId,
              name: input.name,
              created_by: user.id,
            })
            .returning({ id: songAliases.id }),
        )
        .pipe(
          Effect.tap(() => cache.delete('aliases:list')),
          Effect.uninterruptible,
        )

      return res[0]
    }),
  ),
}

import { netGatewayStatusEffect, withMaimaiNETClient, type NetGatewayStatus } from './lib/functions/client'
import { recordNetFailure, recordNetSuccess } from './services/functions/fetch-net-records/telemetry'
import * as lxnsService from './services/lxns/index'

const TrendingSeriesSchema = Schema.Struct({
  breakdown_value: Schema.optional(Schema.Unknown),
  aggregated_value: Schema.optional(Schema.Finite),
})
const TrendingResponseSchema = Schema.Struct({
  results: Schema.Array(Schema.Union([TrendingSeriesSchema, Schema.Array(TrendingSeriesSchema)])),
})

const queryTrending = Effect.fn('Analytics.queryTrending')(function* (projectId: string, apiKey: string) {
  const http = yield* HttpClient
  const response = yield* http.post(`https://us.posthog.com/api/projects/${projectId}/query/`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: HttpBody.jsonUnsafe({
      query: {
        kind: 'TrendsQuery',
        series: [{ kind: 'EventsNode', event: 'sheet_content_viewed', math: 'total' }],
        breakdownFilter: { breakdowns: [{ property: 'song_id', type: 'event' }] },
        dateRange: { date_from: '-7d' },
        interval: 'day',
        filterTestAccounts: true,
      },
    }),
  })
  if (response.status < 200 || response.status >= 300) {
    yield* Effect.sync(() => Sentry.captureException(new Error(`PostHog query failed: ${response.status}`)))
    return undefined
  }
  return yield* HttpClientResponse.schemaBodyJson(TrendingResponseSchema)(response)
}, Effect.scoped)

const analyticsHandler = {
  trending: os.analytics.trending.handler(
    handlerGen(function* ({ input }) {
      const cache = yield* ApplicationCache
      const catalogIdentities = yield* CatalogIdentities
      const config = yield* AppConfig
      const cacheKey = 'analytics:trending'
      const cached = yield* cache.get<TrendingCacheResult>(cacheKey)
      let result: TrendingCacheResult
      if (cached) {
        yield* Effect.sync(() => Sentry.metrics.count('cache.hit', 1, { attributes: { key: cacheKey } }))
        result = cached
      } else {
        yield* Effect.sync(() => Sentry.metrics.count('cache.miss', 1, { attributes: { key: cacheKey } }))

        const { projectId, apiKey } = config.posthog
        if (!projectId || !apiKey) {
          result = { results: [], dateFrom: '', dateTo: '' }
        } else {
          const data = yield* queryTrending(projectId, apiKey)
          if (!data) {
            result = { results: [], dateFrom: '', dateTo: '' }
          } else {
            const series = data.results.flat()

            const songCounts = new Map<string, number>()
            for (const s of series) {
              if (!s.breakdown_value) continue
              const songId = String(s.breakdown_value)
              if (songId === '$$_posthog_breakdown_other_$$') continue
              const total = s.aggregated_value ?? 0
              songCounts.set(songId, (songCounts.get(songId) ?? 0) + total)
            }

            const results = [...songCounts.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([songId, count]) => ({ songId, count }))

            const now = new Date(yield* Clock.currentTimeMillis)
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
            result = {
              results,
              dateFrom: weekAgo.toISOString().split('T')[0],
              dateTo: now.toISOString().split('T')[0],
            }
            yield* cache.set(cacheKey, result, 60 * 60 * 1000) // 1 hour TTL
          }
        }
      }

      if (input?.idScheme === 'public') {
        const results = yield* withCatalogIdentityErrors(catalogIdentities.translateSongCountsToPublic(result.results))
        return {
          ...result,
          results: results.map(({ songId }) => ({ songId })),
        }
      }
      return { ...result, results: result.results.map(({ songId }) => ({ songId })) }
    }),
  ),
}

type ArcadeInstallationResponse = {
  id: string
  gameId: string
  gameName: string
  machineCount?: number
  version?: string
  cabinetModel?: string
  status?: string
  region?: string
  network?: string
  price?: string
  condition?: string
  confidence?: number
  observedAt: string
}

function normalizeArcadeSearch(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function escapeArcadeSearch(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')
}

const loadArcadeInstallations = Effect.fn('Arcades.loadInstallations')(function* (venueIds: bigint[]) {
  const database = yield* Database
  const grouped = new Map<string, ArcadeInstallationResponse[]>()
  if (venueIds.length === 0) return grouped

  const rows = yield* database.query('Arcades.loadInstallations', (db) =>
    db
      .select({
        id: arcadeInstallations.id,
        installationIdentityId: arcadeInstallations.installation_identity_id,
        publicId: arcadeInstallationIdentities.public_id,
        venueId: arcadeInstallations.venue_id,
        gameId: arcadeInstallations.game_id,
        gameName: arcadeGames.name,
        machineCount: arcadeInstallations.machine_count,
        version: arcadeInstallations.version,
        cabinetModel: arcadeInstallations.cabinet_model,
        status: arcadeInstallations.status,
        region: arcadeInstallations.region,
        network: arcadeInstallations.network,
        price: arcadeInstallations.price,
        condition: arcadeInstallations.condition,
        confidence: arcadeInstallations.confidence,
        observedAt: arcadeInstallations.observed_at,
        source: arcadeInstallations.source,
      })
      .from(arcadeInstallations)
      .innerJoin(
        arcadeInstallationIdentities,
        eq(arcadeInstallationIdentities.id, arcadeInstallations.installation_identity_id),
      )
      .innerJoin(arcadeGames, eq(arcadeGames.id, arcadeInstallations.game_id))
      .where(and(inArray(arcadeInstallations.venue_id, venueIds), isNull(arcadeInstallations.absent_since)))
      .orderBy(
        asc(arcadeInstallations.venue_id),
        asc(arcadeGames.name),
        asc(arcadeInstallations.game_id),
        asc(arcadeInstallations.region),
        asc(arcadeInstallations.network),
        asc(arcadeInstallations.version),
        asc(arcadeInstallations.cabinet_model),
        asc(arcadeInstallations.source),
        asc(arcadeInstallations.id),
      ),
  )

  const logicalInstallations = new Map<string, Array<(typeof rows)[number]>>()

  for (const row of rows) {
    const identity = row.installationIdentityId.toString()
    const existing = logicalInstallations.get(identity)
    if (!existing) {
      logicalInstallations.set(identity, [row])
      continue
    }
    existing.push(row)
  }

  type InstallationRow = (typeof rows)[number]
  const compareCandidates = (left: InstallationRow, right: InstallationRow) => {
    const confidence = (right.confidence ?? -1) - (left.confidence ?? -1)
    if (confidence !== 0) return confidence

    const observedAt = right.observedAt.getTime() - left.observedAt.getTime()
    if (observedAt !== 0) return observedAt

    const source = left.source.localeCompare(right.source)
    if (source !== 0) return source

    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
  }
  const compareFreshness = (left: InstallationRow, right: InstallationRow) => {
    const observedAt = right.observedAt.getTime() - left.observedAt.getTime()
    if (observedAt !== 0) return observedAt

    const source = left.source.localeCompare(right.source)
    if (source !== 0) return source

    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
  }
  const selectFact = <T>(
    candidates: InstallationRow[],
    read: (candidate: InstallationRow) => T | null,
  ): T | undefined => {
    const selected = candidates.filter((candidate) => read(candidate) !== null).sort(compareCandidates)[0]
    return selected ? (read(selected) ?? undefined) : undefined
  }

  for (const candidates of logicalInstallations.values()) {
    const winner = [...candidates].sort(compareCandidates)[0]
    const freshest = [...candidates].sort(compareFreshness)[0]
    const venueId = winner.venueId.toString()
    const installations = grouped.get(venueId) ?? []
    installations.push({
      id: winner.publicId,
      gameId: winner.gameId,
      gameName: winner.gameName,
      machineCount: selectFact(candidates, (candidate) => candidate.machineCount),
      version: winner.version ?? undefined,
      cabinetModel: winner.cabinetModel ?? undefined,
      status: selectFact(candidates, (candidate) => candidate.status),
      region: winner.region ?? undefined,
      network: winner.network ?? undefined,
      price: selectFact(candidates, (candidate) => candidate.price),
      condition: selectFact(candidates, (candidate) => candidate.condition),
      confidence: selectFact(candidates, (candidate) => candidate.confidence),
      observedAt: freshest.observedAt.toISOString(),
    })
    grouped.set(venueId, installations)
  }

  return grouped
})

function serializeArcadeVenue(
  venue: typeof arcadeVenues.$inferSelect,
  installations: Map<string, ArcadeInstallationResponse[]>,
) {
  const internalId = venue.id.toString()
  return {
    id: venue.public_id,
    name: venue.name,
    chainId: venue.chain_id ?? undefined,
    countryCode: venue.country_code ?? undefined,
    region: venue.region ?? undefined,
    city: venue.city ?? undefined,
    address: venue.address ?? undefined,
    postalCode: venue.postal_code ?? undefined,
    phone: venue.phone ?? undefined,
    websiteUrl: venue.website_url ?? undefined,
    timezone: venue.timezone ?? undefined,
    latitude: venue.latitude ?? undefined,
    longitude: venue.longitude ?? undefined,
    installations: installations.get(internalId) ?? [],
  }
}

const arcadesHandler = {
  games: os.arcades.games.handler(
    handlerGen(function* () {
      const database = yield* Database
      const items = yield* database.query('Arcades.listGames', (db) =>
        db
          .select({
            id: arcadeGames.id,
            name: arcadeGames.name,
            manufacturer: arcadeGames.manufacturer,
          })
          .from(arcadeGames)
          .where(eq(arcadeGames.active, true))
          .orderBy(asc(arcadeGames.name), asc(arcadeGames.id)),
      )

      return { items }
    }),
  ),
  venues: os.arcades.venues.handler(
    handlerGen(function* ({ input }) {
      const database = yield* Database
      const db = database.db
      const filters: SQL[] = []

      if (
        input.minLatitude !== undefined &&
        input.minLongitude !== undefined &&
        input.maxLatitude !== undefined &&
        input.maxLongitude !== undefined
      ) {
        filters.push(
          gte(arcadeVenues.latitude, input.minLatitude),
          lte(arcadeVenues.latitude, input.maxLatitude),
          gte(arcadeVenues.longitude, input.minLongitude),
          lte(arcadeVenues.longitude, input.maxLongitude),
        )
      }

      if (input.query) {
        const pattern = `%${escapeArcadeSearch(input.query)}%`
        const normalized = normalizeArcadeSearch(input.query)
        const normalizedPattern = normalized ? `%${escapeArcadeSearch(normalized)}%` : undefined
        filters.push(
          or(
            ilike(arcadeVenues.name, pattern),
            ilike(arcadeVenues.address, pattern),
            ilike(arcadeVenues.city, pattern),
            ilike(arcadeVenues.region, pattern),
            normalizedPattern ? ilike(arcadeVenues.normalized_name, normalizedPattern) : undefined,
            normalizedPattern ? ilike(arcadeVenues.normalized_address, normalizedPattern) : undefined,
          )!,
        )
      }

      if (input.chains) {
        filters.push(inArray(arcadeVenues.chain_id, input.chains))
      }

      if (input.games || input.status) {
        const installationFilters = [
          eq(arcadeInstallations.venue_id, arcadeVenues.id),
          isNull(arcadeInstallations.absent_since),
        ]
        if (input.games) installationFilters.push(inArray(arcadeInstallations.game_id, input.games))
        if (input.status) installationFilters.push(eq(arcadeInstallations.status, input.status))
        filters.push(
          exists(
            db
              .select({ value: sql`1` })
              .from(arcadeInstallations)
              .where(and(...installationFilters)),
          ),
        )
      }

      const [rows, chains] = yield* Effect.all(
        [
          database.query('Arcades.listVenues', (db) =>
            db
              .select()
              .from(arcadeVenues)
              .where(filters.length > 0 ? and(...filters) : undefined)
              .orderBy(asc(arcadeVenues.normalized_name), asc(arcadeVenues.id)),
          ),
          database.query('Arcades.listChains', (db) =>
            db
              .select({
                id: arcadeChains.id,
                name: arcadeChains.name,
                countryCodes: arcadeChains.country_codes,
              })
              .from(arcadeChains)
              .where(
                exists(
                  db
                    .select({ value: sql`1` })
                    .from(arcadeVenues)
                    .where(eq(arcadeVenues.chain_id, arcadeChains.id)),
                ),
              )
              .orderBy(asc(arcadeChains.name), asc(arcadeChains.id)),
          ),
        ],
        { concurrency: 'unbounded' },
      )

      const installations = yield* loadArcadeInstallations(rows.map((venue) => venue.id))

      return {
        items: rows.map((venue) => serializeArcadeVenue(venue, installations)),
        chains,
      }
    }),
  ),
  venue: os.arcades.venue.handler(
    handlerGen(function* ({ input }) {
      const database = yield* Database
      const [venue] = yield* database.query('Arcades.findVenue', (db) =>
        db.select().from(arcadeVenues).where(eq(arcadeVenues.public_id, input.id)).limit(1),
      )
      if (!venue) {
        return yield* Effect.fail(new ORPCError('NOT_FOUND', { message: 'Arcade venue not found' }))
      }

      const installations = yield* loadArcadeInstallations([venue.id])
      return serializeArcadeVenue(venue, installations)
    }),
  ),
}

const chartOgImageHandler = {
  render: os.chartOgImage.render.handler(
    handlerGen(function* ({ input }) {
      const catalogIdentities = yield* CatalogIdentities
      const catalogSource = yield* McpCatalogSource
      const catalog = yield* catalogSource.current.pipe(
        Effect.mapError(
          (cause) => new ORPCError('SERVICE_UNAVAILABLE', { message: 'The song catalog is still loading', cause }),
        ),
      )
      // Pages link the public song ID; legacy song IDs stay valid for images that were indexed before.
      const lookupSong = (songId: string) =>
        Effect.gen(function* () {
          const published = catalog.songsById.get(songId)
          if (published) return published.song
          // a public ID the published catalog lacks names no song; only legacy IDs need the identity mapping
          if (songId.startsWith('dsng_') || songId.startsWith('dsht_')) return null
          const publicIds = yield* withCatalogIdentityErrors(catalogIdentities.translateSongIdsToPublic([songId]))
          const publicId = publicIds.get(songId)
          return (publicId === undefined ? undefined : catalog.songsById.get(publicId)?.song) ?? null
        })
      const output = yield* renderChartOgImageOutputEffect(input, lookupSong)
      if (!output) {
        return yield* Effect.fail(new ORPCError('NOT_FOUND', { message: 'Chart not found' }))
      }

      return { ...output, headers: Object.fromEntries(new Headers(output.headers)) }
    }),
  ),
}

const maimaiHandler = {
  fetchRecords: os.maimai.fetchRecords.handler(
    handlerGen(function* ({ input }) {
      const { id, password, region } = input
      const startedAt = yield* Clock.currentTimeMillis
      const records = yield* withMaimaiNETClient(region, (client) =>
        Effect.gen(function* () {
          yield* client.loginEffect({ id, password })
          const [recentRecords, musicRecords] = yield* Effect.all(
            [client.fetchRecentRecordsEffect(), client.fetchMusicRecordsEffect()],
            { concurrency: 'unbounded' },
          )
          return { recentRecords, musicRecords }
        }),
      ).pipe(Effect.tapError((error) => Effect.sync(() => recordNetFailure(region, 'api', error))))
      const finishedAt = yield* Clock.currentTimeMillis
      yield* Effect.sync(() =>
        recordNetSuccess(region, 'api', {
          durationMs: finishedAt - startedAt,
          recent: records.recentRecords.length,
          music: records.musicRecords.length,
        }),
      )
      return records
    }),
  ),
}

// One probe per region at a time: concurrent callers on a cold or expired cache wait for it and read its result
const netStatusProbeLocks = { intl: Semaphore.makeUnsafe(1), jp: Semaphore.makeUnsafe(1) }

const maimaiNetHandler = {
  // The import UI warns before people try while SEGA's maintenance is on. Checked at most every 5 minutes per region,
  // with one anonymous request to the login page.
  status: os.maimaiNet.status.handler(
    handlerGen(function* () {
      const cache = yield* ApplicationCache
      const regionStatus = Effect.fn('Maimai.netStatus')(function* (region: 'intl' | 'jp') {
        const key = `net-status:${region}`
        type Cached = { status: NetGatewayStatus; checkedAt: string }
        const cached = yield* cache.get<Cached>(key)
        if (cached) return cached
        return yield* Semaphore.withPermit(
          netStatusProbeLocks[region],
          Effect.gen(function* () {
            const settled = yield* cache.get<Cached>(key)
            if (settled) return settled
            const status = yield* netGatewayStatusEffect(region)
            const checkedAt = new Date(yield* Clock.currentTimeMillis).toISOString()
            const result: Cached = { status, checkedAt }
            yield* cache.set(key, result, 5 * 60 * 1000)
            return result
          }),
        )
      })
      const [intl, jp] = yield* Effect.all([regionStatus('intl'), regionStatus('jp')], { concurrency: 'unbounded' })
      return { intl, jp }
    }),
  ),
}

const lxnsHandler = {
  authorize: os.lxns.authorize.handler(
    handlerGen(function* ({ context }) {
      const user = context.user
      if (!user) return yield* new UnauthorizedError()
      const url = yield* lxnsService.generateAuthorizationUrl(user.id)
      return { url }
    }),
  ),
  status: os.lxns.status.handler(
    handlerGen(function* ({ context }) {
      const user = context.user
      if (!user) return yield* new UnauthorizedError()
      return yield* lxnsService.getConnectionStatus(user.id)
    }),
  ),
  start: os.lxns.start.handler(
    handlerGen(function* ({ context }) {
      const user = context.user
      if (!user) return yield* new UnauthorizedError()
      const [duration, rawScores] = yield* Effect.timed(lxnsService.fetchPlayerScores(user.id))
      yield* Effect.sync(() =>
        Sentry.metrics.distribution('lxns_fetch.duration', Duration.toMillis(duration), {
          unit: 'millisecond',
        }),
      )
      const scores = rawScores.map((s) => ({
        id: s.id,
        songName: s.song_name,
        level: s.level,
        levelIndex: s.level_index,
        achievements: s.achievements,
        fc: s.fc,
        fs: s.fs,
        type: s.type,
        dxScore: s.dx_score,
      }))
      yield* Effect.sync(() => Sentry.metrics.distribution('lxns_fetch.scores', scores.length, { unit: 'none' }))
      return { scores, count: scores.length }
    }),
  ),
  disconnect: os.lxns.disconnect.handler(
    handlerGen(function* ({ context }) {
      const user = context.user
      if (!user) return yield* new UnauthorizedError()
      yield* lxnsService.disconnect(user.id)
      return { success: true }
    }),
  ),
}

export const appRouter = os.router({
  tags: tagsHandler,
  comments: commentsHandler,
  aliases: aliasesHandler,
  analytics: analyticsHandler,
  arcades: arcadesHandler,
  chartOgImage: chartOgImageHandler,
  maimai: maimaiHandler,
  maimaiNet: maimaiNetHandler,
  lxns: lxnsHandler,
})