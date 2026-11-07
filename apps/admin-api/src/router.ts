import { implement, ORPCError } from '@orpc/server'
import { Effect } from 'effect'
import { handlerGen, type WithEffectContext } from '@orpc/experimental-effect'
import type { RequestHeadersHandlerPluginContext } from '@orpc/server/plugins'
import { adminApiContract } from './contract'
import { createAnnouncement, endAnnouncement, listAnnouncements, updateAnnouncement } from './announcements'
import { requireAdmin, requireScope } from './require-admin'
import type { AdminApiServices } from './runtime'

export interface AdminApiContext extends WithEffectContext<AdminApiServices>, RequestHeadersHandlerPluginContext {}

const os = implement(adminApiContract).$context<AdminApiContext>()
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
        return yield* createAnnouncement(principal, input.announcement, input.dryRun).pipe(Effect.orDie)
      }),
    ),
    update: os.announcements.update.handler(
      handlerGen(function* ({ context, input }) {
        const principal = yield* requireAdmin(headersOf(context))
        yield* requireScope(principal, 'announcements:write')
        const result = yield* updateAnnouncement(principal, input.announcement, input.dryRun).pipe(Effect.orDie)
        return result ?? (yield* Effect.fail(new ORPCError('NOT_FOUND', { message: 'No such announcement' })))
      }),
    ),
    end: os.announcements.end.handler(
      handlerGen(function* ({ context, input }) {
        const principal = yield* requireAdmin(headersOf(context))
        yield* requireScope(principal, 'announcements:write')
        const result = yield* endAnnouncement(principal, input.id).pipe(Effect.orDie)
        return result ?? (yield* Effect.fail(new ORPCError('NOT_FOUND', { message: 'No such announcement' })))
      }),
    ),
  },
})