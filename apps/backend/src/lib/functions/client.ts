import { Effect, Data, Option, Schedule } from 'effect'

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
import { DOMParser, XMLSerializer } from 'xmldom-qsa'
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

/**
 * The request of an import that failed, for Sentry: derived from the URL path alone (never the URL, which may carry a
 * session id), so it is a small fixed set
 */
export type NetStep =
  | 'login_page'
  | 'login_submit'
  | 'login_callback'
  | 'aime_list'
  | 'aime_select'
  | 'home'
  | 'record_recent'
  | `record_music_${string}`
  | 'other'

export interface NetImportErrorDetails {
  /** The request that failed */
  readonly step?: NetStep
  /** The ERROR CODE maimai NET showed on its error page, digits only */
  readonly netErrorCode?: string
  /**
   * What SEGA's page said when it refused the request: its error text or title, and whether it showed a captcha.
   * The submitted ID, e-mail addresses and long digit runs are removed (pageSignals).
   */
  readonly upstreamMessage?: string
}

export class NetImportError extends Data.TaggedError('NetImportError')<{
  readonly code: NetImportErrorCode
  readonly message: string
  readonly step?: NetStep
  readonly netErrorCode?: string
  readonly upstreamMessage?: string
}> {
  constructor(code: NetImportErrorCode, message?: string, details: NetImportErrorDetails = {}) {
    super({ code, message: message ?? code, ...details })
  }
}

const MUSIC_DIFFICULTY_NAMES: Record<string, string> = {
  '0': 'basic',
  '1': 'advanced',
  '2': 'expert',
  '3': 'master',
  '4': 'remaster',
  '10': 'utage',
}

export function netStepOf(url: string): NetStep {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return 'other'
  }
  const path = parsed.pathname
  if (path.startsWith('/common_auth/login/sid')) return 'login_submit'
  if (path.startsWith('/common_auth/login')) return 'login_page'
  if (path.endsWith('/maimai-mobile/submit/')) return 'login_submit'
  if (path.includes('/aimeList/submit')) return 'aime_select'
  if (path.includes('/aimeList')) return 'aime_list'
  if (path.endsWith('/maimai-mobile/home/')) return 'home'
  if (path.includes('/record/musicGenre/search')) {
    return `record_music_${MUSIC_DIFFICULTY_NAMES[parsed.searchParams.get('diff') ?? ''] ?? 'other'}`
  }
  if (/\/maimai-mobile\/record\/?$/.test(path)) return 'record_recent'
  // the international SEGA ID callback (?ssid=...) and the JP login page
  if (/\/maimai-mobile\/?$/.test(path)) return parsed.searchParams.has('ssid') ? 'login_callback' : 'login_page'
  return 'other'
}

/** The ERROR CODE of a maimai NET error page ("ERROR CODE：100001"), digits only; nothing else of the page is kept */
export function parseNetErrorCode(html: string): string | undefined {
  return /ERROR\s*CODE\s*[：:]\s*(\d{1,10})/i.exec(html)?.[1]
}

/** What we know an error page's code means, for the person importing; other codes get a generic message */
const NET_ERROR_MESSAGES: Record<string, string> = {
  '100001':
    'maimai NET ended the session and asked to log in again (ERROR CODE 100001). Try again in a few minutes. If it keeps happening, log in to maimai NET in a browser once, then retry.',
}

export function netErrorPageMessage(netErrorCode: string | undefined): string {
  if (!netErrorCode) return 'maimai NET redirected the request to its error page.'
  return NET_ERROR_MESSAGES[netErrorCode] ?? `maimai NET showed its error page (ERROR CODE ${netErrorCode}).`
}

const MAINTENANCE_MESSAGE = 'maimai NET or the SEGA ID login is under maintenance.'

const CAPTCHA_MARKERS = [
  'g-recaptcha',
  'recaptcha/api',
  'hcaptcha',
  'challenges.cloudflare.com/turnstile',
  'cf-turnstile',
]

/**
 * A short description of a SEGA page that refused a request, for diagnosis: its #error text (else its title), and a
 * captcha if one is on it. Never the form, the URL or anything typed: the submitted ID, e-mail addresses and runs of 6+
 * digits are removed, and the result is cut to 200 characters.
 */
