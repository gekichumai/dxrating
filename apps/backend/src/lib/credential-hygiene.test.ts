import { describe, expect, it } from 'vitest'
import {
  FILTERED,
  holdCredentials,
  isCredentialPath,
  isNetCredentialPath,
  scrubAnalyticsEvent,
  scrubbingLogger,
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  scrubUrl,
  scrubValue,
} from './credential-hygiene'

describe('credential hygiene', () => {
  it('knows the credential routes', () => {
    for (const path of [
      '/functions/fetch-net-records/v0',
      '/functions/fetch-net-records/v1/jp',
      '/api/v1/io/import/maimai-net',
      '/api/v1/saves/dsav_x/imports/maimai-net',
    ]) {
      expect(isNetCredentialPath(path), path).toBe(true)
    }
    expect(isCredentialPath('/api/v1/io/import/lxns/start')).toBe(true)
    expect(isNetCredentialPath('/api/v1/io/import/lxns/start')).toBe(false)
    expect(isCredentialPath('/api/v1/saves/dsav_x/client-imports')).toBe(false)
  })

  it('replaces credential keys everywhere, and the SEGA ID keys on the NET routes only', () => {
    const value = {
      id: 'sega',
      nested: { Password: 'p', access_token: 'a', refreshToken: 'r', Authorization: 'Bearer x', cookie: 'c' },
      list: [{ segaId: 's' }],
    }
    expect(scrubValue(value)).toEqual({
      id: 'sega',
      nested: {
        Password: FILTERED,
        access_token: FILTERED,
        refreshToken: FILTERED,
        Authorization: FILTERED,
        cookie: FILTERED,
      },
      list: [{ segaId: FILTERED }],
    })
    expect(scrubValue(value, { netRoute: true }).id).toBe(FILTERED)
  })

  it('replaces the values of running requests in any string, errors included', () => {
    const release = holdCredentials(['held-sega-id', 'held-password', 'ab'])
    try {
      const error = scrubValue(new Error('login failed for held-sega-id with held-password'))
      expect(error.message).toBe(`login failed for ${FILTERED} with ${FILTERED}`)
      expect(error.stack).not.toContain('held-password')
      // too short to be matched by value
      expect(scrubValue('ab cd')).toBe('ab cd')
    } finally {
      release()
    }
  })

  it('drops the request body and cookies of a Sentry event on a credential route', () => {
    const event = scrubSentryEvent({
      request: {
        url: 'https://miruku.dxrating.net/functions/fetch-net-records/v1/jp',
        data: '{"id":"x","password":"y"}',
        cookies: { dxrating_session: 'z' },
        headers: { cookie: 'dxrating_session=z', 'user-agent': 'ua' },
      },
      contexts: { parameters: { id: 'x', region: 'jp' } },
      breadcrumbs: [
        { message: 'm', data: { password: 'y', url: '/api/v1/io/import/lxns/oauth_callback?code=c&state=s' } },
      ],
    })
    expect(event.request).toEqual({
      url: 'https://miruku.dxrating.net/functions/fetch-net-records/v1/jp',
      headers: { cookie: FILTERED, 'user-agent': 'ua' },
    })
    expect(event.contexts).toEqual({ parameters: { id: FILTERED, region: 'jp' } })
    expect(event.breadcrumbs[0]!.data).toEqual({
      password: FILTERED,
      url: `/api/v1/io/import/lxns/oauth_callback?code=${FILTERED}&state=${FILTERED}`,
    })
    // elsewhere the body stays, without its credential keys
    const other = scrubSentryEvent({ request: { url: 'https://x/api/v1/tags', data: { name: 't', password: 'p' } } })
    expect(other.request.data).toEqual({ name: 't', password: FILTERED })
  })

  it('scrubs breadcrumbs, URLs, analytics events and logger calls', () => {
    expect(scrubSentryBreadcrumb({ data: { Authorization: 'Bearer t' } }).data).toEqual({ Authorization: FILTERED })
    expect(scrubUrl('/cb?code=abc&x=1')).toBe(`/cb?code=${FILTERED}&x=1`)
    expect(scrubAnalyticsEvent({ properties: { password: 'p', tool: 't' } })).toEqual({
      properties: { password: FILTERED, tool: 't' },
    })
    const calls: unknown[][] = []
    const logger = scrubbingLogger(
      { set: (...args: unknown[]) => calls.push(args), getContext: () => ({ ok: true }) },
      { netRoute: true },
    )
    logger.set({ body: { id: 'sega', password: 'p', region: 'jp' } })
    expect(calls).toEqual([[{ body: { id: FILTERED, password: FILTERED, region: 'jp' } }]])
    expect(logger.getContext()).toEqual({ ok: true })
  })
})