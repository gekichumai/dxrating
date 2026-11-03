import type { SaveDTO, UserFeatures } from '@gekichumai/api-contract'
import { renderHook, waitFor } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import type { FC, PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RatingCalculatorContextProvider } from '../../context/RatingCalculatorContext'
import {
  ACTIVE_SAVE_STORAGE_KEY,
  type ActiveSaveDependencies,
  ActiveSaveDependenciesContext,
  readActiveSaveId,
  useActiveSave,
  writeActiveSaveId,
} from '../ActiveSaveContext'
import { CloudScoreRepository } from '../CloudScoreRepository'
import { clearUserFeaturesCache, FEATURES_OFF } from '../userFeatures'
import { useScoreRepository } from '../useScoreRepository'
import { useCloudSaveUi } from '../CloudSaveUiContext'
import { FakeCloudSaveServer } from './fakeCloudSaveServer'

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }))

vi.mock('react-hot-toast', () => ({
  default: Object.assign(toast, { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() }),
}))

const FEATURES_ON: UserFeatures = { cloudSave: true, serverImports: true, optInAvailable: false }

const save = (id: string): SaveDTO => ({
  id,
  name: 'Main',
  region: 'jp',
  gameVersion: null,
  clientProfileKey: 'web-local',
  revision: 1,
  recordCount: 1,
  createdAt: '2026-11-03T00:00:00.000Z',
  updatedAt: '2026-11-03T00:00:00.000Z',
  latestSnapshot: null,
})

let server: FakeCloudSaveServer
let factory: IDBFactory
const repositories: CloudScoreRepository[] = []

function dependencies(userId: string | null, overrides: Partial<ActiveSaveDependencies> = {}) {
  const deps = {
    useSessionUserId: () => userId,
    fetchFeatures: vi.fn(async (): Promise<UserFeatures | null> => null),
    listSaves: vi.fn(async (): Promise<SaveDTO[]> => []),
    openCloudRepository: vi.fn(async (options: { userId: string; saveId: string }) => {
      const repository = await CloudScoreRepository.open({
        ...options,
        api: server.api,
        indexedDB: factory,
        locks: null,
        createChannel: null,
        eventTarget: null,
      })
      repositories.push(repository)
      return repository
    }),
    ...overrides,
  }
  return deps
}

function renderActiveSave(deps: ActiveSaveDependencies) {
  const wrapper: FC<PropsWithChildren> = ({ children }) => (
    <ActiveSaveDependenciesContext.Provider value={deps}>
      <RatingCalculatorContextProvider>{children}</RatingCalculatorContextProvider>
    </ActiveSaveDependenciesContext.Provider>
  )
  return renderHook(
    () => ({ repository: useScoreRepository(), activeSave: useActiveSave(), cloudSaveUi: useCloudSaveUi() }),
    { wrapper },
  )
}

/** Lets the decision's promises settle */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

