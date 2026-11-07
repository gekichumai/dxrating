import type { ImportJobDTO, SaveDTO, UserFeatures } from '@gekichumai/api-contract'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { captureAnalyticsEvent } from '../../lib/analytics'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'
import { authClient } from '../../lib/auth-client'
import type { CloudScoreRepository, CloudScoreRepositoryOptions, CloudSyncStopReason } from './CloudScoreRepository'
import { clearUserFeaturesCache, type FetchUserFeatures, getUserFeatures } from './userFeatures'

/**
 * Which save the visitor works on (design §8.2, the simplified #181): the local save, or a cloud save.
 *
 * A cloud save is active only when all of these hold:
 * - the visitor is signed in;
 * - `GET /me/features` says `cloudSave` (the only request this adds for signed-in users while the flag is off; none
 *   for anonymous visitors);
 * - `localStorage['active-save-id']` names a save for this user (set by {@link ActiveSave.setActiveSaveId}: the first
 *   sign-in migration, the save selector, or the dev console);
 * - that save is in the user's list (`GET /saves`). A save that is gone falls back to the local save with a toast.
 *
 * Everything else uses the local save, exactly as before. The repository classes and the private API client load
 * with a dynamic import, only once a cloud save is about to activate.
 */

export const ACTIVE_SAVE_STORAGE_KEY = 'active-save-id'

/** `{ [userId]: saveId }`: each user has their own active save on a shared browser */
type ActiveSaveMap = Record<string, string>

function readActiveSaveMap(storage: Storage | null): ActiveSaveMap {
  try {
    const stored = storage?.getItem(ACTIVE_SAVE_STORAGE_KEY)
    if (!stored) return {}
    const parsed: unknown = JSON.parse(stored)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    )
  } catch {
    return {}
  }
}

export function readActiveSaveId(storage: Storage | null, userId: string): string | null {
  return readActiveSaveMap(storage)[userId] ?? null
}

export function writeActiveSaveId(storage: Storage | null, userId: string, saveId: string | null) {
  const map = readActiveSaveMap(storage)
  if (saveId) map[userId] = saveId
  else delete map[userId]
  try {
    if (Object.keys(map).length) storage?.setItem(ACTIVE_SAVE_STORAGE_KEY, JSON.stringify(map))
    else storage?.removeItem(ACTIVE_SAVE_STORAGE_KEY)
  } catch {
    // A restricted storage: the choice lasts for this page only
  }
}

export interface OpenCloudRepositoryOptions {
  userId: string
  saveId: string
  onStopped?: CloudScoreRepositoryOptions['onStopped']
  /** `serverImports` of `/me/features` (§7.4) */
  serverImports?: boolean
}

/** What the active save decision talks to; replaced in tests */
export interface ActiveSaveDependencies {
  /** The signed-in user's ID, `null` when signed out, `undefined` while the session loads */
  useSessionUserId(): string | null | undefined
  /** `GET /me/features`; `null` for a 404 */
  fetchFeatures: FetchUserFeatures
  /** `GET /saves` */
  listSaves(): Promise<readonly SaveDTO[]>
  openCloudRepository(options: OpenCloudRepositoryOptions): Promise<CloudScoreRepository>
  /** How long the decision may wait on the network before it stops holding work back; {@link DECISION_TIMEOUT_MS} */
  decisionTimeoutMs?: number
}

/**
 * How long the decision may wait on the network before it stops holding back the work that waits for it (§8.2).
 * With no cloud save chosen the answer can only be the local save: it is final then, so the automatic maimai NET
 * import runs as it did before cloud save. With a cloud save chosen the requests keep going and the cloud save opens
 * when they answer; until then the visitor is told that changes stay in this browser, and the automatic import waits.
 */
export const DECISION_TIMEOUT_MS = 5_000

/** The toast shown while a chosen cloud save cannot be reached; dismissed once the decision is made */
const UNREACHABLE_TOAST_ID = 'cloud-save-unreachable'

const isNotFound = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  (('status' in error && error.status === 404) || ('code' in error && error.code === 'NOT_FOUND'))

