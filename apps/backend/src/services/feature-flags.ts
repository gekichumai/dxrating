import { and, eq, sql } from 'drizzle-orm'
import { Clock, Context, Data, Effect, Layer } from 'effect'
import { AppConfig } from '../config'
import { user } from '../db/auth-schema'
import { Database, type DatabaseError } from '../db/index'
import { featureFlagOverrides } from '../db/schema'
import { isFeatureFlag, type FeatureFlag } from './feature-flag-names'

export { FEATURE_FLAGS, isFeatureFlag, type FeatureFlag } from './feature-flag-names'

export type CloudSaveMode = 'off' | 'allowlist' | 'optin' | 'on'

export interface FeatureFlagSettings {
  readonly cloudSaveMode: CloudSaveMode
  /** Lower-cased emails. */
  readonly cloudSaveAllowlistEmails: readonly string[]
  readonly serverImports: boolean
}

/** What the database knows about one user: their email and their override rows. */
export interface UserFlagState {
  readonly email: string | null
  /**
   * Email/password sign-up does not verify addresses, so anyone can register an
   * allowlisted address nobody has claimed yet; only a verified email matches the allowlist.
   */
  readonly emailVerified: boolean
  readonly overrides: Partial<Record<FeatureFlag, boolean>>
}

export interface UserFeatures {
  readonly cloudSave: boolean
  readonly serverImports: boolean
  readonly optInAvailable: boolean
}

/** Results are cached in memory per user for this long. */
export const FEATURE_FLAG_CACHE_TTL_MS = 60_000
const MAX_CACHED_USERS = 10_000

/**
 * Cloud save precedence:
 * 1. `CLOUD_SAVE_MODE=off` is the kill switch and overrides everything.
 * 2. A `feature_flag_overrides` row decides for its user (`enabled=false` turns one user off).
 * 3. A verified email in `CLOUD_SAVE_ALLOWLIST_EMAILS` turns the feature on. Unverified
 *    accounts on the allowlist need a `flag:set` row instead.
 * 4. Otherwise the mode decides: `on` enables everyone; `allowlist` and `optin` enable nobody.
 */
const resolveCloudSave = (settings: FeatureFlagSettings, state: UserFlagState): boolean => {
  if (settings.cloudSaveMode === 'off') return false
  const override = state.overrides.cloud_save
  if (override !== undefined) return override
  const allowlisted = state.email !== null && settings.cloudSaveAllowlistEmails.includes(state.email.toLowerCase())
  if (allowlisted && state.emailVerified) return true
  return settings.cloudSaveMode === 'on'
}

/**
 * Server imports write into cloud saves, so they need cloud save. `SERVER_IMPORTS=off`
 * is their own kill switch; with it on, an `enabled=false` row turns one user off.
 */
export const resolveFeatureFlag = (flag: FeatureFlag, settings: FeatureFlagSettings, state: UserFlagState): boolean => {
  switch (flag) {
    case 'cloud_save':
      return resolveCloudSave(settings, state)
    case 'server_imports':
      if (!settings.serverImports || !resolveCloudSave(settings, state)) return false
      return state.overrides.server_imports ?? true
  }
}

export const resolveUserFeatures = (settings: FeatureFlagSettings, state: UserFlagState): UserFeatures => {
  const cloudSave = resolveFeatureFlag('cloud_save', settings, state)
  return {
    cloudSave,
    serverImports: resolveFeatureFlag('server_imports', settings, state),
    // An administrator's row (including `enabled=false`) is never replaced by a self-service opt-in.
    optInAvailable: settings.cloudSaveMode === 'optin' && !cloudSave && state.overrides.cloud_save === undefined,
  }
}

export class CloudSaveOptInError extends Data.TaggedError('CloudSaveOptInError')<{
  /** `unavailable`: the mode is not `optin`. `disabled`: an administrator turned the user off. */
  readonly reason: 'unavailable' | 'disabled'
}> {}

export interface FeatureFlagStore {
  readonly load: (userId: string) => Effect.Effect<UserFlagState, DatabaseError>
  /** Records a self-service opt-in without replacing an administrator's row. */
  readonly recordOptIn: (userId: string, consentVersion: string) => Effect.Effect<void, DatabaseError>
}

