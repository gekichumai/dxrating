import { Response, type RequestInit } from 'undici'
import { describe, expect, it } from 'vitest'
import { MaimaiNETIntlClient, NetImportError, type NetImportErrorCode } from './client.js'
import { URLS } from './URLS.js'

class StubIntlClient extends MaimaiNETIntlClient {
  override async fetch(url: string, _init?: RequestInit, errorRedirectCode?: NetImportErrorCode) {
    if (url === URLS.INTL.LOGIN_PAGE) {
      return new Response('', { status: 200 })
    }

    if (url === URLS.INTL.LOGIN_ENDPOINT) {
      return new Response(null, {
        status: 302,
        headers: {
          location: 'https://maimaidx-eng.com/maimai-mobile/?ssid=synthetic',
        },
      })
    }

    throw new NetImportError(errorRedirectCode ?? 'UNKNOWN_ERROR')
  }
}

describe('international maimai NET login', () => {
  it('distinguishes a rejected authenticated callback from invalid credentials', async () => {
    const client = new StubIntlClient()

    await expect(client.login({ id: 'test-id', password: 'test-password' })).rejects.toMatchObject({
      code: 'AIME_CARD_UNAVAILABLE',
    })
  })
})