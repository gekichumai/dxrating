import type { Named } from '@gdp-ts/core'
import type { ViewerIs } from '../../proofs/viewer-is'
import * as lxns from './index'

/*
 * The LXNS credential store, for the signed-in viewer only. Each function demands `ViewerIs<U>` about the user whose
 * tokens it reads or changes, so a raw id (`input.userId`), another user's name, or no proof does not compile. Get
 * the viewer and its proof with `withViewer(context.user, ...)`.
 *
 * `./index` keeps the raw `userId: string` implementations; oxlint confines imports of it to this module, the OAuth
 * callback in app.ts (which has no viewer yet) and tests.
 */

export { LxnsError } from './index'

export const generateAuthorizationUrl = <U>(viewer: Named<U, string>, _proof: ViewerIs<U>) =>
  lxns.generateAuthorizationUrl(viewer.value)

export const getConnectionStatus = <U>(viewer: Named<U, string>, _proof: ViewerIs<U>) =>
  lxns.getConnectionStatus(viewer.value)

export const fetchPlayerScores = <U>(viewer: Named<U, string>, _proof: ViewerIs<U>) =>
  lxns.fetchPlayerScores(viewer.value)

export const disconnect = <U>(viewer: Named<U, string>, _proof: ViewerIs<U>) => lxns.disconnect(viewer.value)