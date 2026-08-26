import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CHART_REPORT_TURNSTILE_ACTION,
  CHART_REPORT_TURNSTILE_FUTURE_SKEW_MS,
  CHART_REPORT_TURNSTILE_SITEVERIFY_URL,
  CHART_REPORT_TURNSTILE_TOKEN_MAX_AGE_MS,
  CHART_REPORT_TURNSTILE_TOKEN_MAX_LENGTH,
  createCloudflareChartReportTurnstileVerifier,
} from './chart-report-turnstile.js'

const NOW = Date.parse('2026-08-24T12:00:00.000Z')
const SECRET = 'turnstile-secret-sentinel'
const TOKEN = 'turnstile-token-sentinel'
const IDEMPOTENCY_KEY = '0198e8d1-e05f-7f7f-89ba-fbc33e4b0bd1'

type FetchImplementation = typeof fetch
type VerifierOptions = NonNullable<Parameters<typeof createCloudflareChartReportTurnstileVerifier>[1]>

const successPayload = (overrides: Record<string, unknown> = {}) => ({
  success: true,
  challenge_ts: new Date(NOW - 1_000).toISOString(),
  hostname: 'dxrating.net',
  action: CHART_REPORT_TURNSTILE_ACTION,
  'error-codes': [],
  ...overrides,
})

const createVerifier = (fetchImplementation: FetchImplementation, options: VerifierOptions = {}) =>
  createCloudflareChartReportTurnstileVerifier(
    {
      secretKey: SECRET,
      allowedHostnames: ['dxrating.net', 'preview.dxrating.net'],
    },
    {
      fetchImplementation,
      generateIdempotencyKey: () => IDEMPOTENCY_KEY,
      nowMilliseconds: () => NOW,
      ...options,
    },
  )

afterEach(() => {
  vi.useRealTimers()
})

