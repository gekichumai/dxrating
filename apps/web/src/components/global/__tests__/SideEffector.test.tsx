import { render } from '@testing-library/react'
import type { SongCatalog } from '@gekichumai/maimai-domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type ActiveSave, ActiveSaveContext } from '@/models/scores/ActiveSaveContext'
import { autoNetImportKey } from '@/models/scores/cloudImports'
import type { ScoreRepository } from '@/models/scores/ScoreRepository'
import { SideEffectorAutoImportRating } from '../SideEffector'

const mocks = vi.hoisted(() => ({
  importFromNETRecords: vi.fn(),
  catalog: null as unknown,
  repository: null as unknown,
}))

vi.mock('../../rating/io/import/importFromNETRecords', () => ({
  NET_IMPORT_COOLDOWN_MS: 15 * 60 * 1000,
  NET_IMPORT_LAST_SUCCESS_KEY: 'net-import-last-success',
  importFromNETRecords: mocks.importFromNETRecords,
}))
vi.mock('@/catalog/CatalogContext', () => ({ useCompleteSongCatalog: () => mocks.catalog }))
vi.mock('../../../models/scores/useScoreRepository', () => ({ useScoreRepository: () => mocks.repository }))
vi.mock('react-hot-toast', () => ({ default: vi.fn() }))

const catalog = { id: 'catalog' } as unknown as SongCatalog
const localRepository = { kind: 'local' } as ScoreRepository
const cloudRepository = { kind: 'cloud', serverImportsEnabled: true } as ScoreRepository

const activeSave = (overrides: Partial<ActiveSave>): ActiveSave => ({
  kind: 'local',
  decided: true,
  saveId: null,
  cloudRepository: null,
  setActiveSaveId: () => {},
  flushBeforeSignOut: async () => {},
  listSaves: async () => [],
  userId: 'user-1',
  features: null,
  refreshFeatures: () => {},
  ...overrides,
})

function renderWith(save: ActiveSave) {
  return render(
    <ActiveSaveContext.Provider value={save}>
      <SideEffectorAutoImportRating />
    </ActiveSaveContext.Provider>,
  )
}

beforeEach(() => {
  mocks.importFromNETRecords.mockReset()
  mocks.catalog = catalog
  mocks.repository = localRepository
  localStorage.setItem('rating-auto-import-from-net', JSON.stringify('merge'))
})

afterEach(() => {
  localStorage.clear()
})

describe('SideEffectorAutoImportRating', () => {
  it('waits until the active save is decided', () => {
    const { rerender } = renderWith(activeSave({ decided: false }))
    expect(mocks.importFromNETRecords).not.toHaveBeenCalled()

    rerender(
      <ActiveSaveContext.Provider value={activeSave({ decided: true })}>
        <SideEffectorAutoImportRating />
      </ActiveSaveContext.Provider>,
    )
    expect(mocks.importFromNETRecords).toHaveBeenCalledTimes(1)
  })

  it('imports into the local save once, without cloud options, as before', () => {
    const { rerender } = renderWith(activeSave({}))

    expect(mocks.importFromNETRecords).toHaveBeenCalledWith(
      catalog,
      localRepository,
      'merge',
      undefined,
      undefined,
      undefined,
    )
    // Re-renders and another repository object do not import again for the same catalog
    mocks.repository = { kind: 'local' } as ScoreRepository
    rerender(
      <ActiveSaveContext.Provider value={activeSave({})}>
        <SideEffectorAutoImportRating />
      </ActiveSaveContext.Provider>,
    )
    expect(mocks.importFromNETRecords).toHaveBeenCalledTimes(1)
  })

  it('runs on a cloud save as an auto import with the save’s 15-minute key', () => {
    mocks.repository = cloudRepository
    renderWith(activeSave({ kind: 'cloud', saveId: 'dsav_one' }))

    expect(mocks.importFromNETRecords).toHaveBeenCalledWith(catalog, cloudRepository, 'merge', undefined, undefined, {
      trigger: 'auto',
      idempotencyKey: autoNetImportKey('dsav_one'),
    })
  })

  it('does nothing without the catalog, with auto import off, or within the cooldown', () => {
    mocks.catalog = null
    renderWith(activeSave({})).unmount()

    mocks.catalog = catalog
    localStorage.removeItem('rating-auto-import-from-net')
    renderWith(activeSave({})).unmount()

    localStorage.setItem('rating-auto-import-from-net', JSON.stringify('merge'))
    localStorage.setItem('net-import-last-success', String(Date.now()))
    renderWith(activeSave({})).unmount()

    expect(mocks.importFromNETRecords).not.toHaveBeenCalled()
  })
})