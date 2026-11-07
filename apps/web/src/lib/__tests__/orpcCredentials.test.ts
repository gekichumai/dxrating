import { describe, expect, it } from 'vitest'
import { credentialsFor } from '../orpc'

describe('credentialsFor', () => {
  it('omits cookies on reads of the public tag and alias lists', () => {
    expect(credentialsFor('https://miruku.dxrating.net/api/v1/tags?idScheme=public', 'GET')).toBe('omit')
    expect(credentialsFor('https://miruku.dxrating.net/api/v1/aliases?idScheme=public', 'GET')).toBe('omit')
    expect(credentialsFor('https://miruku.dxrating.net/api/v1/announcements', 'GET')).toBe('omit')
  })

  it('keeps cookies on writes and on every other route', () => {
    expect(credentialsFor('https://miruku.dxrating.net/api/v1/aliases', 'POST')).toBe('include')
    expect(credentialsFor('https://miruku.dxrating.net/api/v1/tags/attach', 'POST')).toBe('include')
    expect(credentialsFor('https://miruku.dxrating.net/api/v1/comments?songId=x', 'GET')).toBe('include')
    expect(credentialsFor('https://miruku.dxrating.net/api/v1/tags/sheet', 'GET')).toBe('include')
  })
})