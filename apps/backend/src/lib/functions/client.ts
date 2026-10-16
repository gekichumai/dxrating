import { Effect, Data, Schedule } from 'effect'

export class NetRequestError extends Data.TaggedError('NetRequestError')<{
  readonly operation: string
  readonly cause: unknown
}> {
  get message() {
    return this.cause instanceof Error ? this.cause.message : this.operation + ' failed'
  }
}

import cookie from 'cookie'
import tls from 'node:tls'
import { DOMParser } from 'xmldom-qsa'
import { URLS } from './URLS'

import { Agent, Headers, type RequestInit, fetch } from 'undici'
import { parseMusicRecordNode } from './parseMusicRecordNode'
import { parseRecentRecordNode } from './parseRecentRecordNode'
import type { AchievementRecord } from './record'

const parseNetResponse = <A>(parse: () => A) =>
  Effect.try({
    try: parse,
    catch: (cause) => new NetRequestError({ operation: 'parse maimai NET response', cause }),
  })

export interface AuthParams {
  id: string
  password: string
}

export type NetImportErrorCode =
  | 'NET_MAINTENANCE'
  | 'INVALID_CREDENTIALS'
  | 'AIME_CARD_UNAVAILABLE'
  | 'UNKNOWN_ERROR'
  | 'INTERNAL_ERROR'
  | 'TOKEN_ERROR'

