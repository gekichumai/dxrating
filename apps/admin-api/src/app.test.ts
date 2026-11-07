import { Effect, Layer } from 'effect'
import { afterAll, describe, expect, it } from 'vitest'
import { accessVerifierTestLayer, identityFromClaims } from './access'
import { createAdminApiApp } from './app'
import { adminApiConfigLayer, envSchema } from './config'
import { makeAdminApiRuntime } from './runtime'

const ORIGIN = 'https://admin.dxrating.net'
const config = envSchema.parse({
  NODE_ENV: 'test',
  ADMIN_ORIGIN: ORIGIN,
  ADMIN_HUMAN_EMAILS: ' Owner@Example.invalid , ',
})
const runtime = makeAdminApiRuntime(
  Layer.merge(
    adminApiConfigLayer(config),
    accessVerifierTestLayer({
      owner: { kind: 'user', email: 'owner@example.invalid' },
      stranger: { kind: 'user', email: 'stranger@example.invalid' },
      robot: { kind: 'service', commonName: 'svc.access' },
    }),
  ),
)
const app = createAdminApiApp(runtime)
afterAll(() => runtime.dispose())

const call = (path: string, headers: Record<string, string> = {}) =>
  app.fetch(new Request(`http://admin-api.internal${path}`, { headers }))

describe('admin API guard', () => {
  it('lets an allowlisted Access user in as a human principal', async () => {
    const res = await call('/api/me', { 'cf-access-jwt-assertion': 'owner', origin: ORIGIN })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      type: 'human',
      id: 'owner@example.invalid',
      actor: 'human:owner@example.invalid',
      scopes: ['*'],
    })
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })

  it.each([
    ['no Access assertion', {}, 401],
    ['an assertion the verifier rejects', { 'cf-access-jwt-assertion': 'forged' }, 401],
    ['an Access user off the allowlist', { 'cf-access-jwt-assertion': 'stranger' }, 403],
    ['an Access service token before agent tokens ship', { 'cf-access-jwt-assertion': 'robot' }, 403],
    [
      'a browser request from another origin',
      { 'cf-access-jwt-assertion': 'owner', origin: 'https://evil.example' },
      403,
    ],
  ])('fails closed for %s', async (_, headers, status) => {
    expect((await call('/api/me', headers)).status).toBe(status)
  })

  it('serves the private OpenAPI document to admins only', async () => {
    expect((await call('/api/spec.json')).status).toBe(403)
    const res = await call('/api/spec.json', { 'cf-access-jwt-assertion': 'owner' })
    expect(res.status).toBe(200)
    const spec = (await res.json()) as { paths: Record<string, unknown> }
    expect(Object.keys(spec.paths)).toEqual(['/me'])
  })

  it('answers health without Access', async () => {
    expect((await call('/health')).status).toBe(200)
  })
})

describe('Access claims', () => {
  it('reads a user email or a service token common name, and nothing else', () => {
    expect(Effect.runSync(identityFromClaims({ email: 'A@B.invalid' }))).toEqual({ kind: 'user', email: 'a@b.invalid' })
    expect(Effect.runSync(identityFromClaims({ common_name: 'svc' }))).toEqual({ kind: 'service', commonName: 'svc' })
    expect(Effect.runSyncExit(identityFromClaims({}))._tag).toBe('Failure')
  })
})

describe('config', () => {
  it('fails closed when NODE_ENV is unset: production, so no development identity and Access is required', () => {
    expect(() => envSchema.parse({ ADMIN_DEV_ACCESS_EMAIL: 'a@b.invalid' })).toThrow()
    expect(() => envSchema.parse({})).toThrow()
    expect(envSchema.parse({ ADMIN_ACCESS_TEAM_DOMAIN: 't', ADMIN_ACCESS_AUD: 'a' }).NODE_ENV).toBe('production')
  })
  it('refuses the development identity outside development', () => {
    expect(() => envSchema.parse({ NODE_ENV: 'production', ADMIN_DEV_ACCESS_EMAIL: 'a@b.invalid' })).toThrow()
  })
  it('treats blank values from the env template as unset', () => {
    const env = envSchema.parse({
      NODE_ENV: 'production',
      ADMIN_ACCESS_TEAM_DOMAIN: 't',
      ADMIN_ACCESS_AUD: 'a',
      ADMIN_DEV_ACCESS_EMAIL: '',
      ADMIN_HUMAN_EMAILS: '',
    })
    expect(env.ADMIN_DEV_ACCESS_EMAIL).toBeUndefined()
    expect(() =>
      envSchema.parse({ NODE_ENV: 'production', ADMIN_ACCESS_TEAM_DOMAIN: ' ', ADMIN_ACCESS_AUD: 'a' }),
    ).toThrow()
  })
  it('requires Access settings in production', () => {
    expect(() => envSchema.parse({ NODE_ENV: 'production' })).toThrow()
    expect(
      envSchema.parse({ NODE_ENV: 'production', ADMIN_ACCESS_TEAM_DOMAIN: 't', ADMIN_ACCESS_AUD: 'a' })
        .ADMIN_HUMAN_EMAILS,
    ).toEqual([])
  })
})