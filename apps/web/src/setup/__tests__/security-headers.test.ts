import { describe, expect, it } from 'vitest'
import {
  SECURITY_REPORT_ENDPOINT_GROUP,
  SENTRY_SECURITY_REPORT_ENDPOINT,
  applySecurityHeaders,
  buildContentSecurityPolicy,
  buildSecurityHeaders,
  createCspNonce,
} from '../security-headers'

const getDirectiveSources = (policy: string, directive: string) => {
  const entry = policy.split('; ').find((item) => item.startsWith(`${directive} `))
  return entry?.split(' ').slice(1) ?? []
}

describe('security headers', () => {
  it('enforces the Content-Security-Policy with Sentry reporting', () => {
    expect(SENTRY_SECURITY_REPORT_ENDPOINT).toBe(
      'https://o4506648698683392.ingest.us.sentry.io/api/4511398317064192/security/?sentry_key=9346c04036724f129e00a750c8ab9415',
    )

    const headers = buildSecurityHeaders()
    const policy = headers['Content-Security-Policy']
    const scriptSources = getDirectiveSources(policy, 'script-src')
    const styleSources = getDirectiveSources(policy, 'style-src')
    const fontSources = getDirectiveSources(policy, 'font-src')
    const imageSources = getDirectiveSources(policy, 'img-src')
    const connectSources = getDirectiveSources(policy, 'connect-src')

    expect(headers).not.toHaveProperty('Content-Security-Policy-Report-Only')
    expect(headers['X-Frame-Options']).toBe('DENY')
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    expect(headers['Permissions-Policy']).toBe('geolocation=(), camera=(), microphone=()')
    expect(policy).toContain("default-src 'self'")
    expect(policy).toContain("object-src 'none'")
    expect(policy).not.toContain('*.')
    expect(scriptSources).toContain('https://razu.dxrating.net')
    expect(scriptSources).toContain('https://challenges.cloudflare.com')
    expect(scriptSources).toContain("'wasm-unsafe-eval'")
    expect(styleSources).toContain('https://fonts.googleapis.com')
    expect(fontSources).toContain('https://fonts.gstatic.com')
    expect(imageSources).toContain('https://gravatar.com')
    expect(imageSources).toContain('https://avatars.githubusercontent.com')
    expect(imageSources).toContain('https://lh3.googleusercontent.com')
    expect(connectSources).toContain('https://shama.dxrating.net')
    expect(connectSources).toContain('https://www.diving-fish.com')
    expect(connectSources).toContain('https://fonts.googleapis.com')
    expect(connectSources).toContain('https://fonts.gstatic.com')
    expect(policy).toContain(`report-uri ${SENTRY_SECURITY_REPORT_ENDPOINT}`)
    expect(policy).toContain(`report-to ${SECURITY_REPORT_ENDPOINT_GROUP}`)
    expect(headers['Reporting-Endpoints']).toBe(
      `${SECURITY_REPORT_ENDPOINT_GROUP}="${SENTRY_SECURITY_REPORT_ENDPOINT}"`,
    )
    expect(JSON.parse(headers['Report-To'])).toEqual({
      group: SECURITY_REPORT_ENDPOINT_GROUP,
      max_age: 10886400,
      endpoints: [{ url: SENTRY_SECURITY_REPORT_ENDPOINT }],
      include_subdomains: true,
    })
  })

  it('forbids framing, consistently with X-Frame-Options: DENY', () => {
    const headers = buildSecurityHeaders()

    expect(headers['X-Frame-Options']).toBe('DENY')
    expect(getDirectiveSources(headers['Content-Security-Policy'], 'frame-ancestors')).toEqual(["'none'"])
  })

  it('does not allow eval', () => {
    const policy = buildContentSecurityPolicy({ nonce: createCspNonce() })

    expect(policy).not.toContain("'unsafe-eval'")
    // sql.js loads its WebAssembly binary from the app itself.
    expect(policy).not.toContain('https://sql.js.org')
    // The browser SDK of Sentry reports through the backend tunnel.
    expect(getDirectiveSources(policy, 'connect-src')).not.toContain('https://o4506648698683392.ingest.us.sentry.io')
  })

  it('allows the inline scripts that carry the nonce of the response', () => {
    const nonce = createCspNonce()
    const scriptSources = getDirectiveSources(buildContentSecurityPolicy({ nonce }), 'script-src')

    expect(scriptSources).toContain(`'nonce-${nonce}'`)
    // Kept as a fallback for browsers without nonce support; browsers with it ignore 'unsafe-inline'.
    expect(scriptSources).toContain("'unsafe-inline'")
    expect(getDirectiveSources(buildContentSecurityPolicy(), 'script-src').some((s) => s.startsWith("'nonce-"))).toBe(
      false,
    )
  })

  it('never puts the nonce in style-src, where it would disable the inline styles of Emotion', () => {
    const nonce = createCspNonce()
    const styleSources = getDirectiveSources(buildContentSecurityPolicy({ nonce }), 'style-src')

    expect(styleSources).not.toContain(`'nonce-${nonce}'`)
    expect(styleSources).toContain("'unsafe-inline'")
  })

  it('creates a fresh 128-bit base64 nonce each time', () => {
    const nonces = new Set(Array.from({ length: 32 }, () => createCspNonce()))

    expect(nonces.size).toBe(32)
    for (const nonce of nonces) {
      expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/)
    }
  })

  it('trials strict-dynamic in a Report-Only policy beside the enforced one', () => {
    const nonce = createCspNonce()
    const headers = buildSecurityHeaders({ nonce })
    const enforcedScripts = getDirectiveSources(headers['Content-Security-Policy'], 'script-src')
    const trial = headers['Content-Security-Policy-Report-Only']

    expect(enforcedScripts).not.toContain("'strict-dynamic'")
    expect(getDirectiveSources(trial, 'script-src')).toEqual(
      expect.arrayContaining([`'nonce-${nonce}'`, "'strict-dynamic'"]),
    )
    expect(trial).not.toContain("'unsafe-eval'")
    expect(getDirectiveSources(trial, 'frame-ancestors')).toEqual(["'none'"])
    expect(trial).toContain(`report-uri ${SENTRY_SECURITY_REPORT_ENDPOINT}`)
    // Without a nonce, strict-dynamic would block every script.
    expect(buildSecurityHeaders()).not.toHaveProperty('Content-Security-Policy-Report-Only')
  })

  it('applies the headers to a response without replacing unrelated headers', () => {
    const nonce = createCspNonce()
    const responseHeaders = new Headers({ 'Cache-Control': 'public, max-age=60' })

    applySecurityHeaders(responseHeaders, { nonce })

    expect(responseHeaders.get('Cache-Control')).toBe('public, max-age=60')
    expect(responseHeaders.get('Content-Security-Policy')).toContain(`'nonce-${nonce}'`)
    expect(responseHeaders.get('Content-Security-Policy')).toContain(`report-uri ${SENTRY_SECURITY_REPORT_ENDPOINT}`)
    expect(responseHeaders.get('Content-Security-Policy-Report-Only')).toContain("'strict-dynamic'")
  })
})