import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createOneshotRenderer, createRenderService, normalizeWidth } from '@gekichumai/oneshot-renderer'

test('the built public package imports and runs in Node without a module loader', async () => {
  assert.equal(typeof createOneshotRenderer, 'function')
  assert.equal(normalizeWidth(undefined), 1500)
  let calls = 0
  const service = createRenderService(async () => {
    calls++
    return { body: '<svg/>', contentType: 'image/svg+xml', timings: {} }
  })
  const input = { data: { b15: [], b35: [] }, version: 'PRiSM PLUS' }
  assert.equal((await service(input)).cache, 'MISS')
  assert.equal((await service(input)).cache, 'HIT')
  assert.equal(calls, 1)
})