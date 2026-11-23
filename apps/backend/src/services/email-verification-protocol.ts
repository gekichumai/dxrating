import { promises as dns } from 'node:dns'
import { Context, Effect, Layer } from 'effect'
import { makeEvpVerifier, type EvpTransport, type EvpVerifier } from '../lib/email-verification-protocol/verifier'

/**
 * Chrome's Email Verification Protocol verifier (gekichumai/meta#80, src/lib/email-verification-protocol/), over the
 * real DNS and the issuers' real HTTPS endpoints. Tests swap {@link EmailVerificationProtocolLive} for a fixture issuer
 * with `vi.mock` (src/test/evp-fixture-issuer.ts), the way they swap the Mailer; production code has no way to point
 * the verifier at another issuer.
 */
export class EmailVerificationProtocol extends Context.Service<EmailVerificationProtocol, EvpVerifier>()(
  'dxrating/EmailVerificationProtocol',
) {}

export const nodeEvpTransport: EvpTransport = {
  resolveTxt: (name) => dns.resolveTxt(name),
  lookup: async (hostname) => (await dns.lookup(hostname, { all: true, verbatim: true })).map(({ address }) => address),
  fetch: (url, init) => fetch(url, init),
}

export const EmailVerificationProtocolLive = Layer.effect(
  EmailVerificationProtocol,
  Effect.sync(() => makeEvpVerifier(nodeEvpTransport)),
)