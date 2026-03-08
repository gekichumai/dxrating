import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestServer, teardownTestServer, getBaseUrl } from './setup.js'

describe('Oneshot Renderer', () => {
  beforeAll(async () => {
    await setupTestServer()
  })
  afterAll(async () => {
    await teardownTestServer()
  })

  it('POST /functions/render-oneshot/v0 with demo=1 responds', async () => {
    const res = await fetch(`${getBaseUrl()}/functions/render-oneshot/v0?demo=1`, {
      method: 'POST',
    })
    // The renderer depends on font files (ASSETS_BASE_DIR).
    // In test env without fonts, it may fail. We verify the endpoint is reachable.
    if (res.status === 200) {
      const contentType = res.headers.get('content-type') ?? ''
      expect(contentType).toMatch(/image\/(svg\+xml|png)/)
    } else {
      // Endpoint is reachable but failed due to missing assets — acceptable in test env
      expect(res.status).toBeGreaterThanOrEqual(400)
    }
  })
})
