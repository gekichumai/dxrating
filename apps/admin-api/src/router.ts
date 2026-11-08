import { implement, ORPCError } from '@orpc/server'
import { Effect } from 'effect'
import { handlerGen, type WithEffectContext } from '@orpc/experimental-effect'
import type { RequestHeadersHandlerPluginContext } from '@orpc/server/plugins'
import { adminApiContract } from './contract'
import {
  AnnouncementRejected,
  createAnnouncement,
  endAnnouncement,
  listAnnouncements,
  updateAnnouncement,
} from './announcements'
import { diffPublications } from './catalog/publication-diff'
import { searchSongs, songProvenance } from './catalog/provenance'
import { songHistory } from './catalog/song-history'
import { catalogOverview } from './catalog/overview'
import { listPublications } from './catalog/publications'
import { audit } from './audit'
import { requireAdmin, requireScope } from './require-admin'
import type { DatabaseError } from './db'
import type { AdminApiServices } from './runtime'

export interface AdminApiContext extends WithEffectContext<AdminApiServices>, RequestHeadersHandlerPluginContext {}

const os = implement(adminApiContract).$context<AdminApiContext>()
/** A rejected write is the caller's 400/409; a database failure is a defect (500) */
const rejections = <A, R>(effect: Effect.Effect<A, AnnouncementRejected | DatabaseError, R>) =>
  effect.pipe(
    Effect.catchTag('AnnouncementRejected', (error) =>
      Effect.fail(new ORPCError(error.code, { message: error.message })),
    ),
    Effect.catchTag('DatabaseError', (error) => Effect.die(error)),
  )
const headersOf = (context: AdminApiContext) => context.reqHeaders ?? new Headers()

export const adminApiRouter = os.router({
  me: os.me.handler(
    handlerGen(function* ({ context }) {
      const principal = yield* requireAdmin(headersOf(context))
      return { ...principal, scopes: [...principal.scopes] }
    }),
  ),
  announcements: {
    list: os.announcements.list.handler(
      handlerGen(function* ({ context }) {
        const principal = yield* requireAdmin(headersOf(context))
        yield* requireScope(principal, 'announcements:read')
        return { announcements: yield* listAnnouncements.pipe(Effect.orDie) }
      }),
    ),
    create: os.announcements.create.handler(
      handlerGen(function* ({ context, input }) {
        const principal = yield* requireAdmin(headersOf(context))
        yield* requireScope(principal, 'announcements:write')
        const result = yield* createAnnouncement(principal, input.announcement, input.dryRun).pipe(rejections)
        yield* audit(principal, {
          action: 'announcements.create',
          target: result.announcement?.id,
          dryRun: input.dryRun,
          outcome: 'ok',
        })
        return result
      }),
    ),
    update: os.announcements.update.handler(
      handlerGen(function* ({ context, input }) {
        const principal = yield* requireAdmin(headersOf(context))
        yield* requireScope(principal, 'announcements:write')
        const result = yield* updateAnnouncement(principal, input.announcement, input.dryRun, input.ifUpdatedAt).pipe(
          rejections,
        )
        yield* audit(principal, {
          action: 'announcements.update',
          target: input.announcement.id,
          dryRun: input.dryRun,
          outcome: result ? 'ok' : 'not_found',
        })
        return result ?? (yield* Effect.fail(new ORPCError('NOT_FOUND', { message: 'No such announcement' })))
      }),
    ),
    end: os.announcements.end.handler(
      handlerGen(function* ({ context, input }) {
        const principal = yield* requireAdmin(headersOf(context))
        yield* requireScope(principal, 'announcements:write')
        const result = yield* endAnnouncement(principal, input.id).pipe(Effect.orDie)
        yield* audit(principal, { action: 'announcements.end', target: input.id, outcome: result ? 'ok' : 'not_found' })
        return result ?? (yield* Effect.fail(new ORPCError('NOT_FOUND', { message: 'No such announcement' })))
      }),
    ),
  },
  catalog: {
    publications: os.catalog.publications.handler(
      handlerGen(function* ({ context, input }) {
        const principal = yield* requireAdmin(headersOf(context))
        yield* requireScope(principal, 'catalog:read')
        return yield* listPublications(input).pipe(Effect.orDie)
      }),
    ),
    diff: os.catalog.diff.handler(
      handlerGen(function* ({ context, input }) {
        const principal = yield* requireAdmin(headersOf(context))
        yield* requireScope(principal, 'catalog:read')
        return yield* diffPublications(input).pipe(Effect.catchTag('DatabaseError', (error) => Effect.die(error)))
      }),
    ),
    songs: os.catalog.songs.handler(
      handlerGen(function* ({ context, input }) {
        const principal = yield* requireAdmin(headersOf(context))
        yield* requireScope(principal, 'catalog:read')
        return yield* searchSongs(input).pipe(Effect.catchTag('DatabaseError', (error) => Effect.die(error)))
      }),
    ),
    song: os.catalog.song.handler(
      handlerGen(function* ({ context, input }) {
        const principal = yield* requireAdmin(headersOf(context))
        yield* requireScope(principal, 'catalog:read')
        return yield* songProvenance(input).pipe(Effect.catchTag('DatabaseError', (error) => Effect.die(error)))
      }),
    ),
    overview: os.catalog.overview.handler(
      handlerGen(function* ({ context, input }) {
        const principal = yield* requireAdmin(headersOf(context))
        yield* requireScope(principal, 'catalog:read')
        return yield* catalogOverview(input).pipe(Effect.catchTag('DatabaseError', (error) => Effect.die(error)))
      }),
    ),
    songHistory: os.catalog.songHistory.handler(
      handlerGen(function* ({ context, input }) {
        const principal = yield* requireAdmin(headersOf(context))
        yield* requireScope(principal, 'catalog:read')
        return yield* songHistory(input).pipe(Effect.orDie)
      }),
    ),
  },
})