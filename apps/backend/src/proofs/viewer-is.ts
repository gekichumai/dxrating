// Trusted module (gdp-ts): the only place that can mint `ViewerIs`. Keep the prover private.
import { defineProof, name, type Named, type Proof } from '@gdp-ts/core'
import type { BackendAuth } from '../auth'

/** The signed-in user Better Auth resolved for this request. */
export type SessionUser = BackendAuth['$Infer']['Session']['user']

const ViewerIs = defineProof('ViewerIs')

/**
 * Evidence that the user named `U` is the signed-in user of this request, so a function that reads or changes
 * `U`'s private data (an LXNS credential, say) cannot be handed an id from the URL or the body instead.
 */
export interface ViewerIs<U> extends Proof<'ViewerIs', [U]> {}

/**
 * The request's signed-in user, as `context.viewer`. The `#private` field makes it nominal: an object literal or a
 * spread copy (`{ ...viewer, id }`) is not a `SessionViewer`, and the class is exported as a type only, so the only
 * way to get one is `viewerFromSession`, which oxlint allows in app.ts alone (where the session is read).
 */
class SessionViewer {
  readonly #fromSession = true
  constructor(readonly id: string) {}
}
export type { SessionViewer }

/** app.ts only (oxlint `no-restricted-imports`): wraps the user Better Auth resolved from the request's session. */
export function viewerFromSession(user: SessionUser): SessionViewer {
  return new SessionViewer(user.id)
}

/**
 * The `Named` values `withViewer` handed out. `Named` is structural, so `{ ...viewer, value: input.userId }` keeps the
 * proof-compatible type; `viewerId` rejects such a copy at runtime (TypeScript cannot, see gdp-ts limits).
 */
const namedViewers = new WeakSet<object>()

/** Names the viewer's id and proves it is the viewer, for `k` only. */
export function withViewer<R>(viewer: SessionViewer, k: <U>(viewer: Named<U, string>, proof: ViewerIs<U>) => R): R {
  return name(viewer.id, (named) => {
    namedViewers.add(named)
    return k(named, ViewerIs.prove(named))
  })
}

/** The proved viewer's id. Throws (a defect) for a `Named` that `withViewer` did not hand out, such as a spread copy. */
export function viewerId<U>(viewer: Named<U, string>, _proof: ViewerIs<U>): string {
  if (!namedViewers.has(viewer)) throw new Error('ViewerIs: this viewer was not named by withViewer')
  return viewer.value
}