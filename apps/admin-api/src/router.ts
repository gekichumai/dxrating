import { implement } from '@orpc/server'
import { handlerGen, type WithEffectContext } from '@orpc/experimental-effect'
import type { RequestHeadersHandlerPluginContext } from '@orpc/server/plugins'
import { adminApiContract } from './contract'
import { requireAdmin } from './require-admin'
import type { AdminApiServices } from './runtime'

export interface AdminApiContext extends WithEffectContext<AdminApiServices>, RequestHeadersHandlerPluginContext {}

const os = implement(adminApiContract).$context<AdminApiContext>()

export const adminApiRouter = os.router({
  me: os.me.handler(
    handlerGen(function* ({ context }) {
      const principal = yield* requireAdmin(context.reqHeaders ?? new Headers())
      return { ...principal, scopes: [...principal.scopes] }
    }),
  ),
})