export function pageSignals(html: string, submittedId?: string): string | undefined {
  // never throws: it only describes a failure, so an empty or broken page has no signals rather than a defect
  let dom: Document | undefined
  try {
    dom = html.trim() ? new DOMParser({ errorHandler: () => {} }).parseFromString(html, 'text/html') : undefined
  } catch {
    dom = undefined
  }
  const text = (selector: string) => dom?.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() || undefined
  const parts = [
    text('#error') ?? text('.error') ?? text('title'),
    CAPTCHA_MARKERS.some((marker) => html.includes(marker)) ? 'captcha' : undefined,
  ].filter((part): part is string => Boolean(part))
  if (parts.length === 0) return undefined
  let signals = parts.join(' | ')
  if (submittedId) signals = signals.split(submittedId).join('[id]')
  signals = signals.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]').replace(/\d{6,}/g, '[number]')
  return Array.from(signals).slice(0, 200).join('')
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

export interface ClientOptions {
  strictPages?: boolean
}

/**
 * The friend code shown on `/maimai-mobile/friend/userFriendCode/`: the one text of digits in a
 * `see_through_block`, or else the one element whose whole text is digits. `null` unless exactly one distinct code
 * is found. Written against synthetic fixtures; the page must be checked on real JP and intl accounts (design §16.4).
 */
const hasNoChildElements = (element: Element) =>
  !Array.from(element.childNodes).some((node) => node.nodeType === NODE_ELEMENT_NODE)

export function parseFriendCode(page: Document): string | null {
  const codeOf = (element: Element) => {
    const text = element.textContent?.replace(/\s+/g, '') ?? ''
    return /^\d{8,20}$/.test(text) ? text : null
  }
  const distinct = (elements: Element[]) => [
    ...new Set(elements.map(codeOf).filter((code): code is string => code !== null)),
  ]
  const blocks = distinct(Array.from(page.querySelectorAll('.see_through_block')))
  if (blocks.length === 1) return blocks[0]!
  if (blocks.length > 1) return null
  const leaves = distinct(Array.from(page.querySelectorAll('div, span, p, td')).filter(hasNoChildElements))
  return leaves.length === 1 ? leaves[0]! : null
}

export type StateUpdateCallback = (newState: ClientFetchState) => void | Promise<void>

export class Client {
  #cookies = new Map<string, Cookie[]>()
  #agent: Agent | undefined
  onUpdate?: StateUpdateCallback

  /** Fail on any record page that is not a 200 (cloud save imports); the legacy routes keep their behavior */
  readonly strictPages: boolean

  constructor(cb?: StateUpdateCallback, options: ClientOptions = {}) {
    this.onUpdate = cb
    this.strictPages = options.strictPages ?? false
  }

  /**
   * The player's friend code from the friend code page, or `null` when the page cannot be read or does not show
   * exactly one code (callers fall back to a hashed SEGA ID). Never fails.
   */
  protected fetchFriendCodeAtEffect = (url: string) =>
    this.fetchStrictPageEffect(url).pipe(
      Effect.map((page) => parseFriendCode(page)),
      Effect.orElseSucceed(() => null),
    )

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

