// Runs the backend's real Sentry SDK (@sentry/node with httpIntegration and sendDefaultPii, as in production) over a
// real HTTP server and checks every envelope it would send for the LXNS completion body.
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import * as Sentry from '@sentry/node'
import { afterEach, describe, expect, it } from 'vitest'
import { sentryOptions } from './sentry'

const body = JSON.stringify({ code: 'synthetic-code', state: 'synthetic-state' })

async function envelopesFor(scrub: boolean) {
  const sent: string[] = []
  const options = sentryOptions({
    dsn: 'https://public@o0.ingest.sentry.io/0',
    environment: 'test',
    release: undefined,
  })
  Sentry.init({
    ...options,
    tracesSampler: () => 1,
    // Without the fix: the same SDK setup with hooks that keep everything
    ...(scrub ? {} : { beforeSend: (event) => event, beforeSendTransaction: (event) => event }),
    transport: () => ({
      send: async (envelope) => {
        sent.push(JSON.stringify(envelope))
        return {}
      },
      flush: async () => true,
    }),
  })

  const server: Server = createServer((request, response) => {
    let received = ''
    request.on('data', (chunk) => (received += chunk))
    request.on('end', () => {
      Sentry.captureException(new Error(`synthetic failure (${received.length} bytes)`))
      response.writeHead(500, { 'Content-Type': 'application/json' }).end('{}')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/io/import/lxns/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })
  await response.text()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await Sentry.flush(2000)
  await Sentry.close(2000)
  return sent.join('\n')
}

describe('backend Sentry and the LXNS completion body', () => {
  afterEach(async () => {
    await Sentry.close(0)
  })

  it('the SDK does send the completion body by default (the probe is live)', async () => {
    const sent = await envelopesFor(false)
    expect(sent).toContain('"type":"event"')
    expect(sent).toContain('"type":"transaction"')
    expect(sent).toContain('synthetic-code')
  })

  it('sends neither code nor state with sentryOptions', async () => {
    const sent = await envelopesFor(true)
    expect(sent).toContain('"type":"event"')
    expect(sent).toContain('"type":"transaction"')
    expect(sent).toContain('/api/v1/io/import/lxns/complete')
    expect(sent).not.toContain('synthetic-code')
    expect(sent).not.toContain('synthetic-state')
  })
})