export class NetImportError extends Data.TaggedError('NetImportError')<{
  readonly code: NetImportErrorCode
  readonly message: string
}> {
  constructor(code: NetImportErrorCode, message?: string) {
    super({ code, message: message ?? code })
  }
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

export const MAIMAI_NET_INTERMEDIATE_CERTIFICATES = [
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
  `-----BEGIN CERTIFICATE-----
MIIFfDCCA2SgAwIBAgIRAIRDWJCDb2c5QYLLnJpdyZ8wDQYJKoZIhvcNAQELBQAw
RjELMAkGA1UEBhMCQkUxGTAXBgNVBAoTEEdsb2JhbFNpZ24gbnYtc2ExHDAaBgNV
BAMTE0dsb2JhbFNpZ24gUm9vdCBSNDYwHhcNMjUwOTE3MDI1NTU2WhcNMjkwNjIz
MDAwMDAwWjBUMQswCQYDVQQGEwJCRTEZMBcGA1UEChMQR2xvYmFsU2lnbiBudi1z
YTEqMCgGA1UEAxMhR2xvYmFsU2lnbiBHQ0MgUjQ2IE9WIFRMUyBDQSAyMDI1MIIB
IjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1JyrGiv+210Lw4LTp9qxx9WC
o6w8HnxcTKr5XwR6WwtKidGXriLqGXtBINGTi4HUZ1Vl3FUIvscLwNcq2DRLwjWs
cYFNClVnuSw4CtwAcfa7Iltz+0FmFeh/KOWv5BfgCxAo9FaeXRG725b2eedo/7fb
0zBc6M/XcfQREVteZ6GovnLE96+T8RzRImvX38Y8vZoulp/XWv3p09C1pgp/53+1
itDl7xbrM4sglGNkeJ5LBN2dOR1sqWCMZ/V4a4cPQwopBtZis1vVh7/k4S6Ysgk0
CTi5vei0RSEIhxoFk48BHSXzTA4FJxqjfauYCZ4M5tmZ/R5VgXOZ4Ck/PifnXQID
AQABo4IBVTCCAVEwDgYDVR0PAQH/BAQDAgGGMBMGA1UdJQQMMAoGCCsGAQUFBwMB
MBIGA1UdEwEB/wQIMAYBAf8CAQAwHQYDVR0OBBYEFGl0Pq/DWwGVSe4UQVqT+rEw
mNqiMB8GA1UdIwQYMBaAFANcq3OBh6jMsKbVlOI2lkn/BZksMHsGCCsGAQUFBwEB
BG8wbTAuBggrBgEFBQcwAYYiaHR0cDovL29jc3AuZ2xvYmFsc2lnbi5jb20vcm9v
dHI0NjA7BggrBgEFBQcwAoYvaHR0cDovL3NlY3VyZS5nbG9iYWxzaWduLmNvbS9j
YWNlcnQvcm9vdHI0Ni5jcnQwNgYDVR0fBC8wLTAroCmgJ4YlaHR0cDovL2NybC5n
bG9iYWxzaWduLmNvbS9yb290cjQ2LmNybDAhBgNVHSAEGjAYMAgGBmeBDAECAjAM
BgorBgEEAaAyCgECMA0GCSqGSIb3DQEBCwUAA4ICAQBEUTiKxe5jEintARUvLBm9
qWZtGiOSV9E+3bntbFFBDBAroqwB6Cj53Zp/W08HwgxaPXdkVaRNYHB/eAatEtSm
1ldtoorfPc+mVlzbwCwfbpIs2uqW5rF78ne37qy2o+iVnJptq9AzPnlC03+zhhB9
JwmjUXVtPuqQZ96tFl0fAT77xGSLzCO8yfEDrxCqdWz2wneShSbCCsC15JB07OgO
StE+MsVBkwe5+PNzAlAr8NZ6f8mzeY/FzaBzlhYw5+c1yyzXJqp+gjRXWrLpD3Ho
hGOvIXIvCBnyVrYI/HPe6DR5w7oteui9Rt0xfUUudaTkt0iz7fc23eGboZ+bpvgT
gbd/kYK6JOrxawMyfBYxrR5zDHIJX0Mws99DNgACKBUfFadKAfwFw0+0airY5WAI
Xs8yhCb5XGwyzVpcB30BrQbWtqdI0PoE9usNvNbH3YFGfuS8oRmAJEgUUQnwOoGK
jMWtHacw0n8QESdRM274LJvLd9nwawYU4svJpf06FtKPqGH3nXefL741NO9KzDAG
PM11YScyJVfYdBDXFM86HU1fBGTKlkLcG/qMJxOqppY4wydRI3koSH6A78nO2QaJ
yqjTOQyCNHaSlmGjdiOvhJ8y1PiazHnuvWBx6z+7JJF2ukqqfjlSARwyfkfnRUIY
la7ZYEqcc56eoPAiElhvrg==
-----END CERTIFICATE-----`,
] as const

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

export type StateUpdateCallback = (newState: ClientFetchState) => void | Promise<void>

export class Client {
  #cookies = new Map<string, Cookie[]>()
  #agent: Agent | undefined
  onUpdate?: StateUpdateCallback

  constructor(cb?: StateUpdateCallback) {
    this.onUpdate = cb
  }

  setCookie(hostname: string, headers: Headers) {
    const existingCookies: Cookie[] = this.#cookies.get(hostname) ?? []

    for (const cookieString of headers.getSetCookie()) {
      const c = cookie.parse(cookieString)
      if (!c) continue
      const name = Object.keys(c)[0]
      const value = c[name]
      const exist = existingCookies.findIndex((e) => e.name === name)
      if (exist >= 0) {
        existingCookies.splice(exist, 1)
      }
      existingCookies.push({ name, value: value ?? '' })
    }

    this.#cookies.set(hostname, existingCookies)
  }

  getCookies(hostname: string) {
    return this.#cookies.get(hostname) ?? []
  }

  clearCookies(hostname: string) {
    this.#cookies.delete(hostname)
  }

  fetchEffect = (url: string, init?: RequestInit, errorRedirectCode: NetImportErrorCode = 'UNKNOWN_ERROR') =>
    Effect.gen({ self: this }, function* () {
      const requestURL = yield* parseNetResponse(() => new URL(url))
      const cookies = this.getCookies(requestURL.hostname)
      const headers = new Headers({
        ...(init?.headers as Record<string, string>),
        Referer: `${requestURL.protocol}//${requestURL.hostname}`,
        ...COMMON_HEADERS,
      })
      headers.set('Cookie', cookies.map((c) => `${c.name}=${c.value}`).join('; '))
      this.#agent ??= new Agent({ connect: { ca: [...tls.rootCertificates, ...MAIMAI_NET_INTERMEDIATE_CERTIFICATES] } })
      const res = yield* Effect.tryPromise({
        try: (signal) =>
          fetch(url, {
            redirect: 'manual',
            ...init,
            headers,
            dispatcher: this.#agent,
            signal: init?.signal ? AbortSignal.any([signal, init.signal]) : signal,
          }),
        catch: (cause) => new NetRequestError({ operation: 'request maimai NET', cause }),
      })
      this.setCookie(requestURL.hostname, res.headers)
      if (res.status === 302 && URLS.CHECKLIST.ERROR.includes(res.headers.get('location') ?? '')) {
        yield* Effect.tryPromise({
          try: () => res.body?.cancel() ?? Promise.resolve(),
          catch: (cause) => new NetRequestError({ operation: 'release maimai NET response', cause }),
        })
        return yield* Effect.fail(
          new NetImportError(
            errorRedirectCode,
            errorRedirectCode === 'AIME_CARD_UNAVAILABLE'
              ? 'SEGA ID authentication succeeded, but maimai NET did not provide a usable Aime card.'
              : 'maimai NET redirected the request to its error page.',
          ),
        )
      }
      return res
    })

  fetchAsDOMEffect = (url: string, init?: RequestInit) =>
    Effect.gen({ self: this }, function* () {
      const res = yield* this.fetchEffect(url, init)
      const text = yield* Effect.tryPromise({
        try: () => res.text(),
        catch: (cause) => new NetRequestError({ operation: 'read maimai NET response', cause }),
      })
      yield* this.checkMaintenanceEffect(text)
      return yield* Effect.try({
        try: () => new DOMParser({ errorHandler: () => {} }).parseFromString(text, 'text/html'),
        catch: () => new NetImportError('INTERNAL_ERROR', 'failed to parse record page'),
      })
    })

  protected fetchRecordPageEffect = (url: string) =>
    this.fetchAsDOMEffect(url).pipe(
      Effect.retry({
        times: 2,
        schedule: Schedule.exponential('500 millis'),
        while: (error) => error instanceof NetImportError && error.code === 'UNKNOWN_ERROR',
      }),
    )

  protected progress = (state: ClientFetchState) =>
    Effect.tryPromise({
      try: async () => {
        await this.onUpdate?.(state)
      },
      catch: (cause) => new NetRequestError({ operation: 'publish maimai NET progress', cause }),
    })

  protected checkMaintenanceEffect = (text: string) =>
    Effect.try({
      try: () => this.checkMaintenance(text),
      catch: (error) => (error instanceof NetImportError ? error : new NetImportError('INTERNAL_ERROR')),
    })

  disposeEffect = () =>
    Effect.tryPromise({
      try: async () => {
        await this.#agent?.destroy()
        this.#agent = undefined
        this.#cookies.clear()
      },
      catch: (cause) => new NetRequestError({ operation: 'close maimai NET connections', cause }),
    })

  checkMaintenance(text: string) {
    if (URLS.CHECKLIST.MAINTENANCE.some((m) => text.includes(m))) {
      throw new NetImportError('NET_MAINTENANCE')
    }
  }
}

export class MaimaiNETJpClient extends Client {
  loginEffect = ({ id, password }: AuthParams) =>
    Effect.gen({ self: this }, function* () {
      yield* this.progress('auth:in-progress')

      const loginPage = yield* this.fetchAsDOMEffect(URLS.JP.LOGIN_PAGE)
      const loginPageToken = loginPage?.querySelector('input[name="token"]')?.attributes.getNamedItem('value')?.value
      if (!loginPageToken) return yield* Effect.fail(new NetImportError('TOKEN_ERROR'))

      const login = yield* this.fetchEffect(
        URLS.JP.LOGIN_ENDPOINT,
        {
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
        },
        'INVALID_CREDENTIALS',
      )
      if (URLS.CHECKLIST.ERROR.includes(login.headers.get('location') ?? '')) {
        return yield* Effect.fail(new NetImportError('INVALID_CREDENTIALS'))
      }

      yield* Effect.tryPromise({
        try: () => login.body?.cancel() ?? Promise.resolve(),
        catch: (cause) => new NetRequestError({ operation: 'release maimai NET login response', cause }),
      })
      for (const url of [URLS.JP.LOGIN_AIMELIST, URLS.JP.LOGIN_AIMELIST_SUBMIT, URLS.JP.HOMEPAGE]) {
        const response = yield* this.fetchEffect(url)
        yield* Effect.tryPromise({
          try: () => response.body?.cancel() ?? Promise.resolve(),
          catch: (cause) => new NetRequestError({ operation: 'release maimai NET login response', cause }),
        })
      }

      yield* this.progress('auth:succeeded')
    })

  fetchRecentRecordsEffect = () =>
    Effect.gen({ self: this }, function* () {
      yield* this.progress('fetch:recent:in-progress')
      const recentRecordsPage = yield* this.fetchRecordPageEffect(URLS.JP.RECORD_RECENT_PAGE)
      if (!recentRecordsPage) {
        return yield* Effect.fail(new NetImportError('INTERNAL_ERROR', 'failed to parse record page'))
      }
      const records = yield* parseNetResponse(() =>
        Array.from(recentRecordsPage.querySelectorAll('.wrapper > div.p_10')).flatMap(parseRecentRecordNode),
      )
      yield* this.progress('fetch:recent:completed')
      return records
    })

  fetchMusicRecordsEffect = () =>
    Effect.gen({ self: this }, function* () {
      const musicRecords: AchievementRecord[] = []
      for (const { url, fetchState } of musicRecordURLs(URLS.JP.RECORD_MUSICS_PAGE)) {
        const musicRecordsPage = yield* this.fetchRecordPageEffect(url)
        if (!musicRecordsPage) {
          return yield* Effect.fail(new NetImportError('INTERNAL_ERROR', 'failed to parse music records page'))
        }
        const records = yield* parseNetResponse(() =>
          Array.from(musicRecordsPage.querySelectorAll('.w_450.m_15.p_r.f_0')).flatMap(parseMusicRecordNode),
        )
        musicRecords.push(...records)
        yield* this.progress(fetchState)
      }
      yield* this.progress('fetch:music:completed')
      return musicRecords
    })
}

export class MaimaiNETIntlClient extends Client {
  loginEffect = ({ id, password }: AuthParams) =>
    Effect.gen({ self: this }, function* () {
      yield* this.progress('auth:in-progress')

      const loginPage = yield* this.fetchEffect(URLS.INTL.LOGIN_PAGE)
      yield* Effect.tryPromise({
        try: () => loginPage.body?.cancel() ?? Promise.resolve(),
        catch: (cause) => new NetRequestError({ operation: 'release maimai NET login page', cause }),
      })

      const loginResponse = yield* this.fetchEffect(URLS.INTL.LOGIN_ENDPOINT, {
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
      if (loginResponse.status !== 302) {
        return yield* Effect.fail(
          new NetImportError(
            'INTERNAL_ERROR',
            `unexpected login response status: ${loginResponse.status} ${URLS.INTL.LOGIN_ENDPOINT}`,
          ),
        )
      }
      const redirectURL = loginResponse.headers.get('location')
      yield* Effect.tryPromise({
        try: () => loginResponse.body?.cancel() ?? Promise.resolve(),
        catch: (cause) => new NetRequestError({ operation: 'release maimai NET login response', cause }),
      })
      if (!redirectURL) {
        return yield* Effect.fail(new NetImportError('INVALID_CREDENTIALS'))
      }

      const redirectDestinationResponse = yield* this.fetchEffect(redirectURL, undefined, 'AIME_CARD_UNAVAILABLE')

      const redirectDestinationText = yield* Effect.tryPromise({
        try: () => redirectDestinationResponse.text(),
        catch: (cause) => new NetRequestError({ operation: 'read maimai NET login response', cause }),
      })
      yield* this.checkMaintenanceEffect(redirectDestinationText)

      if (redirectURL.startsWith('https://lng-tgk-aime-gw.am-all.net/common_auth/login')) {
        const textDom = yield* parseNetResponse(() =>
          new DOMParser({ errorHandler: () => {} }).parseFromString(redirectDestinationText, 'text/html'),
        )
        const errorString = textDom.querySelector('#error')?.textContent?.trim() ?? undefined
        return yield* Effect.fail(new NetImportError('INVALID_CREDENTIALS', errorString))
      }

      yield* this.progress('auth:succeeded')
    })

  fetchRecentRecordsEffect = () =>
    Effect.gen({ self: this }, function* () {
      yield* this.progress('fetch:recent:in-progress')

      const recentRecordsPage = yield* this.fetchRecordPageEffect(URLS.INTL.RECORD_RECENT_PAGE)
      if (!recentRecordsPage) {
        return yield* Effect.fail(new NetImportError('INTERNAL_ERROR', 'failed to parse record page'))
      }
      const records = yield* parseNetResponse(() =>
        Array.from(recentRecordsPage.querySelectorAll('.wrapper > div.p_10')).flatMap(parseRecentRecordNode),
      )

      yield* this.progress('fetch:recent:completed')
      return records
    })

  fetchMusicRecordsEffect = () =>
    Effect.gen({ self: this }, function* () {
      const musicRecords: AchievementRecord[] = []
      for (const { url, fetchState } of musicRecordURLs(URLS.INTL.RECORD_MUSICS_PAGE)) {
        const musicRecordsPage = yield* this.fetchRecordPageEffect(url)
        if (!musicRecordsPage) {
          return yield* Effect.fail(new NetImportError('INTERNAL_ERROR', 'failed to parse music records page'))
        }
        const records = yield* parseNetResponse(() =>
          Array.from(musicRecordsPage.querySelectorAll('.w_450.m_15.p_r.f_0')).flatMap(parseMusicRecordNode),
        )
        musicRecords.push(...records)
        yield* this.progress(fetchState)
      }
      yield* this.progress('fetch:music:completed')
      return musicRecords
    })
}

export const withMaimaiNETClient = <A, E, R>(
  region: 'jp' | 'intl',
  use: (client: MaimaiNETJpClient | MaimaiNETIntlClient) => Effect.Effect<A, E, R>,
  onProgress?: StateUpdateCallback,
) =>
  Effect.scoped(
    Effect.acquireRelease(
      Effect.sync(() => (region === 'jp' ? new MaimaiNETJpClient(onProgress) : new MaimaiNETIntlClient(onProgress))),
      (client) => client.disposeEffect().pipe(Effect.orDie),
    ).pipe(Effect.flatMap(use)),
  )