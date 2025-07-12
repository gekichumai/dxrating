import cookie from 'cookie'
import tls from 'node:tls'
import { DOMParser } from 'xmldom-qsa'
import { URLS } from './URLS'

import { Agent, Headers, type RequestInit, fetch } from 'undici'
import { parseMusicRecordNode } from './parseMusicRecordNode'
import { parseRecentRecordNode } from './parseRecentRecordNode'
import type { AchievementRecord } from './record'

export interface AuthParams {
  id: string
  password: string
}

export const NODE_ELEMENT_NODE = 1
export const NODE_TEXT_NODE = 3

function musicRecordURLs(base: string) {
  const difficulties = [
    { value: 0, fetchState: 'fetch:music:in-progress:basic' },
    { value: 1, fetchState: 'fetch:music:in-progress:advanced' },
    { value: 2, fetchState: 'fetch:music:in-progress:expert' },
    { value: 3, fetchState: 'fetch:music:in-progress:master' },
    { value: 4, fetchState: 'fetch:music:in-progress:remaster' },
    { value: 10, fetchState: 'fetch:music:in-progress:utage' },
  ]
  return difficulties.map(({ value, fetchState }) => ({
    url: `${base}?genre=99&diff=${value}`,
    fetchState: fetchState as ClientFetchState,
  }))
}

const AGENT = new Agent({
  connect: {
    ca: [
      ...tls.rootCertificates,
      `-----BEGIN CERTIFICATE-----
MIIETjCCAzagAwIBAgINAe5fIh38YjvUMzqFVzANBgkqhkiG9w0BAQsFADBMMSAw
HgYDVQQLExdHbG9iYWxTaWduIFJvb3QgQ0EgLSBSMzETMBEGA1UEChMKR2xvYmFs
U2lnbjETMBEGA1UEAxMKR2xvYmFsU2lnbjAeFw0xODExMjEwMDAwMDBaFw0yODEx
MjEwMDAwMDBaMFAxCzAJBgNVBAYTAkJFMRkwFwYDVQQKExBHbG9iYWxTaWduIG52
LXNhMSYwJAYDVQQDEx1HbG9iYWxTaWduIFJTQSBPViBTU0wgQ0EgMjAxODCCASIw
DQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAKdaydUMGCEAI9WXD+uu3Vxoa2uP
UGATeoHLl+6OimGUSyZ59gSnKvuk2la77qCk8HuKf1UfR5NhDW5xUTolJAgvjOH3
idaSz6+zpz8w7bXfIa7+9UQX/dhj2S/TgVprX9NHsKzyqzskeU8fxy7quRU6fBhM
abO1IFkJXinDY+YuRluqlJBJDrnw9UqhCS98NE3QvADFBlV5Bs6i0BDxSEPouVq1
lVW9MdIbPYa+oewNEtssmSStR8JvA+Z6cLVwzM0nLKWMjsIYPJLJLnNvBhBWk0Cq
o8VS++XFBdZpaFwGue5RieGKDkFNm5KQConpFmvv73W+eka440eKHRwup08CAwEA
AaOCASkwggElMA4GA1UdDwEB/wQEAwIBhjASBgNVHRMBAf8ECDAGAQH/AgEAMB0G
A1UdDgQWBBT473/yzXhnqN5vjySNiPGHAwKz6zAfBgNVHSMEGDAWgBSP8Et/qC5F
JK5NUPpjmove4t0bvDA+BggrBgEFBQcBAQQyMDAwLgYIKwYBBQUHMAGGImh0dHA6
Ly9vY3NwMi5nbG9iYWxzaWduLmNvbS9yb290cjMwNgYDVR0fBC8wLTAroCmgJ4Yl
aHR0cDovL2NybC5nbG9iYWxzaWduLmNvbS9yb290LXIzLmNybDBHBgNVHSAEQDA+
MDwGBFUdIAAwNDAyBggrBgEFBQcCARYmaHR0cHM6Ly93d3cuZ2xvYmFsc2lnbi5j
b20vcmVwb3NpdG9yeS8wDQYJKoZIhvcNAQELBQADggEBAJmQyC1fQorUC2bbmANz
EdSIhlIoU4r7rd/9c446ZwTbw1MUcBQJfMPg+NccmBqixD7b6QDjynCy8SIwIVbb
0615XoFYC20UgDX1b10d65pHBf9ZjQCxQNqQmJYaumxtf4z1s4DfjGRzNpZ5eWl0
6r/4ngGPoJVpjemEuunl1Ig423g7mNA2eymw0lIYkN5SQwCuaifIFJ6GlazhgDEw
fpolu4usBCOmmQDo8dIm7A9+O4orkjgTHY+GzYZSR+Y0fFukAj6KYXwidlNalFMz
hriSqHKvoflShx8xpfywgVcvzfTO3PYkz6fiNJBonf6q8amaEsybwMbDqKWwIX7e
SPY=
-----END CERTIFICATE-----`,
    ],
  },
})

