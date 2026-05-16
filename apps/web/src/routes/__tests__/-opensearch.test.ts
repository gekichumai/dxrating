import { describe, expect, it } from 'vitest'
import { buildOpenSearchDescription } from '../opensearch[.]xml'

describe('buildOpenSearchDescription', () => {
  it('describes DXRating search with the existing query route', () => {
    const xml = buildOpenSearchDescription()

    expect(xml).toContain('<ShortName>DXRating</ShortName>')
    expect(xml).toContain('template="https://dxrating.net/search?q={searchTerms}"')
    expect(xml).toContain('type="application/opensearchdescription+xml"')
    expect(xml).toContain('<InputEncoding>UTF-8</InputEncoding>')
  })
})