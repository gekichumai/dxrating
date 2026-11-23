import { Effect, Exit } from 'effect'
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'
import { describe, expect, it } from 'vitest'
import type { JWTVerifyGetKey } from 'jose'
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
    opts: { iss?: string; aud?: string; exp?: string | null; nbf?: string; key?: CryptoKey } = {},
  ) => {
    const jwt = new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(opts.iss ?? ISSUER)
      .setAudience(opts.aud ?? AUD)
      .setIssuedAt()
    if (opts.exp !== null) jwt.setExpirationTime(opts.exp ?? '5m')
    if (opts.nbf) jwt.setNotBefore(opts.nbf)
    return jwt.sign(opts.key ?? privateKey)
  }
  const run = (token: string | null) => Effect.runPromiseExit(verify(token))

  it('accepts a valid assertion', async () => {
    const exit = await run(await sign({ email: 'owner@example.invalid' }))
    expect(Exit.isSuccess(exit) && exit.value).toEqual({ kind: 'user', email: 'owner@example.invalid' })
  })

  it('reads the Access user id and the identity provider for the audit log', async () => {
    const token = await sign({
      email: 'Member@Example.invalid',
      sub: '7335d417-61da-459d-899c-0a01c76a2f94',
      idp: { id: 'idp-synthetic', type: 'github' },
    })
    const exit = await run(token)
    expect(Exit.isSuccess(exit) && exit.value).toEqual({
      kind: 'user',
      email: 'member@example.invalid',
      subject: '7335d417-61da-459d-899c-0a01c76a2f94',
      identityProvider: 'github:idp-synthetic',
    })
  })

  it('reads a service token as a service identity', async () => {
    const exit = await run(await sign({ common_name: 'svc.access', sub: '' }))
    expect(Exit.isSuccess(exit) && exit.value).toEqual({ kind: 'service', commonName: 'svc.access' })
  })

  it('allows a little clock skew, not more', async () => {
    expect(Exit.isSuccess(await run(await sign({ email: 'a@b.invalid' }, { exp: '-10s' })))).toBe(true)
    expect(Exit.isSuccess(await run(await sign({ email: 'a@b.invalid' }, { nbf: '10s' })))).toBe(true)
    expect(Exit.isFailure(await run(await sign({ email: 'a@b.invalid' }, { exp: '-2m' })))).toBe(true)
  })

  it.each([
    ['another issuer', { iss: 'https://evil.cloudflareaccess.com' }],
    ['another audience', { aud: 'other-app' }],
    ['an expired token', { exp: '-1m' }],
    ['a token without an expiry', { exp: null }],
    ['a token not valid yet', { nbf: '5m' }],
  ])('rejects %s', async (_, opts) => {
    expect(Exit.isFailure(await run(await sign({ email: 'owner@example.invalid' }, opts)))).toBe(true)
  })

  it('rejects a token signed by another key, garbage and no token', async () => {
    expect(Exit.isFailure(await run(await sign({ email: 'a@b.invalid' }, { key: other.privateKey })))).toBe(true)
    expect(Exit.isFailure(await run('not-a-jwt'))).toBe(true)
    expect(Exit.isFailure(await run(null))).toBe(true)
  })

  it('rejects an assertion naming no identity', async () => {
    expect(Exit.isFailure(await run(await sign({ sub: 'x' })))).toBe(true)
  })

  it('fails closed when the key set cannot be fetched', async () => {
    const unavailable: JWTVerifyGetKey = () => Promise.reject(new Error('JWKS fetch failed: 503'))
    const exit = await Effect.runPromiseExit(
      verifyAccessAssertion(unavailable, ISSUER, AUD)(await sign({ email: 'owner@example.invalid' })),
    )
    expect(Exit.isFailure(exit)).toBe(true)
  })

  it('fails closed against a real but unreachable key set URL', async () => {
    const { createRemoteJWKSet } = await import('jose')
    const keys = createRemoteJWKSet(new URL('http://127.0.0.1:9/cdn-cgi/access/certs'), { timeoutDuration: 1_000 })
    const exit = await Effect.runPromiseExit(
      verifyAccessAssertion(keys, ISSUER, AUD)(await sign({ email: 'owner@example.invalid' })),
    )
    expect(Exit.isFailure(exit)).toBe(true)
  })
})