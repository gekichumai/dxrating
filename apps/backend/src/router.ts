import { implement } from '@orpc/server'
import { appContract } from './contract.js'
import { db } from './db/index.js'
import { tags, tagGroups, tagSongs, comments, profiles, songAliases } from './db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import Keyv from 'keyv'
import type { auth } from './auth.js'

type Context = {
  user?: typeof auth.$Infer.Session.user
}

const cache = new Keyv({ ttl: 30 * 60 * 1000 }) // 30 minute TTL

const os = implement(appContract)

const tagsHandler = {
  list: os.tags.list.handler(async () => {
    const cached = await cache.get('tags:list')
    if (cached) return cached

    const [allTags, allGroups, allTagSongs] = await Promise.all([
      db
        .select({
          id: tags.id,
          localized_name: tags.localized_name,
          localized_description: tags.localized_description,
          group_id: tags.group_id,
        })
        .from(tags),
      db
        .select({
          id: tagGroups.id,
          localized_name: tagGroups.localized_name,
          color: tagGroups.color,
        })
        .from(tagGroups),
      db
        .select({
          song_id: tagSongs.song_id,
          sheet_type: tagSongs.sheet_type,
          sheet_difficulty: tagSongs.sheet_difficulty,
          tag_id: tagSongs.tag_id,
        })
        .from(tagSongs),
    ])

    const result = {
      tags: allTags,
      tagGroups: allGroups,
      tagSongs: allTagSongs,
    }
    await cache.set('tags:list', result)
    return result
  }),
  attach: os.tags.attach.handler(async ({ input, context }) => {
    const user = (context as Context).user
    if (!user) throw new Error('Unauthorized')

    const existing = await db
      .select()
      .from(tagSongs)
      .where(
        and(
          eq(tagSongs.song_id, input.songId),
          eq(tagSongs.sheet_type, input.sheetType),
          eq(tagSongs.sheet_difficulty, input.sheetDifficulty),
          eq(tagSongs.tag_id, input.tagId),
        ),
      )

    if (existing.length > 0) return { id: existing[0].id }

    const res = await db
      .insert(tagSongs)
      .values({
        song_id: input.songId,
        sheet_type: input.sheetType,
        sheet_difficulty: input.sheetDifficulty,
        tag_id: input.tagId,
        created_by: user.id,
      })
      .returning({ id: tagSongs.id })

    await cache.delete('tags:list')
    return res[0]
  }),
}

const commentsHandler = {
  create: os.comments.create.handler(async ({ input, context }) => {
    const user = (context as Context).user
    if (!user) {
      throw new Error('Unauthorized')
    }

    if (input.parentId) {
      const parent = await db.select().from(comments).where(eq(comments.id, input.parentId)).limit(1)
      if (parent.length === 0) {
        throw new Error('Parent comment not found')
      }
    }

    const newComment = await db
      .insert(comments)
      .values({
        song_id: input.songId,
        sheet_type: input.sheetType,
        sheet_difficulty: input.sheetDifficulty,
        parent_id: input.parentId,
        content: input.content,
        created_by: user.id,
      })
      .returning({ id: comments.id, created_at: comments.created_at })

    return newComment[0]
  }),
  list: os.comments.list.handler(async ({ input }) => {
    const result = await db
      .select({
        id: comments.id,
        parent_id: comments.parent_id,
        created_at: comments.created_at,
        content: comments.content,
        display_name: profiles.display_name,
      })
      .from(comments)
      .leftJoin(profiles, eq(profiles.id, comments.created_by))
      .where(
        and(
          eq(comments.song_id, input.songId),
          eq(comments.sheet_type, input.sheetType),
          eq(comments.sheet_difficulty, input.sheetDifficulty),
        ),
      )
      .orderBy(desc(comments.created_at))

    return result
  }),
}

const aliasesHandler = {
  list: os.aliases.list.handler(async () => {
    const cached = await cache.get('aliases:list')
    if (cached) return cached

    const result = await db
      .select({
        song_id: songAliases.song_id,
        name: songAliases.name,
      })
      .from(songAliases)

    await cache.set('aliases:list', result)
    return result
  }),
  create: os.aliases.create.handler(async ({ input, context }) => {
    const user = (context as Context).user
    if (!user) throw new Error('Unauthorized')

    const res = await db
      .insert(songAliases)
      .values({
        song_id: input.songId,
        name: input.name,
        created_by: user.id,
      })
      .returning({ id: songAliases.id })

    await cache.delete('aliases:list')
    return res[0]
  }),
}

import { MaimaiNETJpClient, MaimaiNETIntlClient } from './lib/functions/client.js'
import { fetchPlayerDataByQQ, fetchPlayerScoresByFriendCode } from './services/functions/fetch-lxns-data/index.js'

const maimaiHandler = {
  fetchRecords: os.maimai.fetchRecords.handler(async ({ input }) => {
    const { id, password, region } = input
    const client = {
      jp: new MaimaiNETJpClient(),
      intl: new MaimaiNETIntlClient(),
    }[region]

    await client.login({ id, password })
    const [recentRecords, musicRecords] = await Promise.all([client.fetchRecentRecords(), client.fetchMusicRecords()])

    return { recentRecords, musicRecords }
  }),
}

const lxnsHandler = {
  getPlayer: os.lxns.getPlayer.handler(async ({ input }) => {
    return await fetchPlayerDataByQQ(input.qq)
  }),
  getScores: os.lxns.getScores.handler(async ({ input }) => {
    return await fetchPlayerScoresByFriendCode(input.friendCode)
  }),
}

export const appRouter = os.router({
  tags: tagsHandler,
  comments: commentsHandler,
  aliases: aliasesHandler,
  maimai: maimaiHandler,
  lxns: lxnsHandler,
})