describe('Cloudflare Turnstile chart-report verifier', () => {
  it('posts one server-side Siteverify request without a remote IP and returns no provider detail', async () => {
    const fetchImplementation = vi.fn<FetchImplementation>(async () =>
      Response.json(
        successPayload({
          cdata: 'provider-private-sentinel',
          metadata: { ephemeral_id: 'provider-device-sentinel' },
        }),
      ),
    )
    const verifier = createVerifier(fetchImplementation)

    const result = await verifier.verify(TOKEN)

    expect(result).toEqual({ ok: true })
    expect(JSON.stringify(result)).not.toMatch(/token|secret|provider|ephemeral/i)
    expect(fetchImplementation).toHaveBeenCalledOnce()
    const [url, init] = fetchImplementation.mock.calls[0]!
    expect(url).toBe(CHART_REPORT_TURNSTILE_SITEVERIFY_URL)
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      signal: expect.any(AbortSignal),
    })
    const body = new URLSearchParams(init?.body as string)
    expect(Object.fromEntries(body)).toEqual({
      secret: SECRET,
      response: TOKEN,
      idempotency_key: IDEMPOTENCY_KEY,
    })
    expect(body.has('remoteip')).toBe(false)
  })

  it('rejects missing, malformed, and oversized tokens before contacting Cloudflare', async () => {
    const fetchImplementation = vi.fn<FetchImplementation>()
    const verifier = createVerifier(fetchImplementation)

    for (const token of [
      undefined,
      null,
      '',
      ' token-with-padding ',
      `token\0suffix`,
      'x'.repeat(CHART_REPORT_TURNSTILE_TOKEN_MAX_LENGTH + 1),
    ]) {
      await expect(verifier.verify(token)).resolves.toEqual({ ok: false, category: 'REJECTED' })
    }
    expect(fetchImplementation).not.toHaveBeenCalled()
  })

  it('accepts the documented maximum token length', async () => {
    const fetchImplementation = vi.fn<FetchImplementation>(async () => Response.json(successPayload()))
    const verifier = createVerifier(fetchImplementation)

    await expect(verifier.verify('x'.repeat(CHART_REPORT_TURNSTILE_TOKEN_MAX_LENGTH))).resolves.toEqual({ ok: true })
    expect(fetchImplementation).toHaveBeenCalledOnce()
  })

  it.each([
    ['provider rejection', { success: false, 'error-codes': ['invalid-input-response'] }],
    ['wrong action', successPayload({ action: 'login' })],
    ['missing action lookalike', successPayload({ action: 'chart-report-extra' })],
    ['wrong hostname', successPayload({ hostname: 'dxrating.net.evil.example' })],
    ['hostname with a port', successPayload({ hostname: 'dxrating.net:443' })],
    [
      'stale timestamp',
      successPayload({ challenge_ts: new Date(NOW - CHART_REPORT_TURNSTILE_TOKEN_MAX_AGE_MS - 1).toISOString() }),
    ],
    [
      'timestamp too far in the future',
      successPayload({ challenge_ts: new Date(NOW + CHART_REPORT_TURNSTILE_FUTURE_SKEW_MS + 1).toISOString() }),
    ],
  ])('rejects a validly shaped %s with one generic result', async (_description, payload) => {
    const fetchImplementation = vi.fn<FetchImplementation>(async () => Response.json(payload))
    const verifier = createVerifier(fetchImplementation)

    const result = await verifier.verify(TOKEN)

    expect(result).toEqual({ ok: false, category: 'REJECTED' })
    expect(JSON.stringify(result)).not.toContain(JSON.stringify(payload))
    expect(fetchImplementation).toHaveBeenCalledOnce()
  })

  it('accepts exact age and small future-skew boundaries for an allowed preview hostname', async () => {
    const payloads = [
      successPayload({
        challenge_ts: new Date(NOW - CHART_REPORT_TURNSTILE_TOKEN_MAX_AGE_MS).toISOString(),
        hostname: 'preview.dxrating.net',
      }),
      successPayload({ challenge_ts: new Date(NOW + CHART_REPORT_TURNSTILE_FUTURE_SKEW_MS).toISOString() }),
    ]
    const fetchImplementation = vi.fn<FetchImplementation>(async () => Response.json(payloads.shift()))
    const verifier = createVerifier(fetchImplementation)

    await expect(verifier.verify('boundary-token-one')).resolves.toEqual({ ok: true })
    await expect(verifier.verify('boundary-token-two')).resolves.toEqual({ ok: true })
  })

  it.each([
    ['non-object JSON', []],
    ['wrong success type', { success: 'true' }],
    ['successful response missing hostname', { ...successPayload(), hostname: undefined }],
    ['invalid challenge timestamp', successPayload({ challenge_ts: 'not-a-timestamp' })],
    ['unbounded error-code data', { success: false, 'error-codes': Array.from({ length: 33 }, () => 'failure') }],
  ])('treats %s as a generic unavailable provider response', async (_description, payload) => {
    const fetchImplementation = vi.fn<FetchImplementation>(async () => Response.json(payload))
    const verifier = createVerifier(fetchImplementation)

    await expect(verifier.verify(TOKEN)).resolves.toEqual({ ok: false, category: 'UNAVAILABLE' })
    expect(fetchImplementation).toHaveBeenCalledOnce()
  })

  it('bounds provider response parsing and does not retry a malformed 2xx response', async () => {
    const fetchImplementation = vi.fn<FetchImplementation>(
      async () =>
        new Response(`{"success":true,"padding":"${'x'.repeat(17 * 1_024)}"}`, {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    )
    const verifier = createVerifier(fetchImplementation, { maximumAttempts: 3 })

    await expect(verifier.verify(TOKEN)).resolves.toEqual({ ok: false, category: 'UNAVAILABLE' })
    expect(fetchImplementation).toHaveBeenCalledOnce()
  })

  it('reuses one provider idempotency UUID across bounded network and 5xx retries', async () => {
    const generateIdempotencyKey = vi.fn(() => IDEMPOTENCY_KEY)
    const fetchImplementation = vi
      .fn<FetchImplementation>()
      .mockRejectedValueOnce(new Error(`${SECRET}:${TOKEN}:network-sentinel`))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(Response.json(successPayload()))
    const verifier = createVerifier(fetchImplementation, {
      generateIdempotencyKey,
      maximumAttempts: 3,
    })

    const result = await verifier.verify(TOKEN)

    expect(result).toEqual({ ok: true })
    expect(generateIdempotencyKey).toHaveBeenCalledOnce()
    expect(fetchImplementation).toHaveBeenCalledTimes(3)
    const bodies = fetchImplementation.mock.calls.map(([, init]) => new URLSearchParams(init?.body as string))
    expect(bodies.map((body) => body.get('idempotency_key'))).toEqual([
      IDEMPOTENCY_KEY,
      IDEMPOTENCY_KEY,
      IDEMPOTENCY_KEY,
    ])
  })

  it('does not retry a 4xx response or expose provider and credential details', async () => {
    const fetchImplementation = vi.fn<FetchImplementation>(
      async () => new Response(`${SECRET}:${TOKEN}:provider-sentinel`, { status: 400 }),
    )
    const verifier = createVerifier(fetchImplementation, { maximumAttempts: 3 })

    const result = await verifier.verify(TOKEN)

    expect(result).toEqual({ ok: false, category: 'UNAVAILABLE' })
    expect(JSON.stringify(result)).not.toMatch(/secret|token|provider|sentinel/i)
    expect(fetchImplementation).toHaveBeenCalledOnce()
  })

  it('aborts every stalled attempt and fails closed after the bounded retry count', async () => {
    vi.useFakeTimers()
    const signals: AbortSignal[] = []
    const fetchImplementation = vi.fn<FetchImplementation>(
      async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal
          if (!signal) return reject(new Error('missing abort signal'))
          signals.push(signal)
          signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
        }),
    )
    const verifier = createVerifier(fetchImplementation, { timeoutMilliseconds: 25, maximumAttempts: 2 })

    const verification = verifier.verify(TOKEN)
    await vi.runAllTimersAsync()

    await expect(verification).resolves.toEqual({ ok: false, category: 'UNAVAILABLE' })
    expect(fetchImplementation).toHaveBeenCalledTimes(2)
    expect(signals).toHaveLength(2)
    expect(signals.every((signal) => signal.aborted)).toBe(true)
  })

  it('fails closed without a configured secret or a nonempty exact hostname allowlist', async () => {
    const fetchImplementation = vi.fn<FetchImplementation>()
    for (const configuration of [
      { secretKey: undefined, allowedHostnames: ['dxrating.net'] },
      { secretKey: SECRET, allowedHostnames: [] },
      { secretKey: SECRET, allowedHostnames: ['DXRATING.NET'] },
      { secretKey: SECRET, allowedHostnames: ['dxrating.net', 'dxrating.net'] },
    ]) {
      const verifier = createCloudflareChartReportTurnstileVerifier(configuration, { fetchImplementation })
      await expect(verifier.verify(TOKEN)).resolves.toEqual({ ok: false, category: 'UNAVAILABLE' })
    }
    expect(fetchImplementation).not.toHaveBeenCalled()
  })

  it('delegates single-use enforcement to Siteverify on every distinct verification call', async () => {
    const fetchImplementation = vi
      .fn<FetchImplementation>()
      .mockResolvedValueOnce(Response.json(successPayload()))
      .mockResolvedValueOnce(Response.json({ success: false, 'error-codes': ['timeout-or-duplicate'] }))
    const keys = ['0198e8d1-e05f-7f7f-89ba-fbc33e4b0bd1', '0198e8d1-e05f-7f7f-89ba-fbc33e4b0bd2']
    const verifier = createVerifier(fetchImplementation, { generateIdempotencyKey: () => keys.shift()! })

    await expect(verifier.verify(TOKEN)).resolves.toEqual({ ok: true })
    await expect(verifier.verify(TOKEN)).resolves.toEqual({ ok: false, category: 'REJECTED' })
    expect(fetchImplementation).toHaveBeenCalledTimes(2)
  })
})