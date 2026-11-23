import { promises as dns } from 'node:dns'
import { isIP, type LookupFunction } from 'node:net'
import { Context, Effect, Layer } from 'effect'
import { Agent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from 'undici'
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

/**
 * Every name here comes from a token anyone can mint, so the domain and the issuer host may belong to whoever signs up.
 * Lookups go through c-ares (`Resolver`), never `dns.lookup`: getaddrinfo runs on libuv's small threadpool, can't be
 * cancelled, and a nameserver that never answers would hold a thread that bcrypt (auth.ts) needs. Each lookup has
 * its own resolver, so that an abort cancels only its own queries.
 */
const RESOLVER_OPTIONS = { timeout: 1_500, tries: 2 }

const withResolver = async <A>(signal: AbortSignal | undefined, run: (resolver: dns.Resolver) => Promise<A>) => {
  signal?.throwIfAborted()
  const resolver = new dns.Resolver(RESOLVER_OPTIONS)
  const cancel = () => resolver.cancel()
  signal?.addEventListener('abort', cancel, { once: true })
  try {
    return await run(resolver)
  } finally {
    signal?.removeEventListener('abort', cancel)
  }
}

/** A host's IPv4 and IPv6 addresses; fails only when it has neither */
const resolveAddresses = (hostname: string, signal?: AbortSignal) =>
  withResolver(signal, async (resolver) => {
    const [v4, v6] = await Promise.allSettled([resolver.resolve4(hostname), resolver.resolve6(hostname)])
    const addresses = [...(v4.status === 'fulfilled' ? v4.value : []), ...(v6.status === 'fulfilled' ? v6.value : [])]
    if (addresses.length === 0) {
      throw v4.status === 'rejected' ? v4.reason : new Error(`No addresses for ${hostname}`)
    }
    return addresses
  })

/**
 * Connects only to `addresses`, the ones the verifier already found public, whatever the host name resolves to by the
 * time the socket opens (no DNS rebinding in between, and no getaddrinfo either). TLS still checks the certificate
 * against the host name.
 */
export const pinnedLookup =
  (addresses: readonly string[]): LookupFunction =>
  (_hostname, options, callback) => {
    const entries = addresses.map((address) => ({ address, family: isIP(address) }))
    if (options.all) {
      ;(callback as unknown as (error: null, entries: { address: string; family: number }[]) => void)(null, entries)
      return
    }
    const first = entries[0]
    if (!first) {
      callback(Object.assign(new Error('No vetted address to connect to'), { code: 'ENOTFOUND' }), '', 0)
      return
    }
    callback(null, first.address, first.family)
  }

export const nodeEvpTransport: EvpTransport = {
  resolveTxt: (name, signal) => withResolver(signal, (resolver) => resolver.resolveTxt(name)),
  lookup: resolveAddresses,
  fetch: async (url, init, addresses) => {
    const agent = new Agent({ connect: { lookup: pinnedLookup(addresses) } })
    try {
      return (await undiciFetch(url, { ...(init as UndiciRequestInit), dispatcher: agent })) as unknown as Response
    } finally {
      // Graceful: lets the body the verifier is about to read finish, then closes the connection
      void agent.close().catch(() => {})
    }
  },
}

export const EmailVerificationProtocolLive = Layer.effect(
  EmailVerificationProtocol,
  Effect.sync(() => makeEvpVerifier(nodeEvpTransport)),
)