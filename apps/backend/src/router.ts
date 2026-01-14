import { implement } from '@orpc/server'
import { appContract } from './contract'
import { db } from './db'
import { tags, tagGroups, tagSongs, comments, profiles, songAliases } from './db/schema'
import { eq, and, desc, sql } from 'drizzle-orm'
import type { auth } from './auth'

type Context = {
  user?: typeof auth.$Infer.Session.user
}

const os = implement(appContract)

const tagsHandler = {
  list: os.tags.list.handler(async () => {
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
          localized_name: sql<string>`${tagGroups.localized_name}::text`,
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

    return {
      tags: allTags,
      tagGroups: allGroups,
      tagSongs: allTagSongs,
    }
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

const monitoringHandler = {
  tunnel: os.monitoring.tunnel.handler(async ({ input }) => {
    const envelope = input.envelope
    // ... (rest of implementation)
    const piece = envelope.split('\n')[0]
    const header = JSON.parse(piece)
    const dsn = new URL(header.dsn)
    const project_id = dsn.pathname?.replace('/', '') // Fix potential missing pathname issue? null check

    const SENTRY_HOST = 'o4506648698683392.ingest.sentry.io'
    const SENTRY_PROJECT_IDS = ['4506648709627904']

    if (dsn.hostname !== SENTRY_HOST) {
      throw new Error(`Invalid sentry hostname: ${dsn.hostname}`)
    }

    if (!project_id || !SENTRY_PROJECT_IDS.includes(project_id)) {
      throw new Error(`Invalid sentry project id: ${project_id}`)
    }

    const upstream_sentry_url = `https://${SENTRY_HOST}/api/${project_id}/envelope/`
    await fetch(upstream_sentry_url, { method: 'POST', body: envelope })
  }),
}

const aliasesHandler = {
  list: os.aliases.list.handler(async () => {
    return await db
      .select({
        song_id: songAliases.song_id,
        name: songAliases.name,
      })
      .from(songAliases)
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

    return res[0]
  }),
}

export const appRouter = os.router({
  tags: tagsHandler,
  comments: commentsHandler,
  monitoring: monitoringHandler,
  aliases: aliasesHandler,
})