const loadPrivateApi = () => import('../../lib/privateApi').then((module) => module.privateApiClient)

/** Rejects unless the browser's session (asked of the server) is still `userId` */
async function ensureSessionUser(userId: string) {
  const { data } = await authClient.getSession({ query: { disableCookieCache: true } })
  if (data?.user.id !== userId) throw new Error('The session belongs to another account now')
}

export const defaultActiveSaveDependencies: ActiveSaveDependencies = {
  useSessionUserId() {
    const { data, isPending } = authClient.useSession()
    if (data?.user.id) return data.user.id
    return isPending ? undefined : null
  },
  async fetchFeatures(userId) {
    const client = await loadPrivateApi()
    // Asked of the server (not a cached session), right before and after the request: another tab may have signed
    // another account in while the client loaded, and that account's features must never be cached as this one's
    await ensureSessionUser(userId)
    let features: UserFeatures | null
    try {
      features = (await client.features.get()) as UserFeatures
    } catch (error) {
      if (!isNotFound(error)) throw error
      features = null
    }
    await ensureSessionUser(userId)
    return features
  },
  async listSaves() {
    const client = await loadPrivateApi()
    return (await client.cloudSave.saves.list()).saves as SaveDTO[]
  },
  async openCloudRepository(options) {
    const [{ CloudScoreRepository }, { streamNetImport }, client, Sentry] = await Promise.all([
      import('./CloudScoreRepository'),
      import('./cloudNetImport'),
      loadPrivateApi(),
      import('@sentry/tanstackstart-react'),
    ])
    const { imports } = client.cloudSave
    return CloudScoreRepository.open({
      ...options,
      api: {
        changes: (input) => client.cloudSave.records.changes(input),
        mutate: (input) => client.cloudSave.records.mutate(input),
      },
      imports: {
        client: (input) => imports.client(input as Parameters<typeof imports.client>[0]),
        lxns: (input) => imports.lxns(input),
        divingFish: (input) => imports.divingFish(input as Parameters<typeof imports.divingFish>[0]),
        get: (input) => imports.get(input) as Promise<ImportJobDTO>,
        list: (input) => imports.list(input) as Promise<ImportJobDTO[]>,
      },
      netImport: streamNetImport,
      // The source and who fetched it, nothing else (§12.3)
      onImportJobFinished: ({ status, source, fetchedBy }) =>
        captureAnalyticsEvent(status === 'succeeded' ? 'import_job_succeeded' : 'import_job_failed', {
          source,
          fetched_by: fetchedBy,
        }),
      // Counts and sums only: no user, save or chart identifiers
      reportChecksumMismatch: (report) => {
        Sentry.metrics.count('cloudsave.checksum_mismatch', 1)
        Sentry.captureMessage('cloudsave.checksum_mismatch', { level: 'warning', extra: { ...report } })
      },
    })
  },
}

export const ActiveSaveDependenciesContext = createContext<ActiveSaveDependencies>(defaultActiveSaveDependencies)

export interface ActiveSave {
  kind: 'local' | 'cloud'
  /**
   * Whether the choice between the local save and a cloud save is made for the current session (signed out: once
   * the session has loaded; signed in: once `/me/features`, and for a cloud save the save list, have answered, or
   * after {@link DECISION_TIMEOUT_MS} when no cloud save is chosen). Work that must go to the right save, such as the
   * automatic maimai NET import, waits for it.
   */
  decided: boolean
  /** The active cloud save, `null` for the local save */
  saveId: string | null
  /** The cloud repository while a cloud save is active */
  cloudRepository: CloudScoreRepository | null
  /**
   * Chooses the cloud save of the signed-in user (`null`: the local save). It activates only if the server enables
   * cloud save for the user and the save exists.
   */
  setActiveSaveId(saveId: string | null): void
  /** Sends what the cloud save still has to send, for at most 3 s; call before signing out */
  flushBeforeSignOut(): Promise<void>
  /** The signed-in user's cloud saves (`GET /saves`), for the save selector */
  listSaves(): Promise<readonly SaveDTO[]>
  /** The signed-in user's ID; `null` when signed out, `undefined` while the session loads */
  userId: string | null | undefined
  /**
   * What `GET /me/features` answered for the signed-in user; `null` when signed out or until it answers. Every
   * cloud save surface (the first sign-in migration, the beta opt-in, "Download my data") renders only on it.
   */
  features: UserFeatures | null
  /** Forgets the cached features and decides again (after opting in to the beta) */
  refreshFeatures(): void
}