export class FeatureFlags extends Context.Service<
  FeatureFlags,
  {
    readonly isEnabled: (flag: FeatureFlag, userId: string) => Effect.Effect<boolean, DatabaseError>
    readonly features: (userId: string) => Effect.Effect<UserFeatures, DatabaseError>
    readonly optInCloudSave: (
      userId: string,
      consentVersion: string,
    ) => Effect.Effect<UserFeatures, DatabaseError | CloudSaveOptInError>
    /** Drops this process's cached state for one user. */
    readonly invalidate: (userId: string) => Effect.Effect<void>
  }
>()('dxrating/FeatureFlags') {}

const EMPTY_STATE: UserFlagState = { email: null, emailVerified: false, overrides: {} }

export const makeFeatureFlags = (settings: FeatureFlagSettings, store: FeatureFlagStore) => {
  const cache = new Map<string, { state: UserFlagState; expiresAt: number }>()

  const remember = (userId: string, state: UserFlagState, now: number) => {
    if (cache.size >= MAX_CACHED_USERS) {
      for (const [key, entry] of cache) if (entry.expiresAt <= now) cache.delete(key)
      if (cache.size >= MAX_CACHED_USERS) cache.clear()
    }
    cache.set(userId, { state, expiresAt: now + FEATURE_FLAG_CACHE_TTL_MS })
  }

  const state = (userId: string) =>
    Effect.gen(function* () {
      // The kill switch needs no lookup; it also keeps an `off` deployment from touching the table.
      if (settings.cloudSaveMode === 'off') return EMPTY_STATE
      const now = yield* Clock.currentTimeMillis
      const cached = cache.get(userId)
      if (cached && cached.expiresAt > now) return cached.state
      const loaded = yield* store.load(userId)
      remember(userId, loaded, now)
      return loaded
    })

  const features = (userId: string) => Effect.map(state(userId), (loaded) => resolveUserFeatures(settings, loaded))

  return FeatureFlags.of({
    isEnabled: (flag, userId) => Effect.map(state(userId), (loaded) => resolveFeatureFlag(flag, settings, loaded)),
    features,
    optInCloudSave: (userId, consentVersion) =>
      Effect.gen(function* () {
        if (settings.cloudSaveMode !== 'optin') return yield* new CloudSaveOptInError({ reason: 'unavailable' })
        const current = yield* store.load(userId)
        if (current.overrides.cloud_save === false) return yield* new CloudSaveOptInError({ reason: 'disabled' })
        yield* store.recordOptIn(userId, consentVersion)
        cache.delete(userId)
        return yield* features(userId)
      }),
    invalidate: (userId) =>
      Effect.sync(() => {
        cache.delete(userId)
      }),
  })
}

export const makePostgresFeatureFlagStore = (database: typeof Database.Service): FeatureFlagStore => ({
  load: (userId) =>
    database
      .query('FeatureFlags.load', (db) =>
        db
          .select({
            email: user.email,
            emailVerified: user.emailVerified,
            flag: featureFlagOverrides.flag,
            enabled: featureFlagOverrides.enabled,
          })
          .from(user)
          .leftJoin(featureFlagOverrides, eq(featureFlagOverrides.user_id, user.id))
          .where(eq(user.id, userId)),
      )
      .pipe(
        Effect.map((rows) => {
          const overrides: Partial<Record<FeatureFlag, boolean>> = {}
          for (const row of rows) {
            if (row.flag !== null && row.enabled !== null && isFeatureFlag(row.flag)) overrides[row.flag] = row.enabled
          }
          return { email: rows[0]?.email ?? null, emailVerified: rows[0]?.emailVerified ?? false, overrides }
        }),
      ),
  recordOptIn: (userId, consentVersion) =>
    database
      .query('FeatureFlags.recordOptIn', (db) =>
        db
          .insert(featureFlagOverrides)
          .values({
            flag: 'cloud_save',
            user_id: userId,
            enabled: true,
            source: 'opt_in',
            consent_version: consentVersion,
          })
          .onConflictDoUpdate({
            target: [featureFlagOverrides.flag, featureFlagOverrides.user_id],
            set: { consent_version: consentVersion, updated_at: sql`now()` },
            // A concurrent administrator row wins; only an earlier opt-in is refreshed.
            setWhere: and(eq(featureFlagOverrides.source, 'opt_in'), eq(featureFlagOverrides.enabled, true)),
          }),
      )
      .pipe(Effect.asVoid),
})

export const FeatureFlagsLive = Layer.effect(
  FeatureFlags,
  Effect.gen(function* () {
    const config = yield* AppConfig
    const database = yield* Database
    return makeFeatureFlags(config.featureFlags, makePostgresFeatureFlagStore(database))
  }),
)