const COMMON_HEADERS = {
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  'Accept-Language': 'ja;q=0.9,en;q=0.8',
  DNT: '1',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'same-origin',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
  'sec-ch-ua': '"Chromium";v="121", "Not A(Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
}

interface Cookie {
  name: string
  value: string
}

type ClientFetchState =
  | 'ready'
  | 'auth:in-progress'
  | 'auth:succeeded'
  | 'fetch:recent:in-progress'
  | 'fetch:recent:completed'
  | 'fetch:music:in-progress:basic'
  | 'fetch:music:in-progress:advanced'
  | 'fetch:music:in-progress:expert'
  | 'fetch:music:in-progress:master'
  | 'fetch:music:in-progress:remaster'
  | 'fetch:music:in-progress:utage'
  | 'fetch:music:completed'
  | 'concluded'

export type StateUpdateCallback = (newState: ClientFetchState) => void

export class Client {
  #cookies = new Map<string, Cookie[]>()
  onUpdate?: StateUpdateCallback

  constructor(cb?: StateUpdateCallback) {
    this.onUpdate = cb
  }

  setCookie(hostname: string, headers: Headers) {
    const existingCookies = this.#cookies.get(hostname) ?? []

    for (const cookieString of headers.getSetCookie()) {
      const c = cookie.parse(cookieString)
      if (!c) continue
      const name = Object.keys(c)[0]
      const value = c[name]
      const exist = existingCookies.findIndex((e) => e.name === name)
      if (exist >= 0) {
        existingCookies.splice(exist, 1)
      }
      existingCookies.push({ name, value })
    }

    this.#cookies.set(hostname, existingCookies)
  }

  getCookies(hostname: string) {
    return this.#cookies.get(hostname) ?? []
  }

  clearCookies(hostname: string) {
    this.#cookies.delete(hostname)
  }

  async fetch(url: string, init?: RequestInit) {
    const requestURL = new URL(url)
    const cookies = this.getCookies(requestURL.hostname)
    const initHeaders = {
      ...(init?.headers as Record<string, string>),
      Referer: `${requestURL.protocol}//${requestURL.hostname}`,
      ...COMMON_HEADERS,
    }
    const headers = new Headers(initHeaders)
    headers.set('Cookie', cookies.map((c) => `${c.name}=${c.value}`).join('; '))

    const res = await fetch(url, {
      redirect: 'manual',
      ...init,
      headers,
      dispatcher: AGENT,
    })
    this.setCookie(requestURL.hostname, res.headers)

    if (res.status === 302 && URLS.CHECKLIST.ERROR.includes(res.headers.get('location') ?? '')) {
      throw new Error('unknown error occurred: response redirects to error page')
    }

    return res
  }

  async fetchAsDOM(url: string, init?: RequestInit) {
    const res = await this.fetch(url, init)
    const text = await res.text()
    this.checkMaintenance(text)
    return new DOMParser({
      errorHandler: () => {
        // ignore errors
      },
    }).parseFromString(text, 'text/html')
  }

  checkMaintenance(text: string) {
    if (URLS.CHECKLIST.MAINTENANCE.some((m) => text.includes(m))) {
      throw new Error('NET maintenance is currently ongoing. Please try again later.')
    }
  }
}

