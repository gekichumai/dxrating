import { describe, expect, it } from 'vitest'
import {
  InvalidSuperAdministratorAllowlistError,
  parseSuperAdministratorAllowlist,
} from './super-administrator-allowlist.js'

describe('super-administrator allowlist configuration', () => {
  it('defaults to an empty allowlist', () => {
    for (const serialized of [undefined, '']) {
      const allowlist = parseSuperAdministratorAllowlist(serialized)
      expect(allowlist.configuredUserCount).toBe(0)
      expect(allowlist.hasExactUserId('any-user')).toBe(false)
    }
  })

  it('deduplicates IDs and performs case-sensitive exact matching', () => {
    const allowlist = parseSuperAdministratorAllowlist('["immutable-user-id","immutable-user-id","CaseSensitive"]')

    expect(allowlist.configuredUserCount).toBe(2)
    expect(allowlist.hasExactUserId('immutable-user-id')).toBe(true)
    expect(allowlist.hasExactUserId('prefix-immutable-user-id')).toBe(false)
    expect(allowlist.hasExactUserId('casesensitive')).toBe(false)
  })

  it.each([
    'not-json-with-sensitive-user-id',
    '{}',
    '[null]',
    '[1]',
    '[""]',
    '[" leading-space"]',
    '["trailing-space "]',
    '["line\\nbreak"]',
    `[{"sensitive-user-id":"must-not-leak"}]`,
  ])('rejects malformed input without including configured values in the error', (serialized) => {
    let thrown: unknown
    try {
      parseSuperAdministratorAllowlist(serialized)
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(InvalidSuperAdministratorAllowlistError)
    expect(String(thrown)).toBe(
      'InvalidSuperAdministratorAllowlistError: SUPER_ADMIN_USER_IDS must be a JSON array of non-empty immutable user ID strings',
    )
    expect(String(thrown)).not.toContain(serialized)
    expect(String(thrown)).not.toContain('sensitive-user-id')
    expect(String(thrown)).not.toContain('must-not-leak')
  })

  it('does not expose the configured IDs through serialization or an iterator', () => {
    const allowlist = parseSuperAdministratorAllowlist('["private-user-id"]')

    expect(JSON.stringify(allowlist)).toBe('{}')
    expect(Symbol.iterator in allowlist).toBe(false)
    expect('add' in allowlist).toBe(false)
    expect('delete' in allowlist).toBe(false)
  })

  it('bounds the deployment configuration before constructing the set', () => {
    const tooManyIds = JSON.stringify(Array.from({ length: 101 }, (_, index) => `user-${index}`))
    const oversizedInput = JSON.stringify(['x'.repeat(64 * 1024)])

    expect(() => parseSuperAdministratorAllowlist(tooManyIds)).toThrow(InvalidSuperAdministratorAllowlistError)
    expect(() => parseSuperAdministratorAllowlist(oversizedInput)).toThrow(InvalidSuperAdministratorAllowlistError)
  })
})