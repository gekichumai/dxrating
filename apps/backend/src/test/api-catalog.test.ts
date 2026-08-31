import { describe, expect, it } from 'vitest'
import { app } from '../app.js'

describe('API catalog discovery', () => {
  it('publishes the API schema, documentation, and agent metadata', async () => {
    const response = await app.request('https://miruku.dxrating.net/.well-known/api-catalog')

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/linkset+json')
    expect(response.headers.get('link')).toContain('rel="service-desc"')
    expect(response.headers.get('link')).toContain('https://dxrating.net/developers')
    expect(response.headers.get('link')).toContain('https://dxrating.net/llms.txt')

    const body = await response.json()
    expect(body.linkset[0]).toMatchObject({
      anchor: 'https://miruku.dxrating.net/api/v1',
      'service-desc': [
        {
          href: 'https://miruku.dxrating.net/spec.json',
          type: 'application/vnd.oai.openapi+json',
        },
      ],
      'service-doc': [
        { href: 'https://miruku.dxrating.net/docs', type: 'text/html' },
        { href: 'https://dxrating.net/developers', type: 'text/html' },
      ],
      describedby: [{ href: 'https://dxrating.net/llms.txt', type: 'text/markdown' }],
    })
  })

  it('supports RFC 9727 HEAD discovery without a response body', async () => {
    const response = await app.request('https://miruku.dxrating.net/.well-known/api-catalog', { method: 'HEAD' })

    expect(response.status).toBe(200)
    expect(response.headers.get('link')).toContain('rel="api-catalog"')
    expect(await response.text()).toBe('')
  })
})