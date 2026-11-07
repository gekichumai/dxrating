// @vitest-environment node
// Runs the worker's real Sentry SDK (withSentry, as src/server.ts does) over a synthetic OAuth callback request and
// checks every envelope it would send.
import * as Sentry from '@sentry/cloudflare'
import { describe, expect, it } from 'vitest'
import { sentryScrubOptions } from './sentryScrub'

const callbackUrl =
  'https://dxrating.net/io/import/lxns/oauth_callback?code=synthetic-code&state=synthetic-state&locale=ja'

async function envelopesFor(options: Partial<Sentry.CloudflareOptions>) {
  const sent: string[] = []
  const waits: Promise<unknown>[] = []
  const transport = () => ({
    send: async (envelope: unknown) => {
      sent.push(JSON.stringify(envelope))
      return {}
    },
    flush: async () => true,
  })
  const handler = Sentry.withSentry(
    () => ({ dsn: 'https://public@o0.ingest.sentry.io/0', tracesSampleRate: 1, transport, ...options }),
    {
      async fetch() {
        Sentry.captureMessage('synthetic callback event')
        return new Response('ok')
      },
    } as Parameters<typeof Sentry.withSentry>[1],
  ) as unknown as { fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> }
  const response = await handler.fetch(
    new Request(callbackUrl),
    {},
    {
      waitUntil: (promise: Promise<unknown>) => {
        waits.push(promise)
      },
      passThroughOnException: () => undefined,
    },
  )
  // The SDK ends the root span once the body is consumed; only then is the transaction sent
  await response.text()
  await Promise.all(waits)
  await Sentry.flush(2000)
  return sent.join('\n')
}

describe('worker Sentry with sentryScrubOptions', () => {
  it('the SDK does send the callback query by default (the probe is live)', async () => {
    const sent = await envelopesFor({})
    expect(sent).toContain('"type":"transaction"')
    expect(sent).toContain('synthetic-code')
  })

  it('sends no OAuth code or state once the options are applied', async () => {
    const sent = await envelopesFor(sentryScrubOptions)
    expect(sent).toContain('"type":"transaction"')
    expect(sent).toContain('oauth_callback')
    expect(sent).toContain('locale=ja')
    expect(sent).not.toContain('synthetic-code')
    expect(sent).not.toContain('synthetic-state')
  })
})