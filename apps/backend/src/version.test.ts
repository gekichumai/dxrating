import { describe, expect, it } from 'vitest'
import { parseConfiguredImageDigest } from './version.js'

describe('configured image digest', () => {
  it('accepts only an exact sha256 release identity', () => {
    const digest = `sha256:${'a'.repeat(64)}`

    expect(parseConfiguredImageDigest(digest)).toBe(digest)
    expect(parseConfiguredImageDigest(undefined)).toBeNull()
    expect(parseConfiguredImageDigest('')).toBeNull()
  })

  it.each([
    'latest',
    'sha-0123456789abcdef0123456789abcdef01234567',
    `sha256:${'A'.repeat(64)}`,
    `sha256:${'a'.repeat(63)}`,
  ])('rejects a mutable or malformed release identity: %s', (value) => {
    expect(() => parseConfiguredImageDigest(value)).toThrow('IMAGE_DIGEST must be an exact sha256 digest')
  })
})