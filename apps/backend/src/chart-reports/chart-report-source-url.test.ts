import { describe, expect, it, vi } from 'vitest'
import { CHART_REPORT_SOURCE_URL_MAX_COUNT } from './chart-report-domain.js'
import {
  ChartReportSourceUrlFailure,
  normalizePublicChartReportSourceUrl,
  normalizePublicChartReportSourceUrls,
} from './chart-report-source-url.js'

const expectRejected = (value: unknown) => {
  expect(() => normalizePublicChartReportSourceUrl(value)).toThrowError(
    expect.objectContaining({
      name: 'ChartReportSourceUrlFailure',
      code: 'INVALID_SOURCE_URLS',
      message: 'Chart report source URLs are invalid',
    }),
  )
}

describe('public chart-report source URL normalization', () => {
  it('canonicalizes credential-free HTTP(S) references without resolving or fetching them', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    expect(normalizePublicChartReportSourceUrl('HTTPS://Example.COM:443/evidence/../chart?id=1#source')).toBe(
      'https://example.com/chart?id=1#source',
    )
    expect(normalizePublicChartReportSourceUrl('http://example.com:80/a%20path')).toBe('http://example.com/a%20path')
    expect(normalizePublicChartReportSourceUrl('https://internal-name.example.test/reference')).toBe(
      'https://internal-name.example.test/reference',
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it.each([
    undefined,
    null,
    '',
    ' https://example.com/',
    'https://example.com/\n',
    'https://example.com/a\\b',
    'ftp://example.com/file',
    'file:///etc/passwd',
    'data:text/plain,evidence',
    'https://user@example.com/',
    'https://user:secret@example.com/',
    'https://example.com:invalid/',
  ])('rejects malformed, ambiguous, credentialed, or non-HTTP input %#', (value) => {
    expectRejected(value)
  })

  it.each([
    'http://localhost/',
    'http://LOCALHOST./',
    'http://chart.localhost/',
    'http://chart.localhost./',
    'http://0.0.0.0/',
    'http://10.1.2.3/',
    'http://100.64.0.1/',
    'http://100.127.255.254/',
    'http://127.0.0.1/',
    'http://169.254.1.2/',
    'http://172.16.0.1/',
    'http://172.31.255.254/',
    'http://192.0.0.9/',
    'http://192.0.2.1/',
    'http://192.31.196.1/',
    'http://192.52.193.1/',
    'http://192.88.99.1/',
    'http://192.168.1.1/',
    'http://192.175.48.1/',
    'http://198.18.0.1/',
    'http://198.19.255.254/',
    'http://198.51.100.1/',
    'http://203.0.113.1/',
    'http://224.0.0.1/',
    'http://239.255.255.255/',
    'http://240.0.0.1/',
    'http://255.255.255.255/',
  ])('rejects localhost and every non-public IPv4 class: %s', (value) => {
    expectRejected(value)
  })

  it.each([
    'http://2130706433/',
    'http://0x7f000001/',
    'http://017700000001/',
    'http://127.1/',
    'http://0x0a000001/',
    'http://012.1.2.3/',
  ])('classifies alternate IPv4 forms only after WHATWG canonicalization: %s', (value) => {
    expectRejected(value)
  })

  it.each([
    'http://[::]/',
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://[::ffff:8.8.8.8]/',
    'http://[64:ff9b::808:808]/',
    'http://[64:ff9b:1::1]/',
    'http://[100::1]/',
    'http://[2001::1]/',
    'http://[2001:2::1]/',
    'http://[2001:db8::1]/',
    'http://[2002:0808:0808::1]/',
    'http://[2620:4f:8000::1]/',
    'http://[3fff::1]/',
    'http://[5f00::1]/',
    'http://[fc00::1]/',
    'http://[fdff:ffff::1]/',
    'http://[fe80::1]/',
    'http://[fec0::1]/',
    'http://[ff02::1]/',
  ])('rejects non-public and IPv4-mapped IPv6 literals: %s', (value) => {
    expectRejected(value)
  })

  it('allows literal addresses only from public unicast space', () => {
    expect(normalizePublicChartReportSourceUrl('https://8.8.8.8/evidence')).toBe('https://8.8.8.8/evidence')
    expect(normalizePublicChartReportSourceUrl('https://1.1.1.1/')).toBe('https://1.1.1.1/')
    expect(normalizePublicChartReportSourceUrl('https://[2001:4860:4860::8888]/')).toBe(
      'https://[2001:4860:4860::8888]/',
    )
    expect(normalizePublicChartReportSourceUrl('https://[2606:4700:4700::1111]/')).toBe(
      'https://[2606:4700:4700::1111]/',
    )
  })

  it('keeps DNS references untrusted but does not preemptively resolve or reject them', () => {
    expect(normalizePublicChartReportSourceUrl('https://localhost.evil.example/evidence')).toBe(
      'https://localhost.evil.example/evidence',
    )
    expect(normalizePublicChartReportSourceUrl('https://private.internal/evidence')).toBe(
      'https://private.internal/evidence',
    )
    expect(normalizePublicChartReportSourceUrl('https://printer.local/evidence')).toBe('https://printer.local/evidence')
  })

  it('enforces the shared count and length limits without deduplicating references', () => {
    const repeated = ['https://example.com/evidence', 'https://example.com/evidence']
    const normalized = normalizePublicChartReportSourceUrls(repeated)
    expect(normalized).toEqual(repeated)
    expect(Object.isFrozen(normalized)).toBe(true)

    expect(() =>
      normalizePublicChartReportSourceUrls(
        Array.from({ length: CHART_REPORT_SOURCE_URL_MAX_COUNT + 1 }, () => 'https://example.com/'),
      ),
    ).toThrow(ChartReportSourceUrlFailure)
    expectRejected(`https://example.com/${'x'.repeat(2_048)}`)
  })
})