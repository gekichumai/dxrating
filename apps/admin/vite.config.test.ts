// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { createLocalDevelopmentProxy } from './vite.config'

describe('local administrator development proxy', () => {
  it('fails closed without the server-side access proof', () => {
    expect(() => createLocalDevelopmentProxy('  ')).toThrow('ADMIN_ACCESS_TEST_BYPASS_SECRET is required')
  })

  it('adds the proof only to private administrator requests', () => {
    const proxy = createLocalDevelopmentProxy('local-proof')
    const administratorRoute = '^/api/admin(?:/|$)'

    expect(proxy[administratorRoute]).toMatchObject({
      changeOrigin: true,
      headers: { 'X-DXRating-Admin-Access-Test': 'local-proof' },
      target: 'http://localhost:3000',
    })
    expect(proxy['/api']).toMatchObject({
      changeOrigin: true,
      target: 'http://localhost:3000',
    })
    expect(proxy['/api']?.headers).toBeUndefined()
    expect(new RegExp(administratorRoute).test('/api/admin/bootstrap')).toBe(true)
    expect(new RegExp(administratorRoute).test('/api/administrator')).toBe(false)
  })
})