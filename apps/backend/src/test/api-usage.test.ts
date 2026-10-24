import { describe, expect, it } from 'vitest'
import { Effect, ManagedRuntime } from 'effect'
import { appContract } from '../contract'
import {
  ApiUsage,
  type ApiUsageBucket,
  classifyCaller,
  classifyUserAgent,
  createApiUsageRollup,
  createRouteResolver,
  isTrackedApiPath,
  makeApiUsageLayer,
  readClientId,
} from '../services/api-usage'

const request = {
  route: '/api/v1/tags',
  method: 'GET',
  status: 200,
  caller: 'dxrating_web',
  userAgentClass: 'browser',
  clientId: 'none',
} as const

describe('API usage classification', () => {
  it('classifies user agents into bounded classes', () => {
    expect(classifyUserAgent('dxrating-ios/2026091902 CFNetwork/3826.500.131 Darwin/25.0.0')).toBe('dxrating_ios')
    expect(
      classifyUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('browser')
    expect(classifyUserAgent('Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0)')).toBe(
      'ai_agent',
    )
    expect(classifyUserAgent('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')).toBe('bot')
    expect(classifyUserAgent('curl/8.7.1')).toBe('cli')
    expect(classifyUserAgent('python-requests/2.32.3')).toBe('script')
    expect(classifyUserAgent('node')).toBe('script')
    expect(classifyUserAgent('SomethingElse/1.0')).toBe('other')
    expect(classifyUserAgent(undefined)).toBe('none')
    expect(classifyUserAgent('  ')).toBe('none')
  })

  it('reduces Origin and Referer to a caller hostname', () => {
    expect(classifyCaller('https://dxrating.net', undefined)).toBe('dxrating_web')
    expect(classifyCaller(undefined, 'https://dxrating.net/search?q=private')).toBe('dxrating_web')
    expect(classifyCaller('https://pr-12.dxrating.pages.dev', undefined)).toBe('dxrating_preview')
    expect(classifyCaller('https://dxrating-preview.galvin.workers.dev', undefined)).toBe('dxrating_preview')
    expect(classifyCaller('http://localhost:5173', undefined)).toBe('localhost')
    expect(classifyCaller('https://Mai-Tools.example.com', 'https://dxrating.net/')).toBe('mai-tools.example.com')
    expect(classifyCaller('null', 'https://third.example/page?token=secret')).toBe('third.example')
    expect(classifyCaller(undefined, 'not a url')).toBe('none')
    expect(classifyCaller(undefined, undefined)).toBe('none')
  })

  it('accepts only short, well-formed client identifiers', () => {
    expect(readClientId('MaiUp/1.2.0')).toBe('maiup/1.2.0')
    expect(readClientId(undefined)).toBe('none')
    expect(readClientId('has spaces')).toBe('invalid')
    expect(readClientId('x'.repeat(65))).toBe('invalid')
  })

  it('resolves oRPC paths to contract route templates', () => {
    const resolve = createRouteResolver(appContract)

    expect(resolve('GET', '/api/v1/tags', '/api/v1/*')).toBe('/api/v1/tags')
    expect(resolve('POST', '/api/v1/tags/attach', '/api/v1/*')).toBe('/api/v1/tags/attach')
    expect(resolve('GET', '/api/v1/arcades/venues/dven_23456789ab', '/api/v1/*')).toBe('/api/v1/arcades/venues/{id}')
    expect(resolve('HEAD', '/api/v1/arcades/venues', '/api/v1/arcades/venues')).toBe('/api/v1/arcades/venues')
    expect(resolve('GET', '/api/v1/songs/some%20song/dx/master/og-image', '/api/v1/*')).toBe(
      '/api/v1/songs/{songId}/{type}/{difficulty}/og-image',
    )
    expect(resolve('GET', '/api/v1/dxdata', '/api/v1/dxdata')).toBe('/api/v1/dxdata')
    expect(resolve('POST', '/functions/fetch-net-records/v1/intl', '/functions/fetch-net-records/v1/:region')).toBe(
      '/functions/fetch-net-records/v1/:region',
    )
    expect(resolve('GET', '/api/v1/does-not-exist', '/api/v1/*')).toBe('unmatched')
    expect(resolve('GET', '/wp-login.php', '*')).toBe('unmatched')
  })

  it('does not account health checks or the Sentry tunnel', () => {
    expect(isTrackedApiPath('/health')).toBe(false)
    expect(isTrackedApiPath('/api/v1/monitoring/tunnel')).toBe(false)
    expect(isTrackedApiPath('/api/v1/tags')).toBe(true)
  })
})

describe('API usage rollup', () => {
  it('aggregates requests per bucket and resets on drain', () => {
    const rollup = createApiUsageRollup()

    rollup.record(request, 10)
    rollup.record(request, 30)
    rollup.record({ ...request, status: 503 }, 5)

    const buckets = rollup.drain()
    expect(buckets).toHaveLength(2)
    expect(buckets.find((b) => b.status === 200)).toMatchObject({
      count: 2,
      errorCount: 0,
      durationMsSum: 40,
      durationMsMax: 30,
    })
    expect(buckets.find((b) => b.status === 503)).toMatchObject({ count: 1, errorCount: 1 })
    expect(rollup.drain()).toEqual([])
  })

  it('folds every combination beyond the cap into one overflow bucket', () => {
    const rollup = createApiUsageRollup(2)

    rollup.record({ ...request, caller: 'a.example' }, 1)
    rollup.record({ ...request, caller: 'b.example' }, 1)
    for (const route of ['/api/v1/tags', '/api/v1/aliases', '/api/v1/comments']) {
      for (const userAgentClass of ['browser', 'cli', 'script'] as const) {
        rollup.record({ ...request, route, userAgentClass, caller: 'c.example' }, 2)
      }
    }
    rollup.record({ ...request, method: 'POST', status: 503, clientId: 'spam' }, 10)
    rollup.record({ ...request, caller: 'a.example' }, 1)

    const buckets = rollup.drain()
    expect(buckets).toHaveLength(3)
    expect(buckets.map((b) => [b.caller, b.count])).toEqual([
      ['a.example', 2],
      ['b.example', 1],
      ['overflow', 10],
    ])
    expect(buckets[2]).toMatchObject({
      route: 'overflow',
      method: 'overflow',
      status: 'overflow',
      userAgentClass: 'overflow',
      clientId: 'overflow',
      errorCount: 1,
      durationMsSum: 28,
      durationMsMax: 10,
    })
  })

  it('flushes pending buckets when the runtime is disposed', async () => {
    const emitted: ApiUsageBucket[][] = []
    const runtime = ManagedRuntime.make(makeApiUsageLayer((buckets) => emitted.push([...buckets])))

    await runtime.runPromise(
      Effect.gen(function* () {
        const usage = yield* ApiUsage
        yield* usage.record(request, 12)
        yield* usage.record(request, 8)
      }),
    )
    expect(emitted.flat()).toEqual([])

    await runtime.dispose()
    expect(emitted.flat()).toEqual([expect.objectContaining({ route: '/api/v1/tags', count: 2, durationMsSum: 20 })])
  })
})