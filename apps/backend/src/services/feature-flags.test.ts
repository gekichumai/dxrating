import { Effect, Exit } from 'effect'
import { TestClock } from 'effect/testing'
import { describe, expect, it } from '@effect/vitest'
import {
  makeFeatureFlags,
  resolveFeatureFlag,
  resolveUserFeatures,
  type CloudSaveMode,
  type FeatureFlagSettings,
  type FeatureFlagStore,
  type UserFlagState,
} from './feature-flags'

const settings = (cloudSaveMode: CloudSaveMode, overrides: Partial<FeatureFlagSettings> = {}): FeatureFlagSettings => ({
  cloudSaveMode,
  cloudSaveAllowlistEmails: ['owner@example.com'],
  serverImports: true,
  ...overrides,
})
const stranger: UserFlagState = { email: 'someone@example.com', overrides: {} }
const owner: UserFlagState = { email: 'Owner@Example.com', overrides: {} }
const withRow = (state: UserFlagState, enabled: boolean, flag: 'cloud_save' | 'server_imports' = 'cloud_save') => ({
  ...state,
  overrides: { ...state.overrides, [flag]: enabled },
})

describe('feature flag precedence', () => {
  it('lets CLOUD_SAVE_MODE=off override every row and the allowlist', () => {
    for (const state of [stranger, owner, withRow(stranger, true), withRow(owner, true)]) {
      expect(resolveFeatureFlag('cloud_save', settings('off'), state)).toBe(false)
      expect(resolveFeatureFlag('server_imports', settings('off'), state)).toBe(false)
      expect(resolveUserFeatures(settings('off'), state)).toEqual({
        cloudSave: false,
        serverImports: false,
        optInAvailable: false,
      })
    }
  })

  it('lets an enabled=false row turn one user off in every other mode, even on the allowlist', () => {
    for (const mode of ['allowlist', 'optin', 'on'] as const) {
      expect(resolveFeatureFlag('cloud_save', settings(mode), withRow(owner, false))).toBe(false)
      expect(resolveFeatureFlag('cloud_save', settings(mode), withRow(stranger, false))).toBe(false)
    }
  })

  it('lets an enabled=true row turn one user on in allowlist and optin modes', () => {
    expect(resolveFeatureFlag('cloud_save', settings('allowlist'), withRow(stranger, true))).toBe(true)
    expect(resolveFeatureFlag('cloud_save', settings('optin'), withRow(stranger, true))).toBe(true)
  })

  it('enables allowlisted emails case-insensitively', () => {
    expect(resolveFeatureFlag('cloud_save', settings('allowlist'), owner)).toBe(true)
    expect(resolveFeatureFlag('cloud_save', settings('optin'), owner)).toBe(true)
    expect(resolveFeatureFlag('cloud_save', settings('allowlist'), stranger)).toBe(false)
    expect(resolveFeatureFlag('cloud_save', settings('allowlist'), { email: null, overrides: {} })).toBe(false)
  })

  it('keeps optin mode off without a row and offers the opt-in', () => {
    expect(resolveUserFeatures(settings('optin'), stranger)).toEqual({
      cloudSave: false,
      serverImports: false,
      optInAvailable: true,
    })
    // An administrator's disable is final; the user cannot opt back in.
    expect(resolveUserFeatures(settings('optin'), withRow(stranger, false)).optInAvailable).toBe(false)
    expect(resolveUserFeatures(settings('optin'), withRow(stranger, true)).optInAvailable).toBe(false)
    expect(resolveUserFeatures(settings('allowlist'), stranger).optInAvailable).toBe(false)
  })

  it('enables everyone in on mode', () => {
    expect(resolveFeatureFlag('cloud_save', settings('on'), stranger)).toBe(true)
    expect(resolveFeatureFlag('cloud_save', settings('on'), { email: null, overrides: {} })).toBe(true)
    expect(resolveUserFeatures(settings('on'), stranger).optInAvailable).toBe(false)
  })

  it('requires cloud save and SERVER_IMPORTS=on for server imports', () => {
    expect(resolveFeatureFlag('server_imports', settings('on'), stranger)).toBe(true)
    expect(resolveFeatureFlag('server_imports', settings('on', { serverImports: false }), stranger)).toBe(false)
    expect(
      resolveFeatureFlag(
        'server_imports',
        settings('on', { serverImports: false }),
        withRow(stranger, true, 'server_imports'),
      ),
    ).toBe(false)
    expect(resolveFeatureFlag('server_imports', settings('allowlist'), stranger)).toBe(false)
    expect(resolveFeatureFlag('server_imports', settings('on'), withRow(stranger, false))).toBe(false)
    expect(resolveFeatureFlag('server_imports', settings('on'), withRow(stranger, false, 'server_imports'))).toBe(false)
  })
})

