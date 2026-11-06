import { readFileSync } from 'node:fs'
import { Effect } from 'effect'
import { Response, type RequestInit } from 'undici'
import { describe, expect, it } from 'vitest'
import {
  MaimaiNETIntlClient,
  MaimaiNETJpClient,
  NetImportError,
  NetRequestError,
  netErrorPageMessage,
  netStepOf,
  parseNetErrorCode,
} from './client'
import { netErrorTags, shouldCaptureSentryError } from './sentry'
import { URLS } from './URLS'

// Recorded public pages (2026-11-05, trimmed; no session, no user data): DXRATING-BACKEND-1W and -2A
const fixture = (name: string) => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8')
const AIME_MAINTENANCE = fixture('aime-gateway-maintenance.html')
const JP_EMERGENCY_MAINTENANCE = fixture('jp-emergency-maintenance.html')
const INTL_ERROR_PAGE = fixture('intl-error-page.html')

const AIME_MAINTENANCE_URL = 'https://lng-tgk-aime-gw.am-all.net/common_auth/maintenance.html'
const INTL_ERROR_URL = 'https://maimaidx-eng.com/maimai-mobile/error/'
const INTL_CALLBACK = 'https://maimaidx-eng.com/maimai-mobile/?ssid=synthetic'

type Route = (url: string, init?: RequestInit) => Response
const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } })
const redirect = (location: string) => new Response(null, { status: 302, headers: { location } })

/** A client whose requests go to a table of recorded responses; every request is logged by step */
function stubbed<C extends MaimaiNETIntlClient | MaimaiNETJpClient>(client: C, route: Route) {
  const requested: string[] = []
  Object.assign(client, {
    requestEffect: (url: string, init?: RequestInit) =>
      Effect.try({
        try: () => {
          requested.push(url === INTL_ERROR_URL ? 'error_page' : netStepOf(url))
          return route(url, init)
        },
        catch: (cause) => new NetRequestError({ operation: 'request maimai NET', cause }),
      }),
  })
  return { client, requested }
}

const failure = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(Effect.flip(effect))

describe('maimai NET request steps', () => {
  it.each([
    [URLS.INTL.LOGIN_PAGE, 'login_page'],
    [URLS.INTL.LOGIN_ENDPOINT, 'login_submit'],
    [INTL_CALLBACK, 'login_callback'],
    [URLS.JP.LOGIN_PAGE, 'login_page'],
    [URLS.JP.LOGIN_ENDPOINT, 'login_submit'],
    [URLS.JP.LOGIN_AIMELIST, 'aime_list'],
    [URLS.JP.LOGIN_AIMELIST_SUBMIT, 'aime_select'],
    [URLS.JP.HOMEPAGE, 'home'],
    [URLS.INTL.RECORD_RECENT_PAGE, 'record_recent'],
    [`${URLS.INTL.RECORD_MUSICS_PAGE}?genre=99&diff=4`, 'record_music_remaster'],
    [`${URLS.JP.RECORD_MUSICS_PAGE}?genre=99&diff=10`, 'record_music_utage'],
  ])('%s is %s', (url, step) => {
    expect(netStepOf(url)).toBe(step)
  })

  it('reads only the code of an error page', () => {
    expect(parseNetErrorCode(INTL_ERROR_PAGE)).toBe('100001')
    expect(parseNetErrorCode('<html>nothing here</html>')).toBeUndefined()
    expect(netErrorPageMessage('100001')).toContain('ERROR CODE 100001')
    expect(netErrorPageMessage('999999')).toBe('maimai NET showed its error page (ERROR CODE 999999).')
  })
})

