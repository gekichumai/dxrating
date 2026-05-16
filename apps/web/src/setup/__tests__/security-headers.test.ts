import { describe, expect, it } from 'vitest'
import {
  SECURITY_REPORT_ENDPOINT_GROUP,
  SENTRY_SECURITY_REPORT_ENDPOINT,
  applySecurityReportHeaders,
  buildSecurityReportHeaders,
} from '../security-headers'

describe('security report headers', () => {
  it('builds Sentry CSP headers in report-only mode', () => {
    const headers = buildSecurityReportHeaders()
    const policy = headers['Content-Security-Policy-Report-Only']

    expect(policy).toContain("default-src 'self'")
    expect(policy).toContain('https://gravatar.com')
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