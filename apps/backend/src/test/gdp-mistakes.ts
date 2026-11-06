// Negative type tests for the gdp-ts proofs (never run; type-checked by `tsc` in the backend build).
// Each `@ts-expect-error` line is a mistake that must not compile. tsc fails on an unused
// `@ts-expect-error`, so if a signature loosens and a line starts compiling, the build breaks.
import { name } from '@gdp-ts/core'
import { withViewer, type SessionUser } from '../proofs/viewer-is'
import * as lxns from '../services/lxns/viewer'

declare const sessionUser: SessionUser
declare const otherSessionUser: SessionUser
declare const input: { userId: string }

export const mistakes = () =>
  withViewer(sessionUser, (viewer, proof) => [
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

    // Another user's proof
    withViewer(otherSessionUser, (_other, otherProof) =>
      // @ts-expect-error ViewerIs<Other> is not ViewerIs<U>
      lxns.generateAuthorizationUrl(viewer, otherProof),
    ),

    // The honest call compiles
    lxns.fetchPlayerScores(viewer, proof),
  ])