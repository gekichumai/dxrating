import { describe, expect, it } from 'vitest'
import {
  SECURITY_REPORT_ENDPOINT_GROUP,
  SENTRY_SECURITY_REPORT_ENDPOINT,
  applySecurityReportHeaders,
  buildSecurityReportHeaders,
} from '../security-headers'

const getDirectiveSources = (policy: string, directive: string) => {
  const entry = policy.split('; ').find((item) => item.startsWith(`${directive} `))
  return entry?.split(' ').slice(1) ?? []
}

describe('security report headers', () => {
  it('builds Sentry CSP headers in report-only mode', () => {
    expect(SENTRY_SECURITY_REPORT_ENDPOINT).toBe(
      'https://o4506648698683392.ingest.us.sentry.io/api/4511398317064192/security/?sentry_key=9346c04036724f129e00a750c8ab9415',
    )

    const headers = buildSecurityReportHeaders()
    const policy = headers['Content-Security-Policy-Report-Only']
    const scriptSources = getDirectiveSources(policy, 'script-src')
    const imageSources = getDirectiveSources(policy, 'img-src')
    const connectSources = getDirectiveSources(policy, 'connect-src')

    expect(policy).toContain("default-src 'self'")
    expect(policy).not.toContain('*.')
    expect(scriptSources).toContain('https://razu.dxrating.net')
    expect(imageSources).toContain('https://gravatar.com')
    expect(imageSources).toContain('https://avatars.githubusercontent.com')
    expect(connectSources).toContain('https://o4506648698683392.ingest.us.sentry.io')
    expect(policy).toContain(`report-uri ${SENTRY_SECURITY_REPORT_ENDPOINT}`)
    expect(policy).toContain(`report-to ${SECURITY_REPORT_ENDPOINT_GROUP}`)
    expect(headers).not.toHaveProperty('Content-Security-Policy')
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

  it('applies report-only headers to a response without replacing existing headers', () => {
    const responseHeaders = new Headers({ 'Cache-Control': 'public, max-age=60' })

    applySecurityReportHeaders(responseHeaders)

    expect(responseHeaders.get('Cache-Control')).toBe('public, max-age=60')
    expect(responseHeaders.has('Content-Security-Policy')).toBe(false)
    expect(responseHeaders.get('Content-Security-Policy-Report-Only')).toContain(
      `report-uri ${SENTRY_SECURITY_REPORT_ENDPOINT}`,
    )
  })
})