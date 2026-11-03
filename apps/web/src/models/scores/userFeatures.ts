import type { UserFeatures } from '@gekichumai/api-contract'

/**
 * The features the server enables for the signed-in user (`GET /api/v1/me/features`, design §12.1). The web never
 * decides on its own: no query parameter or local setting turns a feature on.
 *
 * Read once per user per browser session (sessionStorage, and memory where sessionStorage is unavailable). A 404,
 * which the route answers while cloud save is off for the deployment, means every feature is off. A failed request
 * (offline, 5xx) also reads as off, but is not cached, so the next page load asks again.
 */

export const FEATURES_OFF: UserFeatures = Object.freeze({
  cloudSave: false,
  serverImports: false,
  optInAvailable: false,
})

const SESSION_KEY_PREFIX = 'dxr-features:'
const memoryCache = new Map<string, Promise<UserFeatures>>()

/** Fetches the features; resolves `null` for a 404, rejects on other failures */
export type FetchUserFeatures = () => Promise<UserFeatures | null>

function sessionStorageOrNull(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

function readCached(storage: Storage | null, userId: string): UserFeatures | null {
  try {
    const stored = storage?.getItem(SESSION_KEY_PREFIX + userId)
    if (!stored) return null
    const parsed = JSON.parse(stored) as Partial<UserFeatures>
    return {
      cloudSave: parsed.cloudSave === true,
      serverImports: parsed.serverImports === true,
      optInAvailable: parsed.optInAvailable === true,
    }
  } catch {
    return null
  }
}

export function getUserFeatures(
  userId: string,
  fetchFeatures: FetchUserFeatures,
  storage: Storage | null = sessionStorageOrNull(),
): Promise<UserFeatures> {
  const cached = readCached(storage, userId)
  if (cached) return Promise.resolve(cached)
  const pending = memoryCache.get(userId)
  if (pending) return pending

  const request = fetchFeatures().then(
    (features) => {
      const resolved = features ?? FEATURES_OFF
      try {
        storage?.setItem(SESSION_KEY_PREFIX + userId, JSON.stringify(resolved))
      } catch {
        // The memory cache still holds it for this page
      }
      return resolved
    },
    () => {
      memoryCache.delete(userId)
      return FEATURES_OFF
    },
  )
  memoryCache.set(userId, request)
  return request
}

/** Forgets the cached features (tests; a later opt-in flow re-reads them after opting in) */
export function clearUserFeaturesCache(storage: Storage | null = sessionStorageOrNull()) {
  memoryCache.clear()
  try {
    if (!storage) return
    for (let index = storage.length - 1; index >= 0; index--) {
      const key = storage.key(index)
      if (key?.startsWith(SESSION_KEY_PREFIX)) storage.removeItem(key)
    }
  } catch {
    // Nothing cached there
  }
}