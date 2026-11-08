import { Effect, Exit } from 'effect'
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'
import { describe, expect, it } from 'vitest'
import { verifyAccessAssertion } from './access'

const ISSUER = 'https://team.cloudflareaccess.com'
const AUD = 'synthetic-aud'

describe('verifyAccessAssertion', async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256')
  const other = await generateKeyPair('RS256')
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' }
  const verify = verifyAccessAssertion(createLocalJWKSet({ keys: [jwk] }), ISSUER, AUD)
  const sign = (
    claims: Record<string, unknown>,
    opts: { iss?: string; aud?: string; exp?: string; key?: CryptoKey } = {},
  ) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(opts.iss ?? ISSUER)
      .setAudience(opts.aud ?? AUD)
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? '5m')
      .sign(opts.key ?? privateKey)
  const run = (token: string | null) => Effect.runPromiseExit(verify(token))

  it('accepts a valid assertion', async () => {
    const exit = await run(await sign({ email: 'owner@example.invalid' }))
    expect(Exit.isSuccess(exit) && exit.value).toEqual({ kind: 'user', email: 'owner@example.invalid' })
  })

  it.each([
    ['another issuer', { iss: 'https://evil.cloudflareaccess.com' }],
    ['another audience', { aud: 'other-app' }],
    ['an expired token', { exp: '-1m' }],
  ])('rejects %s', async (_, opts) => {
    expect(Exit.isFailure(await run(await sign({ email: 'owner@example.invalid' }, opts)))).toBe(true)
  })

  it('rejects a token signed by another key, garbage and no token', async () => {
    expect(Exit.isFailure(await run(await sign({ email: 'a@b.invalid' }, { key: other.privateKey })))).toBe(true)
    expect(Exit.isFailure(await run('not-a-jwt'))).toBe(true)
    expect(Exit.isFailure(await run(null))).toBe(true)
  })
})