import { readFileSync } from 'node:fs'
import { Effect } from 'effect'
import { Response, type RequestInit } from 'undici'
import { describe, expect, it } from 'vitest'
import {
  MaimaiNETIntlClient,
  MaimaiNETJpClient,
  NetImportError,
  NetRequestError,
  gatewayStatusEffect,
  netErrorPageMessage,
  netStepOf,
  pageSignals,
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
describe('what SEGA said when it refused a login (the 2026-11-01 outage)', () => {
  it('keeps the error text, flags a captcha, and removes the ID, e-mails and long numbers', () => {
    const page =
      '<html><head><title>Login</title><script src="https://www.google.com/recaptcha/api.js"></script></head>' +
      '<body><div id="error">The SEGA ID player-123 or password is wrong (a@b.co, 1234567).</div></body></html>'
    expect(pageSignals(page, 'player-123')).toBe('The SEGA ID [id] or password is wrong ([email], [number]). | captcha')
    expect(pageSignals('<html><head><title>maimai DX NET</title></head></html>')).toBe('maimai DX NET')
    expect(pageSignals('<html><body></body></html>')).toBeUndefined()
  })

  it('reads the error page code when JP rejects a login', async () => {
    const jpErrorPage = 'https://maimaidx.jp/maimai-mobile/error/'
    const { client } = stubbed(new MaimaiNETJpClient(), (url) => {
      if (url === URLS.JP.LOGIN_PAGE) return html('<form><input name="token" value="t"></form>')
      if (url === URLS.JP.LOGIN_ENDPOINT) return redirect(jpErrorPage)
      return html('<div>ERROR CODE：200004</div>')
    })
    const error = await failure(client.loginEffect({ id: 'synthetic', password: 'synthetic' }))
    expect(error).toMatchObject({ code: 'INVALID_CREDENTIALS', step: 'login_submit', netErrorCode: '200004' })
    expect(shouldCaptureSentryError(error)).toBe(false)
  })

  it('describes the page when the international login form answers 200 instead of redirecting', async () => {
    const { client } = stubbed(new MaimaiNETIntlClient(), (url) =>
      url === URLS.INTL.LOGIN_PAGE
        ? html('<form></form>')
        : html('<html><head><title>Login</title></head><body><div class="cf-turnstile"></div></body></html>'),
    )
    const error = await failure(client.loginEffect({ id: 'synthetic', password: 'synthetic' }))
    expect(error).toMatchObject({ code: 'INTERNAL_ERROR', step: 'login_submit', upstreamMessage: 'Login | captcha' })
  })

  it('keeps the typed failure when the international login answers with an empty body', async () => {
    const { client } = stubbed(new MaimaiNETIntlClient(), (url) =>
      url === URLS.INTL.LOGIN_PAGE ? html('<form></form>') : new Response('', { status: 502 }),
    )
    expect(pageSignals('')).toBeUndefined()
    const error = await failure(client.loginEffect({ id: 'synthetic', password: 'synthetic' }))
    expect(error).toMatchObject({ code: 'INTERNAL_ERROR', step: 'login_submit', upstreamMessage: undefined })
  })

  it('records the gateway error text of an international rejection', async () => {
    const { client } = stubbed(new MaimaiNETIntlClient(), (url) => {
      if (url === URLS.INTL.LOGIN_PAGE) return html('<form></form>')
      if (url === URLS.INTL.LOGIN_ENDPOINT) return redirect(`${URLS.INTL.LOGIN_PAGE}&e=1`)
      return html('<div id="error">synthetic is locked. Try later.</div>')
    })
    const error = await failure(client.loginEffect({ id: 'synthetic', password: 'synthetic' }))
    expect(error).toMatchObject({
      code: 'INVALID_CREDENTIALS',
      step: 'login_submit',
      upstreamMessage: '[id] is locked. Try later.',
    })
  })
})
describe('the maimai NET status the import UI warns with', () => {
  const status = (client: MaimaiNETIntlClient | MaimaiNETJpClient, region: 'intl' | 'jp') =>
    Effect.runPromise(gatewayStatusEffect(client, region))

  it('reads SEGA maintenance from the gateway redirect, the JP 503 and the maintenance page text', async () => {
    expect(await status(stubbed(new MaimaiNETIntlClient(), () => redirect(AIME_MAINTENANCE_URL)).client, 'intl')).toBe(
      'maintenance',
    )
    expect(await status(stubbed(new MaimaiNETJpClient(), () => html(JP_EMERGENCY_MAINTENANCE, 503)).client, 'jp')).toBe(
      'maintenance',
    )
    expect(await status(stubbed(new MaimaiNETIntlClient(), () => html(AIME_MAINTENANCE)).client, 'intl')).toBe(
      'maintenance',
    )
  })

  it('is ok for a login page and unknown when NET cannot be reached', async () => {
    expect(
      await status(
        stubbed(new MaimaiNETJpClient(), () => html('<form><input name="token" value="t"></form>')).client,
        'jp',
      ),
    ).toBe('ok')
    const unreachable = stubbed(new MaimaiNETIntlClient(), () => {
      throw new Error('connect ETIMEDOUT')
    })
    expect(await status(unreachable.client, 'intl')).toBe('unknown')
  })
})