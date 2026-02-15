import { parseHTML } from 'linkedom'
import { URLS } from './URLS'
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

function parseCookie(cookieString: string): { name: string; value: string } | null {
  const parts = cookieString.split(';')
  if (parts.length === 0) return null

  const [nameValue] = parts
  const eqIndex = nameValue.indexOf('=')
  if (eqIndex === -1) return null

  const name = nameValue.substring(0, eqIndex).trim()
  const value = nameValue.substring(eqIndex + 1).trim()

  return { name, value }
}

export class Client {
  #cookies = new Map<string, Cookie[]>()
  onUpdate?: StateUpdateCallback

  constructor(cb?: StateUpdateCallback) {
    this.onUpdate = cb
  }

  setCookie(hostname: string, headers: Headers) {
    const existingCookies = this.#cookies.get(hostname) ?? []

    const setCookieHeaders = headers.getSetCookie?.() ?? []
    for (const cookieString of setCookieHeaders) {
      const parsed = parseCookie(cookieString)
      if (!parsed) continue
      const { name, value } = parsed
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

  async fetch(url: string, init?: RequestInit): Promise<Response> {
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
    })
    this.setCookie(requestURL.hostname, res.headers)

    if (res.status === 302 && URLS.CHECKLIST.ERROR.includes(res.headers.get('location') ?? '')) {
      throw new Error('unknown error occurred: response redirects to error page')
    }

    return res
  }

  async fetchAsDOM(url: string, init?: RequestInit): Promise<Document> {
    const res = await this.fetch(url, init)
    const text = await res.text()
    this.checkMaintenance(text)
    const { document } = parseHTML(text)
    return document
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
    const loginPageToken = loginPage?.querySelector('input[name="token"]')?.getAttribute('value')
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
      const { document: textDom } = parseHTML(redirectDestinationText)
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