  /** One request with the cookies of the client, no redirect followed */
  protected requestEffect = (url: string, init?: RequestInit) =>
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
      return res
    })

  protected releaseEffect = (res: { body?: { cancel(): Promise<void> } | null }) =>
    Effect.tryPromise({
      try: () => res.body?.cancel() ?? Promise.resolve(),
      catch: (cause) => new NetRequestError({ operation: 'release maimai NET response', cause }),
    })

  /**
   * The ERROR CODE of the error page a request was redirected to: the page is requested once with the session cookies
   * and only the code is kept. A failure to read it never hides the error itself.
   */
  protected errorPageCodeEffect = (location: string) =>
    Effect.gen({ self: this }, function* () {
      const page = yield* this.requestEffect(location)
      const text = yield* Effect.tryPromise({
        try: () => page.text(),
        catch: (cause) => new NetRequestError({ operation: 'read maimai NET error page', cause }),
      })
      return parseNetErrorCode(text)
    }).pipe(Effect.timeout('5 seconds'), Effect.option, Effect.map(Option.getOrUndefined))

  fetchEffect = (url: string, init?: RequestInit, errorRedirectCode: NetImportErrorCode = 'UNKNOWN_ERROR') =>
    Effect.gen({ self: this }, function* () {
      const step = netStepOf(url)
      const res = yield* this.requestEffect(url, init)
      const location = res.headers.get('location') ?? ''
      // maimai NET answers 503 during emergency maintenance; the Aime gateway and NET redirect to a maintenance page
      if (
        res.status === 503 ||
        (res.status >= 300 && res.status < 400 && URLS.CHECKLIST.MAINTENANCE_REDIRECT.test(location))
      ) {
        yield* this.releaseEffect(res)
        return yield* Effect.fail(new NetImportError('NET_MAINTENANCE', MAINTENANCE_MESSAGE, { step }))
      }
      if (res.status === 302 && URLS.CHECKLIST.ERROR.includes(location)) {
        yield* this.releaseEffect(res)
        // the code tells a rejected password from a refusal of another kind (DXRATING-BACKEND-1W, the 11-01 outage)
        const netErrorCode =
          errorRedirectCode === 'AIME_CARD_UNAVAILABLE' ? undefined : yield* this.errorPageCodeEffect(location)
        return yield* Effect.fail(
          new NetImportError(
            errorRedirectCode,
            errorRedirectCode === 'AIME_CARD_UNAVAILABLE'
              ? 'SEGA ID authentication succeeded, but maimai NET did not provide a usable Aime card.'
              : errorRedirectCode === 'INVALID_CREDENTIALS'
                ? 'maimai NET rejected the SEGA ID login.'
                : netErrorPageMessage(netErrorCode),
            { step, netErrorCode },
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
      yield* this.checkMaintenanceEffect(text, netStepOf(url))
      return yield* Effect.try({
        try: () => new DOMParser({ errorHandler: () => {} }).parseFromString(text, 'text/html'),
        catch: () => new NetImportError('INTERNAL_ERROR', 'failed to parse record page'),
      })
    })

  /**
   * A page that must be a real answer: anything but a 200 (a redirect to the login page, a server error) fails with
   * `UNKNOWN_ERROR`, which the record page retry (#368) retries. Used by cloud save imports, which are all or
   * nothing (design §7.1): a page that silently parsed as empty would drop records.
   */
  protected fetchStrictPageEffect = (url: string) =>
    Effect.gen({ self: this }, function* () {
      const res = yield* this.fetchEffect(url)
      if (res.status !== 200) {
        yield* Effect.tryPromise({
          try: () => res.body?.cancel() ?? Promise.resolve(),
          catch: (cause) => new NetRequestError({ operation: 'release maimai NET response', cause }),
        })
        return yield* Effect.fail(new NetImportError('UNKNOWN_ERROR', `maimai NET answered ${res.status}`))
      }
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
    (this.strictPages ? this.fetchStrictPageEffect(url) : this.fetchAsDOMEffect(url)).pipe(
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

  protected checkMaintenanceEffect = (text: string, step?: NetStep) =>
    Effect.try({
      try: () => this.checkMaintenance(text, step),
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

  checkMaintenance(text: string, step?: NetStep) {
    if (URLS.CHECKLIST.MAINTENANCE.some((m) => text.includes(m))) {
      throw new NetImportError('NET_MAINTENANCE', MAINTENANCE_MESSAGE, { step })
    }
  }
}

export class MaimaiNETJpClient extends Client {
  loginEffect = ({ id, password }: AuthParams) =>
    Effect.gen({ self: this }, function* () {
      yield* this.progress('auth:in-progress')

      const loginPage = yield* this.fetchAsDOMEffect(URLS.JP.LOGIN_PAGE)
      const loginPageToken = loginPage?.querySelector('input[name="token"]')?.attributes.getNamedItem('value')?.value
      if (!loginPageToken) {
        const upstreamMessage = yield* Effect.sync(() =>
          loginPage ? pageSignals(new XMLSerializer().serializeToString(loginPage)) : undefined,
        )
        return yield* Effect.fail(new NetImportError('TOKEN_ERROR', undefined, { step: 'login_page', upstreamMessage }))
      }

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

  fetchFriendCodeEffect = () => this.fetchFriendCodeAtEffect(URLS.JP.FRIEND_CODE_PAGE)

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
        const page = yield* Effect.tryPromise({
          try: () => loginResponse.text(),
          catch: (cause) => new NetRequestError({ operation: 'read maimai NET login response', cause }),
        })
        return yield* Effect.fail(
          new NetImportError(
            'INTERNAL_ERROR',
            `unexpected login response status: ${loginResponse.status} ${URLS.INTL.LOGIN_ENDPOINT}`,
            { step: 'login_submit', upstreamMessage: pageSignals(page, id) },
          ),
        )
      }
      const redirectURL = loginResponse.headers.get('location')
      yield* Effect.tryPromise({
        try: () => loginResponse.body?.cancel() ?? Promise.resolve(),
        catch: (cause) => new NetRequestError({ operation: 'release maimai NET login response', cause }),
      })
      if (!redirectURL) {
        return yield* Effect.fail(new NetImportError('INVALID_CREDENTIALS', undefined, { step: 'login_submit' }))
      }

      const redirectDestinationResponse = yield* this.fetchEffect(redirectURL, undefined, 'AIME_CARD_UNAVAILABLE')

      const redirectDestinationText = yield* Effect.tryPromise({
        try: () => redirectDestinationResponse.text(),
        catch: (cause) => new NetRequestError({ operation: 'read maimai NET login response', cause }),
      })
      yield* this.checkMaintenanceEffect(redirectDestinationText, 'login_callback')

      if (redirectURL.startsWith('https://lng-tgk-aime-gw.am-all.net/common_auth/login')) {
        const textDom = yield* parseNetResponse(() =>
          new DOMParser({ errorHandler: () => {} }).parseFromString(redirectDestinationText, 'text/html'),
        )
        const errorString = textDom.querySelector('#error')?.textContent?.trim() ?? undefined
        return yield* Effect.fail(
          new NetImportError('INVALID_CREDENTIALS', errorString, {
            step: 'login_submit',
            upstreamMessage: pageSignals(redirectDestinationText, id),
          }),
        )
      }

      yield* this.progress('auth:succeeded')
    })

  fetchFriendCodeEffect = () => this.fetchFriendCodeAtEffect(URLS.INTL.FRIEND_CODE_PAGE)

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
  options?: ClientOptions,
) =>
  Effect.scoped(
    Effect.acquireRelease(
      Effect.sync(() =>
        region === 'jp' ? new MaimaiNETJpClient(onProgress, options) : new MaimaiNETIntlClient(onProgress, options),
      ),
      (client) => client.disposeEffect().pipe(Effect.orDie),
    ).pipe(Effect.flatMap(use)),
  )
export type NetGatewayStatus = 'ok' | 'maintenance' | 'unknown'

/**
 * Whether the region's login page is reachable or in SEGA's maintenance, from one anonymous request with no
 * credentials (the same detection as a real import). Never fails: anything else, including a timeout, is `unknown`.
 */
export const gatewayStatusEffect = (client: MaimaiNETJpClient | MaimaiNETIntlClient, region: 'jp' | 'intl') =>
  client.fetchAsDOMEffect(region === 'jp' ? URLS.JP.LOGIN_PAGE : URLS.INTL.LOGIN_PAGE).pipe(
    Effect.as<NetGatewayStatus>('ok'),
    Effect.timeout('8 seconds'),
    Effect.catch((error) =>
      Effect.succeed<NetGatewayStatus>(
        error instanceof NetImportError && error.code === 'NET_MAINTENANCE' ? 'maintenance' : 'unknown',
      ),
    ),
  )

export const netGatewayStatusEffect = (region: 'jp' | 'intl') =>
  withMaimaiNETClient(region, (client) => gatewayStatusEffect(client, region))