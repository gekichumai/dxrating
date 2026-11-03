import type { SaveDTO, UserFeatures } from '@gekichumai/api-contract'
import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import i18n from 'i18next'
import type { FC, PropsWithChildren } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { CloudMigrationPrompt } from '../../../components/cloud-save/CloudMigrationPrompt'
import { CloudSaveSection } from '../../../components/cloud-save/CloudSaveSection'
import { initI18n } from '../../../setup/init-i18n'
import { RatingCalculatorContextProvider } from '../../context/RatingCalculatorContext'
import {
  ACTIVE_SAVE_STORAGE_KEY,
  type ActiveSaveDependencies,
  ActiveSaveDependenciesContext,
  useActiveSave,
} from '../ActiveSaveContext'
import { useCloudMigrationOffer } from '../CloudMigrationContext'
import type { CloudMigrationApi } from '../cloudMigration'
import { type CloudSaveActions, CloudSaveActionsContext } from '../cloudSaveActions'
import { CloudScoreRepository } from '../CloudScoreRepository'
import { clearUserFeaturesCache } from '../userFeatures'
import { FakeCloudSaveServer } from './fakeCloudSaveServer'

const posthog = vi.hoisted(() => ({ capture: vi.fn() }))
vi.mock('posthog-js', () => ({ default: posthog }))
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  }),
}))

const FEATURES_ON: UserFeatures = {
  cloudSave: true,
  serverImports: true,
  optInAvailable: false,
}
const FEATURES_OPT_IN: UserFeatures = {
  cloudSave: false,
  serverImports: false,
  optInAvailable: true,
}
const LOCAL = [
  {
    sheetId: 'dsht_e5nsvt8k2a',
    achievementRate: 100.5,
    source: { provider: 'lxns' },
  },
]

const newSave: SaveDTO = {
  id: 'dsav_new',
  name: 'My scores',
  region: 'jp',
  gameVersion: null,
  clientProfileKey: 'web-local',
  revision: 1,
  recordCount: 1,
  createdAt: '2026-11-03T00:00:00.000Z',
  updatedAt: '2026-11-03T00:00:00.000Z',
  latestSnapshot: null,
}

let server: FakeCloudSaveServer
let factory: IDBFactory
const repositories: CloudScoreRepository[] = []

function dependencies(userId: string | null, features: UserFeatures | null, saves: () => SaveDTO[] = () => []) {
  return {
    useSessionUserId: () => userId,
    fetchFeatures: vi.fn(async () => features),
    listSaves: vi.fn(async () => saves()),
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
  } satisfies ActiveSaveDependencies
}

function migrationApi(): {
  [K in keyof CloudMigrationApi]: ReturnType<typeof vi.fn> & CloudMigrationApi[K]
} {
  return {
    listSaves: vi.fn(async () => []),
    createSave: vi.fn(async () => newSave),
    clientImport: vi.fn(async (input: { id: string }) => ({
      job: {
        id: 'dimp_1',
        saveId: input.id,
        source: 'legacy-local',
        fetchedBy: 'client',
        trigger: 'migration',
        sourceAccountId: null,
        sourceAccountKind: null,
        status: 'succeeded',
        startedAt: '2026-11-03T00:00:00.000Z',
        fetchedAt: null,
        finishedAt: null,
        rawPayloadSha256: null,
        counts: {
          fetched: 1,
          inserted: 1,
          improved: 0,
          provenanceUpgraded: 0,
          unchanged: 0,
          keptUserEdit: 0,
          skippedDeleted: 0,
          skippedUnknownSheet: 0,
          rejected: 0,
        },
        errorCode: null,
      },
      revision: 1,
    })),
    replace: vi.fn(),
    getImportJob: vi.fn(),
  } as never
}

function wrapper(deps: ActiveSaveDependencies, actions: CloudSaveActions): FC<PropsWithChildren> {
  return ({ children }) => (
    <ActiveSaveDependenciesContext.Provider value={deps}>
      <CloudSaveActionsContext.Provider value={actions}>
        <RatingCalculatorContextProvider>{children}</RatingCalculatorContextProvider>
      </CloudSaveActionsContext.Provider>
    </ActiveSaveDependenciesContext.Provider>
  )
}

function cloudActions(migration = migrationApi()): CloudSaveActions & { migration: ReturnType<typeof migrationApi> } {
  return {
    migration,
    optIn: vi.fn(async () => FEATURES_ON),
    exportData: vi.fn(async () => ({
      blob: new Blob(['{}']),
      fileName: 'x.json',
    })),
  }
}

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 20)))

beforeAll(async () => {
  initI18n()
  await i18n.changeLanguage('en')
})

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  clearUserFeaturesCache()
  server = new FakeCloudSaveServer()
  factory = new IDBFactory()
  posthog.capture.mockClear()
  window.localStorage.setItem('rating-calculator-entries', JSON.stringify(LOCAL))
})

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(repositories.splice(0).map((repository) => repository.dispose({ flushTimeoutMs: 0 })))
})