describe('maimai NET maintenance (DXRATING-BACKEND-1W, -2A)', () => {
  it('reports SEGA ID login gateway maintenance on the international login page', async () => {
    const { client, requested } = stubbed(new MaimaiNETIntlClient(), (url) =>
      url === AIME_MAINTENANCE_URL ? html(AIME_MAINTENANCE) : redirect(AIME_MAINTENANCE_URL),
    )
    const error = await failure(client.loginEffect({ id: 'synthetic', password: 'synthetic' }))
    expect(error).toMatchObject({ code: 'NET_MAINTENANCE', step: 'login_page' })
    // stops before sending the credentials
    expect(requested).toEqual(['login_page'])
    expect(shouldCaptureSentryError(error)).toBe(false)
  })

  it('reports the gateway maintenance page when it is reached through the login callback', async () => {
    const { client } = stubbed(new MaimaiNETIntlClient(), (url) => {
      if (url === URLS.INTL.LOGIN_PAGE) return html('<form></form>')
      if (url === URLS.INTL.LOGIN_ENDPOINT) return redirect(INTL_CALLBACK)
      return html(AIME_MAINTENANCE)
    })
    const error = await failure(client.loginEffect({ id: 'synthetic', password: 'synthetic' }))
    expect(error).toMatchObject({ code: 'NET_MAINTENANCE', step: 'login_callback' })
  })

  it('reports JP emergency maintenance (503) instead of a missing login token', async () => {
    const { client } = stubbed(new MaimaiNETJpClient(), () => html(JP_EMERGENCY_MAINTENANCE, 503))
    const error = await failure(client.loginEffect({ id: 'synthetic', password: 'synthetic' }))
    expect(error).toMatchObject({ code: 'NET_MAINTENANCE', step: 'login_page' })
    expect(shouldCaptureSentryError(error)).toBe(false)
  })

  it('recognizes the emergency maintenance text on a 200 page too', () => {
    expect(() => new MaimaiNETJpClient().checkMaintenance(JP_EMERGENCY_MAINTENANCE)).toThrow(NetImportError)
  })

  it('still reports a login page without a token when NET is up', async () => {
    const { client } = stubbed(new MaimaiNETJpClient(), () => html('<html><body><form></form></body></html>'))
    const error = await failure(client.loginEffect({ id: 'synthetic', password: 'synthetic' }))
    expect(error).toMatchObject({ code: 'TOKEN_ERROR', step: 'login_page' })
    expect(shouldCaptureSentryError(error)).toBe(true)
  })
})

describe('maimai NET error page', () => {
  it('records the failing step and the ERROR CODE NET showed, retrying the page first', async () => {
    const { client, requested } = stubbed(new MaimaiNETIntlClient(), (url) =>
      url === INTL_ERROR_URL ? html(INTL_ERROR_PAGE) : redirect(INTL_ERROR_URL),
    )
    const error = await failure(client.fetchRecentRecordsEffect())
    expect(error).toBeInstanceOf(NetImportError)
    expect(error).toMatchObject({
      code: 'UNKNOWN_ERROR',
      step: 'record_recent',
      netErrorCode: '100001',
      message: expect.stringContaining('ERROR CODE 100001'),
    })
    // three attempts of the page (the #368 retry), each followed once to its error page
    expect(requested).toEqual([
      'record_recent',
      'error_page',
      'record_recent',
      'error_page',
      'record_recent',
      'error_page',
    ])
    expect(netErrorTags(error)).toEqual({
      'net.code': 'UNKNOWN_ERROR',
      'net.step': 'record_recent',
      'net.error_code': '100001',
    })
    expect(shouldCaptureSentryError(error)).toBe(true)
  })

  it('keeps the original error when the error page cannot be read', async () => {
    const { client } = stubbed(new MaimaiNETIntlClient(), (url) => {
      if (url === INTL_ERROR_URL) throw new Error('network down')
      return redirect(INTL_ERROR_URL)
    })
    const error = await failure(client.fetchEffect(URLS.INTL.RECORD_RECENT_PAGE))
    expect(error).toMatchObject({
      code: 'UNKNOWN_ERROR',
      step: 'record_recent',
      message: 'maimai NET redirected the request to its error page.',
    })
    expect(error).toMatchObject({ netErrorCode: undefined })
  })
})