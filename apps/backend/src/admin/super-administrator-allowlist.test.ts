import { describe, expect, it } from 'vitest'
import {
  InvalidSuperAdministratorAllowlistEffectiveAtError,
  InvalidSuperAdministratorAllowlistError,
  parseSuperAdministratorAllowlist,
} from './super-administrator-allowlist.js'

const EFFECTIVE_AT = '2026-08-24T12:00:00.000Z'

describe('super-administrator allowlist configuration', () => {
  it('defaults to an empty allowlist', () => {
    for (const serialized of [undefined, '']) {
      const allowlist = parseSuperAdministratorAllowlist(serialized)
      expect(allowlist.configuredUserCount).toBe(0)
      expect(allowlist.hasExactUserId('any-user')).toBe(false)
    }
  })

  it('deduplicates IDs and performs case-sensitive exact matching', () => {
    const allowlist = parseSuperAdministratorAllowlist(
      '["immutable-user-id","immutable-user-id","CaseSensitive"]',
      EFFECTIVE_AT,
    )

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
    const allowlist = parseSuperAdministratorAllowlist('["private-user-id"]', EFFECTIVE_AT)

    expect(JSON.stringify(allowlist)).toBe('{}')
    expect(Symbol.iterator in allowlist).toBe(false)
    expect('add' in allowlist).toBe(false)
    expect('delete' in allowlist).toBe(false)
    expect('userIds' in allowlist).toBe(false)
  })

  it('resolves existing configured users only through a deterministic trusted repository bridge', async () => {
    const allowlist = parseSuperAdministratorAllowlist('["user-b","missing-user","user-a","user-b"]', EFFECTIVE_AT)
    let receivedIds: readonly string[] | undefined

    const resolved = await allowlist.resolveExistingConfiguredUsers(async (orderedUserIds) => {
      receivedIds = orderedUserIds
      expect(Object.isFrozen(orderedUserIds)).toBe(true)
      return [
        { id: 'unexpected-user', name: 'Must not escape' },
        { id: 'user-b', name: 'B' },
        { id: 'user-a', name: 'A' },
        { id: 'user-b', name: 'Duplicate B' },
      ]
    })

    expect(receivedIds).toEqual(['missing-user', 'user-a', 'user-b'])
    expect(resolved).toEqual([
      { id: 'user-a', name: 'A' },
      { id: 'user-b', name: 'B' },
    ])
    expect(Object.isFrozen(resolved)).toBe(true)
    expect(JSON.stringify(allowlist)).toBe('{}')
    expect(Symbol.iterator in allowlist).toBe(false)
  })

  it('requires a valid UTC effective time for a non-empty list without exposing configuration values', () => {
    for (const effectiveAt of [undefined, '', 'not-a-timestamp', '2026-08-24T12:00:00+01:00']) {
      let thrown: unknown
      try {
        parseSuperAdministratorAllowlist('["private-user-id"]', effectiveAt)
      } catch (error) {
        thrown = error
      }

      expect(thrown).toBeInstanceOf(InvalidSuperAdministratorAllowlistEffectiveAtError)
      expect(String(thrown)).toBe(
        'InvalidSuperAdministratorAllowlistEffectiveAtError: SUPER_ADMIN_USER_IDS_EFFECTIVE_AT must be a UTC ISO timestamp whenever super-administrator IDs are configured',
      )
      expect(String(thrown)).not.toContain('private-user-id')
      if (effectiveAt) expect(String(thrown)).not.toContain(effectiveAt)
    }
  })

  it('admits only sessions issued strictly after the current allowlist generation', () => {
    const allowlist = parseSuperAdministratorAllowlist('["allowlisted-user"]', EFFECTIVE_AT)

    expect(
      allowlist.isSessionEligibleForCurrentGeneration('allowlisted-user', new Date('2026-08-24T11:59:59.999Z')),
    ).toBe(false)
    expect(
      allowlist.isSessionEligibleForCurrentGeneration('allowlisted-user', new Date('2026-08-24T12:00:00.000Z')),
    ).toBe(false)
    expect(
      allowlist.isSessionEligibleForCurrentGeneration('allowlisted-user', new Date('2026-08-24T12:00:00.001Z')),
    ).toBe(true)
    expect(allowlist.isSessionEligibleForCurrentGeneration('other-user', new Date('2026-08-24T12:00:00.001Z'))).toBe(
      false,
    )
    expect(allowlist.isSessionEligibleForCurrentGeneration('allowlisted-user', new Date('invalid'))).toBe(false)
  })

  it('bounds the deployment configuration before constructing the set', () => {
    const tooManyIds = JSON.stringify(Array.from({ length: 101 }, (_, index) => `user-${index}`))
    const oversizedInput = JSON.stringify(['x'.repeat(64 * 1024)])

    expect(() => parseSuperAdministratorAllowlist(tooManyIds)).toThrow(InvalidSuperAdministratorAllowlistError)
    expect(() => parseSuperAdministratorAllowlist(oversizedInput)).toThrow(InvalidSuperAdministratorAllowlistError)
  })
})