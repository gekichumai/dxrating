// Trusted module (gdp-ts): the only place that can mint `ViewerIs`. Keep the prover private.
import { defineProof, name, type Named, type Proof } from '@gdp-ts/core'
import type { BackendAuth } from '../auth'

/** The signed-in user Better Auth resolved for this request (`context.user`). */
export type SessionUser = BackendAuth['$Infer']['Session']['user']

const ViewerIs = defineProof('ViewerIs')

/**
 * Evidence that the user named `U` is the signed-in user of this request, so a function that reads or changes
 * `U`'s private data (an LXNS credential, say) cannot be handed an id from the URL or the body instead.
 */
export interface ViewerIs<U> extends Proof<'ViewerIs', [U]> {}

/**
 * Names the session user's id and proves it is the viewer, for `k` only. Pass `context.user` after the
 * signed-in check; any other object means the function you call no longer acts for the viewer.
 */
export function withViewer<R>(user: SessionUser, k: <U>(viewer: Named<U, string>, proof: ViewerIs<U>) => R): R {
  return name(user.id, (viewer) => k(viewer, ViewerIs.prove(viewer)))
}