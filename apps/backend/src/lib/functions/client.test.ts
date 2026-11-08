import { X509Certificate } from 'node:crypto'
import tls from 'node:tls'
import { Effect } from 'effect'
import { Response, type RequestInit } from 'undici'
import { describe, expect, it, vi } from 'vitest'
import {
  MAIMAI_NET_INTERMEDIATE_CERTIFICATES,
  MaimaiNETIntlClient,
  NetImportError,
  parseFriendCode,
  type NetImportErrorCode,
} from './client'
import { DOMParser } from 'xmldom-qsa'
import { URLS } from './URLS'

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
// Synthetic pages: the real friend code page must be checked on JP and intl accounts by the owner (design §16.4)
describe('friend code page', () => {
  const parse = (html: string) =>
    parseFriendCode(new DOMParser({ errorHandler: () => {} }).parseFromString(html, 'text/html'))

  it('reads the one code of the see-through block', () => {
    expect(
      parse(`<html><body><div class="wrapper">
        <div class="name_block f_l f_16">ＳＹＮＴＨ</div>
        <div class="see_through_block m_t_5 m_b_5 p_5 t_c f_15">9012345678901</div>
      </div></body></html>`),
    ).toBe('9012345678901')
  })

  it('falls back to the one element whose whole text is a code', () => {
    expect(
      parse('<html><body><div><span>Friend code</span><div class="code"> 9012345678901 </div></div></body></html>'),
    ).toBe('9012345678901')
  })

  it('answers null for a page without exactly one code (a login page, two candidates)', () => {
    expect(parse('<html><body><form><input name="segaId" /></form></body></html>')).toBeNull()
    expect(parse('<html><body><div>90123456789</div><div>12345678901</div></body></html>')).toBeNull()
    expect(
      parse(
        '<html><body><div class="see_through_block">90123456789</div><div class="see_through_block">12345678901</div></body></html>',
      ),
    ).toBeNull()
  })
})