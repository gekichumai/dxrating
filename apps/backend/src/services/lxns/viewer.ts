import type { Named } from '@gdp-ts/core'
import { Effect } from 'effect'
import { viewerId, type ViewerIs } from '../../proofs/viewer-is'
import * as lxns from './index'

/*
 * The LXNS credential store, for the signed-in viewer only. Each function demands `ViewerIs<U>` about the user whose
 * tokens it reads or changes, so a raw id (`input.userId`), another user's name, or no proof does not compile. Get
 * the viewer and its proof with `withViewer(context.viewer, ...)`.
 *
 * `./index` keeps the raw `userId: string` implementations; oxlint confines imports of it to this directory and tests.
 */

export { LxnsError, LxnsStateMismatch } from './index'

export const generateAuthorizationUrl = <U>(viewer: Named<U, string>, proof: ViewerIs<U>) =>
  Effect.suspend(() => lxns.generateAuthorizationUrl(viewerId(viewer, proof)))

/** Saves tokens only when `state` was issued to the viewer; the state is consumed either way. */
export const completeAuthorization = <U>(viewer: Named<U, string>, proof: ViewerIs<U>, code: string, state: string) =>
  Effect.suspend(() => lxns.completeAuthorization(viewerId(viewer, proof), code, state))

/** Without a viewer: consumes `state`, saves nothing, and fails with `LxnsStateMismatch` (`signedIn: false`). */
export const discardAuthorization = (code: string, state: string) => lxns.completeAuthorization(undefined, code, state)

export const getConnectionStatus = <U>(viewer: Named<U, string>, proof: ViewerIs<U>) =>
  Effect.suspend(() => lxns.getConnectionStatus(viewerId(viewer, proof)))

export const fetchPlayerScores = <U>(viewer: Named<U, string>, proof: ViewerIs<U>) =>
  Effect.suspend(() => lxns.fetchPlayerScores(viewerId(viewer, proof)))

export const disconnect = <U>(viewer: Named<U, string>, proof: ViewerIs<U>) =>
  Effect.suspend(() => lxns.disconnect(viewerId(viewer, proof)))