import { X509Certificate } from 'node:crypto'
import tls from 'node:tls'
import { Effect } from 'effect'
import { Response, type RequestInit } from 'undici'
import { describe, expect, it, vi } from 'vitest'
import {
  MAIMAI_NET_INTERMEDIATE_CERTIFICATES,
  MaimaiNETIntlClient,
  NetImportError,
  type NetImportErrorCode,
} from './client.js'
import { URLS } from './URLS.js'

class StubIntlClient extends MaimaiNETIntlClient {
  override fetchEffect = (url: string, _init?: RequestInit, errorRedirectCode?: NetImportErrorCode) => {
    if (url === URLS.INTL.LOGIN_PAGE) {
      return Effect.succeed(new Response('', { status: 200 }))
    }

    if (url === URLS.INTL.LOGIN_ENDPOINT) {
      return Effect.succeed(
        new Response(null, {
          status: 302,
          headers: {
            location: 'https://maimaidx-eng.com/maimai-mobile/?ssid=synthetic',
          },
        }),
      )
    }

    return Effect.fail(new NetImportError(errorRedirectCode ?? 'UNKNOWN_ERROR'))
  }
}

describe('international maimai NET login', () => {
  it('distinguishes a rejected authenticated callback from invalid credentials', async () => {
    const client = new StubIntlClient()

    await expect(
      Effect.runPromise(Effect.flip(client.loginEffect({ id: 'test-id', password: 'test-password' }))),
    ).resolves.toMatchObject({
      code: 'AIME_CARD_UNAVAILABLE',
    })
  })

  it('waits for a progress consumer before starting upstream requests', async () => {
    let releaseProgress!: () => void
    let reportStarted!: () => void
    const progress = new Promise<void>((resolve) => {
      releaseProgress = resolve
    })
    const started = new Promise<void>((resolve) => {
      reportStarted = resolve
    })
    const client = new StubIntlClient(async () => {
      reportStarted()
      await progress
    })
    const request = vi.spyOn(client, 'fetchEffect')
    const login = expect(
      Effect.runPromise(Effect.flip(client.loginEffect({ id: 'test-id', password: 'test-password' }))),
    ).resolves.toMatchObject({
      code: 'AIME_CARD_UNAVAILABLE',
    })
    await started
    expect(request).not.toHaveBeenCalled()

    releaseProgress()
    await login
    expect(request).toHaveBeenCalled()
  })
})

describe('maimai NET TLS certificates', () => {
  it('trusts the current JP intermediate through a Node root certificate', () => {
    const intermediate = MAIMAI_NET_INTERMEDIATE_CERTIFICATES.map((pem) => new X509Certificate(pem)).find((cert) =>
      cert.subject.includes('CN=GlobalSign GCC R46 OV TLS CA 2025'),
    )

    expect(intermediate).toBeDefined()
    if (!intermediate) throw new Error('current maimai NET intermediate certificate is missing')
    expect(intermediate.ca).toBe(true)

    const issuer = tls.rootCertificates
      .map((pem) => new X509Certificate(pem))
      .find((root) => root.subject === intermediate.issuer)

    expect(issuer).toBeDefined()
    if (!issuer) throw new Error('issuer root certificate is missing')
    expect(intermediate.verify(issuer.publicKey)).toBe(true)
  })
})