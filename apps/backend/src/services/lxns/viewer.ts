import type { Named } from '@gdp-ts/core'
import type { ViewerIs } from '../../proofs/viewer-is'
import * as lxns from './index'

/*
 * The LXNS credential store, for the signed-in viewer only. Each function demands `ViewerIs<U>` about the user whose
 * tokens it reads or changes, so a raw id (`input.userId`), another user's name, or no proof does not compile. Get
 * the viewer and its proof with `withViewer(context.viewer, ...)`.
 *
 * `./index` keeps the raw `userId: string` implementations; oxlint confines imports of it to this directory and tests.
 */

export { LxnsError, LxnsStateMismatch } from './index'

export const generateAuthorizationUrl = <U>(viewer: Named<U, string>, _proof: ViewerIs<U>) =>
  lxns.generateAuthorizationUrl(viewer.value)

/** Saves tokens only when `state` was issued to the viewer; the state is consumed either way. */
export const completeAuthorization = <U>(viewer: Named<U, string>, _proof: ViewerIs<U>, code: string, state: string) =>
  lxns.completeAuthorization(viewer.value, code, state)

/** Without a viewer: consumes `state`, saves nothing, and fails with `LxnsStateMismatch` (`signedIn: false`). */
export const discardAuthorization = (code: string, state: string) => lxns.completeAuthorization(undefined, code, state)

export const getConnectionStatus = <U>(viewer: Named<U, string>, _proof: ViewerIs<U>) =>
  lxns.getConnectionStatus(viewer.value)

export const fetchPlayerScores = <U>(viewer: Named<U, string>, _proof: ViewerIs<U>) =>
  lxns.fetchPlayerScores(viewer.value)

export const disconnect = <U>(viewer: Named<U, string>, _proof: ViewerIs<U>) => lxns.disconnect(viewer.value)