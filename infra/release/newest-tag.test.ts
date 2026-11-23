import assert from 'node:assert/strict'
import { test } from 'node:test'

import { newestReleaseTag } from './newest-tag.ts'

test('the newest release tag wins over every older one, whatever the order', () => {
  assert.equal(newestReleaseTag(['v1.6.523', 'v1.6.521', 'v1.6.522']), 'v1.6.523')
})

test('versions compare as numbers, not strings', () => {
  assert.equal(newestReleaseTag(['v1.6.99', 'v1.6.100']), 'v1.6.100')
  assert.equal(newestReleaseTag(['v1.10.0', 'v1.9.9']), 'v1.10.0')
  assert.equal(newestReleaseTag(['v2.0.0', 'v1.99.99']), 'v2.0.0')
})

test('tags that are not vMAJOR.MINOR.PATCH are ignored', () => {
  assert.equal(newestReleaseTag(['v1.6.523', 'v9-beta', 'nightly', 'v10.0.0-rc.1']), 'v1.6.523')
  assert.equal(newestReleaseTag(['nightly']), undefined)
})