const fakeStore = (initial: Record<string, UserFlagState>) => {
  const states = new Map(Object.entries(initial))
  const calls = { load: 0, optIns: [] as Array<[string, string]> }
  const store: FeatureFlagStore = {
    load: (userId) =>
      Effect.sync(() => {
        calls.load += 1
        return states.get(userId) ?? { email: null, overrides: {} }
      }),
    recordOptIn: (userId, consentVersion) =>
      Effect.sync(() => {
        calls.optIns.push([userId, consentVersion])
        const state = states.get(userId) ?? { email: null, overrides: {} }
        states.set(userId, withRow(state, true))
      }),
  }
  return { states, calls, store }
}

describe('FeatureFlags service', () => {
  it.effect('caches each user for 60 seconds', () =>
    Effect.gen(function* () {
      const { states, calls, store } = fakeStore({ u1: stranger })
      const flags = makeFeatureFlags(settings('allowlist'), store)

      expect(yield* flags.isEnabled('cloud_save', 'u1')).toBe(false)
      states.set('u1', withRow(stranger, true))
      yield* TestClock.adjust('59 seconds')
      expect(yield* flags.isEnabled('cloud_save', 'u1')).toBe(false)
      expect(calls.load).toBe(1)

      yield* TestClock.adjust('2 seconds')
      expect(yield* flags.isEnabled('cloud_save', 'u1')).toBe(true)
      expect(calls.load).toBe(2)

      states.set('u1', withRow(stranger, false))
      yield* flags.invalidate('u1')
      expect(yield* flags.isEnabled('cloud_save', 'u1')).toBe(false)
    }),
  )

  it.effect('never reads the database while the kill switch is off', () =>
    Effect.gen(function* () {
      const { calls, store } = fakeStore({ u1: withRow(owner, true) })
      const flags = makeFeatureFlags(settings('off'), store)
      expect(yield* flags.features('u1')).toEqual({ cloudSave: false, serverImports: false, optInAvailable: false })
      expect(calls.load).toBe(0)
    }),
  )

  it.effect('records an opt-in only in optin mode and never over an administrator disable', () =>
    Effect.gen(function* () {
      const optin = fakeStore({ u1: stranger, u2: withRow(stranger, false) })
      const flags = makeFeatureFlags(settings('optin'), optin.store)
      expect((yield* flags.features('u1')).cloudSave).toBe(false)
      expect(yield* flags.optInCloudSave('u1', '2026-11-01')).toEqual({
        cloudSave: true,
        serverImports: true,
        optInAvailable: false,
      })
      expect(optin.calls.optIns).toEqual([['u1', '2026-11-01']])

      const disabled = yield* Effect.exit(flags.optInCloudSave('u2', '2026-11-01'))
      expect(Exit.isFailure(disabled) && JSON.stringify(disabled.cause)).toContain('disabled')

      for (const mode of ['off', 'allowlist', 'on'] as const) {
        const other = fakeStore({ u1: stranger })
        const exit = yield* Effect.exit(makeFeatureFlags(settings(mode), other.store).optInCloudSave('u1', 'v1'))
        expect(Exit.isFailure(exit) && JSON.stringify(exit.cause)).toContain('unavailable')
        expect(other.calls.optIns).toEqual([])
      }
    }),
  )
})