describe('ActiveSaveContext', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    clearUserFeaturesCache()
    server = new FakeCloudSaveServer()
    factory = new IDBFactory()
    toast.mockClear()
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await Promise.all(repositories.splice(0).map((repository) => repository.dispose({ flushTimeoutMs: 0 })))
  })

  it('keeps anonymous visitors on the local save without any request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    window.localStorage.setItem(ACTIVE_SAVE_STORAGE_KEY, JSON.stringify({ 'user-1': 'dsav_main' }))
    const deps = dependencies(null)

    const { result } = renderActiveSave(deps)
    await settle()

    expect(result.current.repository.kind).toBe('local')
    expect(result.current.activeSave).toMatchObject({ kind: 'local', saveId: null })
    expect(deps.fetchFeatures).not.toHaveBeenCalled()
    expect(deps.listSaves).not.toHaveBeenCalled()
    expect(deps.openCloudRepository).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('asks only for the features of a signed-in user while cloud save is off, once per session', async () => {
    window.localStorage.setItem(ACTIVE_SAVE_STORAGE_KEY, JSON.stringify({ 'user-1': 'dsav_main' }))
    const deps = dependencies('user-1')

    const first = renderActiveSave(deps)
    await settle()
    first.unmount()
    const second = renderActiveSave(deps)
    await settle()

    expect(second.result.current.repository.kind).toBe('local')
    expect(deps.fetchFeatures).toHaveBeenCalledTimes(1)
    expect(deps.listSaves).not.toHaveBeenCalled()
    expect(deps.openCloudRepository).not.toHaveBeenCalled()
  })

  it('reads a failed features request as off without caching it', async () => {
    const deps = dependencies('user-1', { fetchFeatures: vi.fn(async () => Promise.reject(new TypeError('offline'))) })

    renderActiveSave(deps).unmount()
    await settle()
    renderActiveSave(deps)
    await settle()

    expect(deps.fetchFeatures).toHaveBeenCalledTimes(2)
    expect(deps.openCloudRepository).not.toHaveBeenCalled()
  })

  it('ignores ?cloudsave=1: only the server turns cloud save on', async () => {
    window.history.replaceState({}, '', '/rating?cloudsave=1')
    window.localStorage.setItem(ACTIVE_SAVE_STORAGE_KEY, JSON.stringify({ 'user-1': 'dsav_main' }))
    const deps = dependencies('user-1', { fetchFeatures: vi.fn(async () => FEATURES_OFF) })

    const { result } = renderActiveSave(deps)
    await settle()
    window.history.replaceState({}, '', '/')

    expect(result.current.repository.kind).toBe('local')
    expect(deps.openCloudRepository).not.toHaveBeenCalled()
  })

  it('decides once the session and the features have answered, with no cloud save surfaces while local', async () => {
    let resolveFeatures: (features: UserFeatures | null) => void = () => {}
    const deps = dependencies('user-1', {
      fetchFeatures: vi.fn(
        () =>
          new Promise<UserFeatures | null>((resolve) => {
            resolveFeatures = resolve
          }),
      ),
    })

    const { result } = renderActiveSave(deps)
    await settle()
    expect(result.current.activeSave.decided).toBe(false)
    resolveFeatures(null)
    await waitFor(() => expect(result.current.activeSave.decided).toBe(true))
    expect(result.current.activeSave.kind).toBe('local')
    expect(result.current.cloudSaveUi).toBeNull()

    const anonymous = renderActiveSave(dependencies(null))
    await waitFor(() => expect(anonymous.result.current.activeSave.decided).toBe(true))
    expect(anonymous.result.current.cloudSaveUi).toBeNull()
  })

  it('decides on the local save when /me/features never answers, so the work that waits for it still runs', async () => {
    writeActiveSaveId(window.localStorage, 'user-1', 'dsav_main')
    const deps = dependencies('user-1', {
      fetchFeatures: vi.fn(() => new Promise<UserFeatures | null>(() => {})),
      decisionTimeoutMs: 30,
    })

    const { result } = renderActiveSave(deps)
    await waitFor(() => expect(result.current.activeSave.decided).toBe(true))

    expect(result.current.activeSave.kind).toBe('local')
    expect(deps.listSaves).not.toHaveBeenCalled()
    expect(deps.openCloudRepository).not.toHaveBeenCalled()
  })

  it('decides on the local save when the save list never answers', async () => {
    writeActiveSaveId(window.localStorage, 'user-1', 'dsav_main')
    const deps = dependencies('user-1', {
      fetchFeatures: vi.fn(async () => FEATURES_ON),
      listSaves: vi.fn(() => new Promise<SaveDTO[]>(() => {})),
      decisionTimeoutMs: 30,
    })

    const { result } = renderActiveSave(deps)
    await waitFor(() => expect(result.current.activeSave.decided).toBe(true))

    expect(result.current.activeSave.kind).toBe('local')
    expect(deps.openCloudRepository).not.toHaveBeenCalled()
  })

  it('opens the cloud save with the serverImports flag and exposes it to the cloud save surfaces', async () => {
    writeActiveSaveId(window.localStorage, 'user-1', 'dsav_main')
    const deps = dependencies('user-1', {
      fetchFeatures: vi.fn(async () => ({ ...FEATURES_ON, serverImports: false })),
      listSaves: vi.fn(async () => [save('dsav_main'), save('dsav_second')]),
    })

    const { result } = renderActiveSave(deps)

    await waitFor(() => expect(result.current.activeSave).toMatchObject({ kind: 'cloud', decided: true }))
    expect(deps.openCloudRepository).toHaveBeenCalledWith(expect.objectContaining({ serverImports: false }))
    expect(result.current.cloudSaveUi?.controller.saveId).toBe('dsav_main')
    expect((await result.current.cloudSaveUi!.listSaves()).map((listed) => listed.id)).toEqual([
      'dsav_main',
      'dsav_second',
    ])

    // The save selector switches the active save
    result.current.cloudSaveUi!.setActiveSaveId('dsav_second')
    await waitFor(() => expect(result.current.cloudSaveUi?.controller.saveId).toBe('dsav_second'))
    expect(readActiveSaveId(window.localStorage, 'user-1')).toBe('dsav_second')
  })

  it('stays local while cloud save is on but no save is active yet', async () => {
    const deps = dependencies('user-1', { fetchFeatures: vi.fn(async () => FEATURES_ON) })

    const { result } = renderActiveSave(deps)
    await settle()

    expect(result.current.repository.kind).toBe('local')
    expect(deps.listSaves).not.toHaveBeenCalled()
  })

  it('swaps in the cloud repository for the active save of the user', async () => {
    server.put('dsht_e5nsvt8k2a', 1005000)
    window.localStorage.setItem('rating-calculator-entries', JSON.stringify([{ sheetId: 'local', achievementRate: 9 }]))
    writeActiveSaveId(window.localStorage, 'user-1', 'dsav_main')
    // Another user's active save on this browser is not this user's
    writeActiveSaveId(window.localStorage, 'user-2', 'dsav_other')
    const deps = dependencies('user-1', {
      fetchFeatures: vi.fn(async () => FEATURES_ON),
      listSaves: vi.fn(async () => [save('dsav_main')]),
    })

    const { result } = renderActiveSave(deps)

    await waitFor(() => expect(result.current.repository.kind).toBe('cloud'))
    expect(deps.openCloudRepository).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', saveId: 'dsav_main' }),
    )
    expect(result.current.activeSave).toMatchObject({ kind: 'cloud', saveId: 'dsav_main' })
    await waitFor(() =>
      expect(result.current.repository.entries()).toEqual([
        expect.objectContaining({ sheetId: 'dsht_e5nsvt8k2a', achievementRate: 100.5 }),
      ]),
    )
    // The local save is left as it was
    expect(JSON.parse(window.localStorage.getItem('rating-calculator-entries')!)).toEqual([
      { sheetId: 'local', achievementRate: 9 },
    ])

    result.current.activeSave.setActiveSaveId(null)
    await waitFor(() => expect(result.current.repository.kind).toBe('local'))
    expect(readActiveSaveId(window.localStorage, 'user-2')).toBe('dsav_other')
  })

  it('falls back to the local save with a toast when the active save is gone', async () => {
    writeActiveSaveId(window.localStorage, 'user-1', 'dsav_gone')
    const deps = dependencies('user-1', {
      fetchFeatures: vi.fn(async () => FEATURES_ON),
      listSaves: vi.fn(async () => [save('dsav_main')]),
    })

    const { result } = renderActiveSave(deps)
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1))

    expect(result.current.repository.kind).toBe('local')
    expect(deps.openCloudRepository).not.toHaveBeenCalled()
    expect(readActiveSaveId(window.localStorage, 'user-1')).toBeNull()
  })

  it('returns to the local save on sign-out', async () => {
    writeActiveSaveId(window.localStorage, 'user-1', 'dsav_main')
    let userId: string | null = 'user-1'
    const deps = dependencies('user-1', {
      useSessionUserId: () => userId,
      fetchFeatures: vi.fn(async () => FEATURES_ON),
      listSaves: vi.fn(async () => [save('dsav_main')]),
    })

    const { result, rerender } = renderActiveSave(deps)
    await waitFor(() => expect(result.current.repository.kind).toBe('cloud'))

    userId = null
    rerender()
    await waitFor(() => expect(result.current.repository.kind).toBe('local'))
    // The active save stays chosen for the next sign-in
    expect(readActiveSaveId(window.localStorage, 'user-1')).toBe('dsav_main')
  })

  it("drops the previous user's cloud save at once when another user signs in without a sign-out", async () => {
    server.put('dsht_e5nsvt8k2a', 1005000)
    writeActiveSaveId(window.localStorage, 'user-1', 'dsav_main')
    writeActiveSaveId(window.localStorage, 'user-2', 'dsav_two')
    let userId = 'user-1'
    let releaseSaves: (() => void) | null = null
    const deps = dependencies('user-1', {
      useSessionUserId: () => userId,
      fetchFeatures: vi.fn(async () => FEATURES_ON),
      listSaves: vi.fn(async () => {
        // User B's save list is slow: user A's save must not be shown meanwhile
        if (userId === 'user-2') await new Promise<void>((resolve) => (releaseSaves = resolve))
        return [save('dsav_main'), save('dsav_two')]
      }),
    })

    const { result, rerender } = renderActiveSave(deps)
    await waitFor(() => expect(result.current.repository.kind).toBe('cloud'))
    const userOneRepository = result.current.activeSave.cloudRepository!
    await waitFor(() => expect(userOneRepository.entries()).toHaveLength(1))
    // User A has a change the server has not taken yet
    server.failures.push(new TypeError('Failed to fetch'))
    userOneRepository.setManual({ sheetId: 'dsht_e5nsvt8k2a', achievementRate: 99 }, 'typed')
    await userOneRepository.sync()
    expect(userOneRepository.status.pendingCount).toBe(1)
    const userOneMutationId = server.mutateCalls[0]![0]!.mutationId
    server.failures.length = 0

    userId = 'user-2'
    rerender()

    await waitFor(() => expect(result.current.repository.kind).toBe('local'))
    expect(result.current.activeSave.cloudRepository).toBeNull()
    // Disposed without a flush: the session is user B's now, so user A's change is not sent with it
    await settle()
    expect(server.mutateCalls).toHaveLength(1)

    await waitFor(() => expect(releaseSaves).not.toBeNull())
    releaseSaves!()
    await waitFor(() => expect(result.current.activeSave.saveId).toBe('dsav_two'))
    expect(result.current.activeSave.cloudRepository!.userId).toBe('user-2')
    expect(server.mutateCalls.flat().filter((mutation) => mutation.mutationId === userOneMutationId)).toHaveLength(1)

    // User A's change waits in their outbox for their next sign-in
    const userOneAgain = await CloudScoreRepository.open({
      userId: 'user-1',
      saveId: 'dsav_main',
      api: server.api,
      indexedDB: factory,
      locks: null,
      createChannel: null,
      eventTarget: null,
    })
    repositories.push(userOneAgain)
    expect(userOneAgain.status.pendingCount).toBe(1)
  })

  it.each([
    ['not-found', { status: 404, code: 'NOT_FOUND' }],
    ['unauthorized', { status: 401, code: 'UNAUTHORIZED' }],
  ] as const)('falls back to the local save when syncing stops mid-session (%s)', async (reason, error) => {
    window.localStorage.setItem('rating-calculator-entries', JSON.stringify([{ sheetId: 'local', achievementRate: 9 }]))
    writeActiveSaveId(window.localStorage, 'user-1', 'dsav_main')
    const deps = dependencies('user-1', {
      fetchFeatures: vi.fn(async () => FEATURES_ON),
      listSaves: vi.fn(async () => [save('dsav_main')]),
    })

    const { result } = renderActiveSave(deps)
    await waitFor(() => expect(result.current.repository.kind).toBe('cloud'))
    const repository = result.current.activeSave.cloudRepository!
    await repository.idle()

    // The save is deleted, cloud save is turned off, or the session expires
    server.failures.push(error)
    void repository.sync()

    await waitFor(() => expect(result.current.repository.kind).toBe('local'))
    expect(repository.stoppedReason).toBe(reason)
    expect(result.current.repository.entries()).toEqual([expect.objectContaining({ sheetId: 'local' })])
    if (reason === 'not-found') {
      expect(toast).toHaveBeenCalledWith(expect.any(String), { id: 'cloud-save-missing' })
      expect(readActiveSaveId(window.localStorage, 'user-1')).toBeNull()
      // The features are asked again: the switch may have been turned off
      expect(window.sessionStorage.getItem('dxr-features:user-1')).toBeNull()
    } else {
      expect(toast).not.toHaveBeenCalled()
      expect(readActiveSaveId(window.localStorage, 'user-1')).toBe('dsav_main')
    }
  })
})