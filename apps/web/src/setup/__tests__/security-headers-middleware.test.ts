import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { securityHeadersMiddleware } from '../../start'

type ServerMiddleware = (options: {
  next: (options?: { context?: Record<string, unknown> }) => Promise<{ response: Response }>
}) => Promise<{ response: Response }>

const runMiddleware = async () => {
  const server = (securityHeadersMiddleware as unknown as { options: { server: ServerMiddleware } }).options.server
  let context: Record<string, unknown> | undefined
  const result = await server({
    next: async (options) => {
      context = options?.context
      return { response: new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } }) }
    },
  })
  return { context, headers: result.response.headers }
}

describe('security headers middleware', () => {
  // As in a production build
  beforeEach(() => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_BACKEND_URL', 'https://miruku.dxrating.net')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('hands the router the same nonce that the enforced policy allows', async () => {
    const { context, headers } = await runMiddleware()
    const nonce = context?.cspNonce

    expect(typeof nonce).toBe('string')
    expect(headers.get('Content-Security-Policy')).toContain(`'nonce-${nonce}'`)
    expect(headers.get('Content-Security-Policy-Report-Only')).toContain(`'nonce-${nonce}'`)
    expect(headers.get('X-Frame-Options')).toBe('DENY')
  })

  it('uses a fresh nonce for every response', async () => {
    const first = await runMiddleware()
    const second = await runMiddleware()

    expect(first.context?.cspNonce).not.toBe(second.context?.cspNonce)
  })
})