describe('the first sign-in migration offer', () => {
  it('signed out: nothing, and no request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const deps = dependencies(null, FEATURES_ON)
    const actions = cloudActions()
    const { result } = renderHook(() => ({ offer: useCloudMigrationOffer(), save: useActiveSave() }), {
      wrapper: wrapper(deps, actions),
    })
    await settle()

    expect(result.current.offer.available).toBe(false)
    expect(result.current.save.features).toBeNull()
    expect(deps.fetchFeatures).not.toHaveBeenCalled()
    expect(actions.migration.listSaves).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('cloud save off: nothing visible, and no request beyond the features', async () => {
    const deps = dependencies('user-1', null)
    const actions = cloudActions()
    const Wrapper = wrapper(deps, actions)
    const { container } = render(
      <Wrapper>
        <CloudMigrationPrompt />
        <CloudSaveSection />
      </Wrapper>,
    )
    await settle()

    expect(container.innerHTML).toBe('')
    expect(deps.fetchFeatures).toHaveBeenCalledTimes(1)
    expect(deps.listSaves).not.toHaveBeenCalled()
    expect(actions.migration.listSaves).not.toHaveBeenCalled()
    expect(actions.migration.createSave).not.toHaveBeenCalled()
    expect(posthog.capture).not.toHaveBeenCalled()
  })

  it('is not offered with an empty local save, or once a cloud save is chosen', async () => {
    window.localStorage.setItem('rating-calculator-entries', '[]')
    const empty = renderHook(() => useCloudMigrationOffer(), {
      wrapper: wrapper(dependencies('user-1', FEATURES_ON), cloudActions()),
    })
    await settle()
    expect(empty.result.current.available).toBe(false)
    empty.unmount()

    window.localStorage.setItem('rating-calculator-entries', JSON.stringify(LOCAL))
    window.localStorage.setItem(ACTIVE_SAVE_STORAGE_KEY, JSON.stringify({ 'user-1': 'dsav_new' }))
    const chosen = renderHook(() => useCloudMigrationOffer(), {
      wrapper: wrapper(
        dependencies('user-1', FEATURES_ON, () => [newSave]),
        cloudActions(),
      ),
    })
    await settle()
    expect(chosen.result.current.available).toBe(false)
  })

  it('is offered, never run on its own; once the user backs up, the new cloud save becomes active', async () => {
    const saves: SaveDTO[] = []
    const deps = dependencies('user-1', FEATURES_ON, () => saves)
    const actions = cloudActions()
    actions.migration.createSave.mockImplementation(async () => {
      saves.push(newSave)
      return newSave
    })
    const Wrapper = wrapper(deps, actions)
    render(
      <Wrapper>
        <button type="button" data-cloud-migration-focus-return="">
          Import
        </button>
        <CloudMigrationPrompt />
      </Wrapper>,
    )
    await settle()

    const prompt = await screen.findByRole('button', {
      name: 'Back up to cloud',
    })
    expect(actions.migration.listSaves).not.toHaveBeenCalled()
    expect(actions.migration.createSave).not.toHaveBeenCalled()

    fireEvent.click(prompt)
    const dialog = await screen.findByRole('dialog', {}, { timeout: 3000 })
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Back up to cloud' }))
    await screen.findByText('Backed up')

    expect(actions.migration.clientImport).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'dsav_new',
        source: 'legacy-local',
        trigger: 'migration',
      }),
    )
    await waitFor(() =>
      expect(deps.openCloudRepository).toHaveBeenCalledWith(expect.objectContaining({ saveId: 'dsav_new' })),
    )
    expect(JSON.parse(window.localStorage.getItem(ACTIVE_SAVE_STORAGE_KEY)!)).toEqual({ 'user-1': 'dsav_new' })
    // The local save stays as the signed-out save
    expect(JSON.parse(window.localStorage.getItem('rating-calculator-entries')!)).toEqual(LOCAL)
    // The offer is gone: a cloud save is chosen
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Back up to cloud' })).toBeNull())

    // The button that opened the dialog went with the offer: closing gives the focus to a control that stays
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Import' })))
  })
})

describe('the beta opt-in', () => {
  it('after opting in, forgets the cached features and decides again', async () => {
    let features = FEATURES_OPT_IN
    const deps = dependencies('user-1', null)
    deps.fetchFeatures.mockImplementation(async () => features)
    const { result } = renderHook(() => useActiveSave(), {
      wrapper: wrapper(deps, cloudActions()),
    })
    await settle()
    expect(result.current.features).toEqual(FEATURES_OPT_IN)

    features = FEATURES_ON
    act(() => result.current.refreshFeatures())
    await settle()

    expect(deps.fetchFeatures).toHaveBeenCalledTimes(2)
    expect(result.current.features).toEqual(FEATURES_ON)
    expect(window.sessionStorage.getItem('dxr-features:user-1')).toBe(JSON.stringify(FEATURES_ON))
  })
})