import { ORPCError } from '@orpc/server'
import { Context, Effect, Layer } from 'effect'
import { AppConfig } from '../config'
import type { SessionViewer } from '../proofs/viewer-is'

/**
 * A verified administrator of this request. The `#id` private field makes it nominal, and the class is exported as a
 * type only, so the only way to get one is `requireAdmin`. Handlers write `viewer.id` to `created_by` and similar
 * columns without reading the session again.
 */
class AdminViewer {
  readonly #id: string
  constructor(id: string) {
    this.#id = id
    Object.freeze(this)
  }
  get id(): string {
    return this.#id
  }
}
export type { AdminViewer }

/** What the guard sees of a request */
export interface AdminRequest {
  readonly viewer: SessionViewer | undefined
  /** The request's `Origin` header, or null when it has none */
  readonly origin: string | null
}

export type AdminDenial = ORPCError<'UNAUTHORIZED' | 'FORBIDDEN', unknown>

/**
 * Decides whether a request comes from an administrator (meta#50). The live policy checks the session, the
 * `ADMIN_USER_IDS` allowlist and an exact `Origin`; a roles table or a Cloudflare Access check can replace it here
 * without changing any handler. Tests provide their own layer with {@link adminAuthorizerLayer}.
 */
export class AdminAuthorizer extends Context.Service<
  AdminAuthorizer,
  { readonly authorize: (request: AdminRequest) => Effect.Effect<AdminViewer, AdminDenial> }
>()('dxrating/AdminAuthorizer') {}

export interface AdminPolicy {
  readonly userIds: readonly string[]
  /** The one origin admin calls may come from: the web app's */
  readonly allowedOrigin: string
}

/** Fails closed: no session is 401; an empty allowlist, another user, or a missing or different origin is 403. */
export const authorizeAdmin = (policy: AdminPolicy, request: AdminRequest): Effect.Effect<AdminViewer, AdminDenial> => {
  const viewer = request.viewer
  if (!viewer) return Effect.fail(new ORPCError('UNAUTHORIZED', { message: 'Unauthorized' }))
  if (request.origin === null || request.origin !== policy.allowedOrigin || !policy.userIds.includes(viewer.id)) {
    return Effect.fail(new ORPCError('FORBIDDEN', { message: 'Forbidden' }))
  }
  return Effect.succeed(new AdminViewer(viewer.id))
}

export const adminAuthorizerLayer = (policy: AdminPolicy) =>
  Layer.succeed(AdminAuthorizer, { authorize: (request) => authorizeAdmin(policy, request) })

export const AdminAuthorizerLive = Layer.effect(
  AdminAuthorizer,
  Effect.gen(function* () {
    const config = yield* AppConfig
    const policy = { userIds: config.admin.userIds, allowedOrigin: new URL(config.frontendUrl).origin }
    return { authorize: (request: AdminRequest) => authorizeAdmin(policy, request) }
  }),
)

/** Every admin handler starts with this. It returns the verified administrator or fails with 401/403. */
export const requireAdmin = (context: { viewer?: SessionViewer; reqHeaders?: Headers }) =>
  Effect.gen(function* () {
    const authorizer = yield* AdminAuthorizer
    return yield* authorizer.authorize({ viewer: context.viewer, origin: context.reqHeaders?.get('origin') ?? null })
  })