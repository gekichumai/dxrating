// Negative type tests for the gdp-ts proofs (never run; type-checked by `tsc` in the backend build).
// Each `@ts-expect-error` line is a mistake that must not compile. tsc fails on an unused
// `@ts-expect-error`, so if a signature loosens and a line starts compiling, the build breaks.
import { name } from '@gdp-ts/core'
import { withViewer, type SessionUser, type SessionViewer } from '../proofs/viewer-is'
import * as lxns from '../services/lxns/viewer'

declare const sessionViewer: SessionViewer
declare const otherSessionViewer: SessionViewer
declare const sessionUser: SessionUser
declare const input: { userId: string }

export const mistakes = () => [
  // A user object instead of the request's viewer: only viewerFromSession (app.ts) makes a SessionViewer
  // @ts-expect-error SessionUser is not a SessionViewer
  withViewer(sessionUser, (viewer, proof) => lxns.disconnect(viewer, proof)),

  // A viewer copied with a request id: the copy loses the #private brand
  // @ts-expect-error { id: string } is not a SessionViewer
  withViewer({ ...sessionViewer, id: input.userId }, (viewer, proof) => lxns.disconnect(viewer, proof)),

  withViewer(sessionViewer, (viewer, proof) => [
    // A raw id from the request instead of the named viewer
    // @ts-expect-error string is not Named<U, string>
    lxns.fetchPlayerScores(input.userId, proof),

    // A request id given a name of its own: the proof is about the viewer, not about it
    name(input.userId, (someone) =>
      // @ts-expect-error ViewerIs<U> does not prove anything about `someone`
      lxns.disconnect(someone, proof),
    ),

    // The viewer without its proof
    // @ts-expect-error the proof argument is required
    lxns.getConnectionStatus(viewer),

    // Another viewer's proof
    withViewer(otherSessionViewer, (_other, otherProof) =>
      // @ts-expect-error ViewerIs<Other> is not ViewerIs<U>
      lxns.completeAuthorization(viewer, otherProof, 'code', 'state'),
    ),

    // The honest call compiles
    lxns.fetchPlayerScores(viewer, proof),
  ]),
]