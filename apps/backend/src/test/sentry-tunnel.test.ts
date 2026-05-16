import { afterEach, describe, expect, it, vi } from 'vitest'
import { app } from '../app.js'

function envelopeFor(dsn: string) {
  return `${JSON.stringify({ dsn })}\n${JSON.stringify({ type: 'event' })}\n{}`
}

async function postTunnelEnvelope(dsn: string) {
  const envelope = envelopeFor(dsn)
  const response = await app.request('/api/v1/monitoring/tunnel', {
    method: 'POST',
    body: envelope,
  })

  return { envelope, response }
}

describe('Sentry tunnel', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([
    [
      'current US project',
      'https://9346c04036724f129e00a750c8ab9415@o4506648698683392.ingest.us.sentry.io/4511398317064192',
      'https://o4506648698683392.ingest.us.sentry.io/api/4511398317064192/envelope/',
    ],
    [
      'legacy web project',
      'https://1e929f3c3b929a213436e3c4dff57140@o4506648698683392.ingest.sentry.io/4506648709627904',
      'https://o4506648698683392.ingest.sentry.io/api/4506648709627904/envelope/',
    ],
  ])('accepts the %s DSN', async (_name, dsn, expectedEnvelopeUrl) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const { envelope, response } = await postTunnelEnvelope(dsn)

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledWith(expectedEnvelopeUrl, {
      method: 'POST',
      body: envelope,
    })
  })

  it('rejects Sentry DSNs outside the allowlist', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const { response } = await postTunnelEnvelope(
      'https://9346c04036724f129e00a750c8ab9415@o4506648698683392.ingest.us.sentry.io/9999999999999999',
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid Sentry DSN' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})