export class MaimaiNETJpClient extends Client {
  async login({ id, password }: AuthParams) {
    this.onUpdate?.('auth:in-progress')

    const loginPage = await this.fetchAsDOM(URLS.JP.LOGIN_PAGE)
    const loginPageToken = loginPage?.querySelector('input[name="token"]')?.attributes.getNamedItem('value')?.value
    if (!loginPageToken) throw new Error('unable to fetch token')

    const login = await this.fetch(URLS.JP.LOGIN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        segaId: id,
        password: password,
        save_cookie: 'on',
        token: loginPageToken,
      }),
    })
    if (URLS.CHECKLIST.ERROR.includes(login.headers.get('location') ?? '')) {
      throw new Error('invalid credentials: failed to login')
    }

    await this.fetch(URLS.JP.LOGIN_AIMELIST)
    await this.fetch(URLS.JP.LOGIN_AIMELIST_SUBMIT)
    await this.fetch(URLS.JP.HOMEPAGE)

    this.onUpdate?.('auth:succeeded')
  }

  async fetchRecentRecords() {
    this.onUpdate?.('fetch:recent:in-progress')
    const recentRecordsPage = await this.fetchAsDOM(URLS.JP.RECORD_RECENT_PAGE)
    if (!recentRecordsPage) {
      throw new Error('internal server error: failed to parse record page')
    }
    const records = Array.from(recentRecordsPage.querySelectorAll('.wrapper > div.p_10')).flatMap(parseRecentRecordNode)
    this.onUpdate?.('fetch:recent:completed')
    return records
  }

  async fetchMusicRecords() {
    const musicRecords: AchievementRecord[] = []
    for (const { url, fetchState } of musicRecordURLs(URLS.JP.RECORD_MUSICS_PAGE)) {
      const musicRecordsPage = await this.fetchAsDOM(url)
      if (!musicRecordsPage) {
        throw new Error('internal server error: failed to parse music records page')
      }
      musicRecords.push(
        ...Array.from(musicRecordsPage.querySelectorAll('.w_450.m_15.p_r.f_0')).flatMap(parseMusicRecordNode),
      )
      this.onUpdate?.(fetchState)
    }
    this.onUpdate?.('fetch:music:completed')
    return musicRecords
  }
}

export class MaimaiNETIntlClient extends Client {
  async login({ id, password }: AuthParams) {
    this.onUpdate?.('auth:in-progress')

    await this.fetch(URLS.INTL.LOGIN_PAGE)

    const redirectURL = (
      await this.fetch(URLS.INTL.LOGIN_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          sid: id,
          password,
          retention: '1',
        }),
      })
    ).headers.get('location')
    if (!redirectURL) {
      throw new Error('invalid credentials: empty redirectURL')
    }

    const redirectDestinationResponse = await this.fetch(redirectURL)

    const redirectDestinationText = await redirectDestinationResponse.text()
    this.checkMaintenance(redirectDestinationText)

    if (redirectURL.startsWith('https://lng-tgk-aime-gw.am-all.net/common_auth/login')) {
      const textDom = new DOMParser({
        errorHandler: () => {
          // ignore errors
        },
      }).parseFromString(redirectDestinationText, 'text/html')
      const errorString = textDom.querySelector('#error')?.textContent?.trim() ?? 'failed to login'
      throw new Error(`invalid credentials: ${errorString}`)
    }

    this.onUpdate?.('auth:succeeded')
  }

  async fetchRecentRecords() {
    this.onUpdate?.('fetch:recent:in-progress')

    const recentRecordsPage = await this.fetchAsDOM(URLS.INTL.RECORD_RECENT_PAGE)
    if (!recentRecordsPage) {
      throw new Error('internal server error: failed to parse record page')
    }
    const records = Array.from(recentRecordsPage.querySelectorAll('.wrapper > div.p_10')).flatMap(parseRecentRecordNode)

    this.onUpdate?.('fetch:recent:completed')
    return records
  }

  async fetchMusicRecords() {
    const musicRecords: AchievementRecord[] = []
    for (const { url, fetchState } of musicRecordURLs(URLS.INTL.RECORD_MUSICS_PAGE)) {
      const musicRecordsPage = await this.fetchAsDOM(url)
      if (!musicRecordsPage) {
        throw new Error('internal server error: failed to parse music records page')
      }
      musicRecords.push(
        ...Array.from(musicRecordsPage.querySelectorAll('.w_450.m_15.p_r.f_0')).flatMap(parseMusicRecordNode),
      )
      this.onUpdate?.(fetchState)
    }
    this.onUpdate?.('fetch:music:completed')
    return musicRecords
  }
}