export const ActiveSaveContext = createContext<ActiveSave>({
  kind: 'local',
  decided: true,
  saveId: null,
  cloudRepository: null,
  setActiveSaveId: () => {},
  flushBeforeSignOut: async () => {},
  listSaves: async () => [],
  userId: null,
  features: null,
  refreshFeatures: () => {},
})

export const useActiveSave = (): ActiveSave => useContext(ActiveSaveContext)

function browserLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

declare global {
  interface Window {
    /** Dev builds only: choose the active cloud save from the console (the save selector lists existing saves only) */
    dxratingActiveSave?: { set(saveId: string | null): void }
  }
}

/** Decides the active save; used by `RatingCalculatorContextProvider`, which owns the repositories */
export function useActiveSaveDecision(): ActiveSave {
  const dependencies = useContext(ActiveSaveDependenciesContext)
  const userId = dependencies.useSessionUserId()
  const locale = useLocale()
  const [cloudRepository, setCloudRepository] = useState<CloudScoreRepository | null>(null)
  const [selectionVersion, setSelectionVersion] = useState(0)
  const cloudRef = useRef<CloudScoreRepository | null>(null)
  cloudRef.current = cloudRepository
  // Read when a toast shows, not a reason to decide again
  const localeRef = useRef(locale)
  localeRef.current = locale
  // The decision this render shows is final for the session and selection (see `ActiveSave.decided`)
  const decisionKey = userId === undefined ? undefined : userId === null ? 'anonymous' : `${userId}:${selectionVersion}`
  const [decidedKey, setDecidedKey] = useState<string | null>(null)
  // Kept with the user they were read for: never shown to another user
  const [featuresState, setFeaturesState] = useState<{ userId: string; features: UserFeatures } | null>(null)

  useEffect(() => {
    // The session is still loading: keep what is shown
    if (userId === undefined) return
    if (userId === null) {
      setCloudRepository(null)
      setDecidedKey('anonymous')
      return
    }
    const key = `${userId}:${selectionVersion}`
    // Another user signed in without a sign-out in between: never show the previous user's save to them, nor queue
    // their changes in it. No flush either, the session is no longer the previous user's
    const previous = cloudRef.current
    if (previous && previous.userId !== userId) {
      void previous.dispose({ flushTimeoutMs: 0 })
      setCloudRepository(null)
    }

    let cancelled = false
    const storage = browserLocalStorage()
    const fallBackToLocal = () => {
      if (!cancelled) setCloudRepository(null)
    }

    // A stalled network does not end the decision: the requests keep going (see DECISION_TIMEOUT_MS)
    let settled = false
    const timeout = setTimeout(() => {
      if (cancelled || settled) return
      if (!readActiveSaveId(storage, userId)) {
        setDecidedKey(key)
        return
      }
      toast(m.ratingCalculator_cloudSave_unreachable({}, { locale: localeRef.current }), {
        id: UNREACHABLE_TOAST_ID,
        duration: 8_000,
      })
    }, dependencies.decisionTimeoutMs ?? DECISION_TIMEOUT_MS)

    void (async () => {
      const features = await getUserFeatures(userId, dependencies.fetchFeatures)
      if (cancelled) return
      setFeaturesState((current) =>
        current?.userId === userId && sameFeatures(current.features, features) ? current : { userId, features },
      )
      const saveId = readActiveSaveId(storage, userId)
      if (!features.cloudSave || !saveId) return fallBackToLocal()

      const current = cloudRef.current
      if (current && current.userId === userId && current.saveId === saveId) return

      const saves = await dependencies.listSaves()
      if (cancelled) return
      if (!saves.some((save) => save.id === saveId)) {
        writeActiveSaveId(storage, userId, null)
        toast(m.ratingCalculator_cloudSave_saveMissing({}, { locale: localeRef.current }), { id: 'cloud-save-missing' })
        return fallBackToLocal()
      }

      let opened: CloudScoreRepository | null = null
      // Syncing stopped for good mid-session (§8.2, §12): the save is gone or cloud save was turned off (404), or the
      // session ended (401). Back to the local save; the outbox stays in the user's database
      const onStopped = (reason: CloudSyncStopReason) => {
        // A disposed repository never reports: this one is still the active one, or about to be
        if (!opened) return
        // A save the user switched away from may still answer late (its outbox flushes on dispose): it never clears
        // the selection of the save now chosen
        if (reason === 'not-found' && readActiveSaveId(storage, userId) === saveId) {
          writeActiveSaveId(storage, userId, null)
          // The features may have been turned off: ask again on the next decision
          clearUserFeaturesCache()
          toast(m.ratingCalculator_cloudSave_saveMissing({}, { locale: localeRef.current }), {
            id: 'cloud-save-missing',
          })
        }
        setCloudRepository((current) => (current === opened ? null : current))
      }
      const repository = await dependencies.openCloudRepository({
        userId,
        saveId,
        onStopped,
        serverImports: features.serverImports,
      })
      opened = repository
      if (cancelled) {
        void repository.dispose({ flushTimeoutMs: 0 })
        return
      }
      repository.start()
      setCloudRepository(repository)
    })()
      .catch((error: unknown) => {
        // Saves unavailable (offline, IndexedDB refused): the local save, as before
        console.warn('[cloud-save] Using the local save', error)
        fallBackToLocal()
      })
      .finally(() => {
        settled = true
        clearTimeout(timeout)
        toast.dismiss(UNREACHABLE_TOAST_ID)
        if (!cancelled) setDecidedKey(key)
      })

    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [userId, selectionVersion, dependencies])

  // A repository that is no longer active stops syncing; what it could not send stays in its outbox
  useEffect(() => {
    if (!cloudRepository) return
    return () => {
      void cloudRepository.dispose()
    }
  }, [cloudRepository])

  const setActiveSaveId = useCallback(
    (saveId: string | null) => {
      if (!userId) return
      writeActiveSaveId(browserLocalStorage(), userId, saveId)
      setSelectionVersion((version) => version + 1)
    },
    [userId],
  )

  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') return
    window.dxratingActiveSave = { set: setActiveSaveId }
    return () => {
      delete window.dxratingActiveSave
    }
  }, [setActiveSaveId])

  // Ownership is enforced here, during render, not only by the effect above that disposes the repository: on the
  // first render after a sign-out or an account switch, the previous user's save is never exposed (its scores read,
  // or changes queued in it). A session still loading keeps what is shown
  const exposedRepository =
    cloudRepository && userId !== null && (userId === undefined || cloudRepository.userId === userId)
      ? cloudRepository
      : null

  const flushBeforeSignOut = useCallback(async () => {
    await exposedRepository?.flush()
  }, [exposedRepository])

  const listSaves = useCallback(() => dependencies.listSaves(), [dependencies])

  const refreshFeatures = useCallback(() => {
    clearUserFeaturesCache()
    setSelectionVersion((version) => version + 1)
  }, [])

  const decided = decisionKey !== undefined && decidedKey === decisionKey
  const features = userId && featuresState?.userId === userId ? featuresState.features : null

  return useMemo(
    () => ({
      kind: exposedRepository ? 'cloud' : 'local',
      decided,
      saveId: exposedRepository?.saveId ?? null,
      cloudRepository: exposedRepository,
      setActiveSaveId,
      flushBeforeSignOut,
      listSaves,
      userId,
      features,
      refreshFeatures,
    }),
    [exposedRepository, decided, setActiveSaveId, flushBeforeSignOut, listSaves, userId, features, refreshFeatures],
  )
}

const sameFeatures = (a: UserFeatures, b: UserFeatures) =>
  a.cloudSave === b.cloudSave && a.serverImports === b.serverImports && a.optInAvailable === b.optInAvailable