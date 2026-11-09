import { describe, expect, it } from 'vitest'
import { TRACE_PROPAGATION_TARGETS } from './trace-propagation'

// Sentry matches a string target as a substring and a RegExp with test()
const propagates = (url: string) =>
  TRACE_PROPAGATION_TARGETS.some((target) => (typeof target === 'string' ? url.includes(target) : target.test(url)))

describe('TRACE_PROPAGATION_TARGETS', () => {
  it('leaves out the catalog and its community overlay, whose CORS preflight refuses trace headers', () => {
    for (const url of [
      'https://miruku.dxrating.net/api/v1/dxdata',
      'https://miruku.dxrating.net/api/v2/dxdata',
      'https://miruku.dxrating.net/api/v2/dxdata?since=1',
      'https://miruku.dxrating.net/api/v2/dxdata/community',
    ]) {
      expect(propagates(url), url).toBe(false)
    }
  })

  it('traces the rest of the API and this site', () => {
    for (const url of [
      'https://miruku.dxrating.net/api/v1/rpc/tags.list',
      'https://miruku.dxrating.net/api/v2/dxdataset',
      'https://dxrating.net/_serverFn/x',
      '/api/v1/x',
    ]) {
      expect(propagates(url), url).toBe(true)
    }
  })
})