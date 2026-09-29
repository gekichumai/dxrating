import { Effect, Exit, Layer, ManagedRuntime } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpClient, makeHttpClient } from '../services/http-client.js'
import { BuildInformationLive, getBuildInfo } from '../version.js'

afterEach(() => vi.unstubAllEnvs())

describe('Build information Effect cache', () => {
  it('does not cache an interrupted first request or interrupt another caller', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('GIT_COMMIT', '1234567890')
    let markStarted!: () => void
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    const upstream = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
            markStarted()
          }),
      )
      .mockResolvedValue(new Response('Registry unavailable', { status: 503 }))
    const runtime = ManagedRuntime.make(
      BuildInformationLive.pipe(Layer.provide(Layer.succeed(HttpClient, makeHttpClient(upstream)))),
    )
    const controller = new AbortController()
    try {
      const first = runtime.runPromiseExit(Effect.scoped(getBuildInfo), { signal: controller.signal })
      await started
      const second = runtime.runPromise(Effect.scoped(getBuildInfo))
      controller.abort()
      expect(Exit.isInterrupted(await first)).toBe(true)
      expect(await second).toMatchObject({ commit: '1234567890', imageDigest: null, attestation: null })
      expect(await runtime.runPromise(Effect.scoped(getBuildInfo))).toMatchObject({ commit: '1234567890' })
      expect(upstream).toHaveBeenCalledTimes(2)
    } finally {
      await runtime.dispose()
    }
  })

  it('retrieves and caches verified image provenance after successful responses', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('GIT_COMMIT', 'abcdef0123456')
    const upstream = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ token: 'test-registry-token' }))
      .mockResolvedValueOnce(new Response('{}', { headers: { 'docker-content-digest': 'sha256:testdigest' } }))
      .mockResolvedValueOnce(Response.json({ attestations: [{ bundle: { mediaType: 'test-bundle' } }] }))
    const runtime = ManagedRuntime.make(
      BuildInformationLive.pipe(Layer.provide(Layer.succeed(HttpClient, makeHttpClient(upstream)))),
    )
    try {
      const info = await runtime.runPromise(Effect.scoped(getBuildInfo))
      expect(info).toMatchObject({
        imageDigest: 'sha256:testdigest',
        attestation: {
          sigstoreBundle: { mediaType: 'test-bundle' },
          verifyCommand:
            'gh attestation verify oci://ghcr.io/gekichumai/dxrating/backend@sha256:testdigest --repo gekichumai/dxrating',
        },
      })
      expect(await runtime.runPromise(Effect.scoped(getBuildInfo))).toBe(info)
      expect(upstream).toHaveBeenCalledTimes(3)
    } finally {
      await runtime.dispose()
    }
  })
})