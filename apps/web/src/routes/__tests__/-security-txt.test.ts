import { describe, expect, it } from 'vitest'
import { buildSecurityTxt, createSecurityTxtResponse } from '../[.]well-known/security[.]txt'

describe('buildSecurityTxt', () => {
  it('publishes the required contact and expiry fields', () => {
    expect(buildSecurityTxt()).toBe(`Contact: mailto:security@dxrating.net
Contact: mailto:vulnerability@dxrating.net
Expires: 2027-08-31T00:00:00Z
Encryption: https://keys.openpgp.org/vks/v1/by-fingerprint/2A13C8148A3DE89903079D9FE17343FCBF53F33F
Canonical: https://dxrating.net/.well-known/security.txt
Preferred-Languages: en, ja, zh
`)
  })

  it('keeps the expiry between one month and one year away', () => {
    const expires = buildSecurityTxt().match(/^Expires: (.+)$/m)?.[1]

    expect(expires).toBeDefined()
    const remaining = Date.parse(expires!) - Date.now()
    expect(remaining).toBeGreaterThan(30 * 24 * 60 * 60 * 1000)
    expect(remaining).toBeLessThanOrEqual(365 * 24 * 60 * 60 * 1000)
  })

  it('serves UTF-8 plain text with a short cache lifetime', async () => {
    const response = createSecurityTxtResponse()

    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8')
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600')
    expect(await response.text()).toBe(buildSecurityTxt())
  })

  it('returns the same headers without a body for HEAD requests', async () => {
    const response = createSecurityTxtResponse(false)

    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8')
    expect(await response.text()).toBe('')
  })
})