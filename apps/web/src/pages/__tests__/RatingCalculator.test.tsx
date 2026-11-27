import { catalogSnapshot } from '@gekichumai/dxdata/snapshot'
import { toV2Community } from '@gekichumai/dxdata/v2'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogSliceProvider } from '@/catalog/CatalogContext'
import { setLoadedCatalogDocumentForTests } from '@/catalog/clientCatalog'
import { resetCommunityListsForTests } from '@/catalog/communityOverlay'
import type { PlayEntry } from '@/components/rating/RatingCalculatorAddEntryForm'
import { NetImportSettingsProvider } from '@/components/rating/io/import/NetImportSettingsContext'
import { ACTIVE_SAVE_STORAGE_KEY, type ActiveSave, ActiveSaveContext } from '@/models/scores/ActiveSaveContext'
import { LocalScoreRepository } from '@/models/scores/LocalScoreRepository'
import { ScoreRepositoryContext } from '@/models/scores/useScoreRepository'
import { RatingCalculator } from '../RatingCalculator'

const ONBOARDING = { name: 'Calculate your DX rating' }
const sheetId = catalogSnapshot.songs[0]!.sheets[0]!.id

/** The calculator over `entries` before the complete catalog has loaded; `activeSave` overrides the decided local save */
async function renderBeforeCatalog(entries: readonly PlayEntry[], activeSave?: Partial<ActiveSave>) {
  setLoadedCatalogDocumentForTests(null)
  const repository = LocalScoreRepository.inMemory(entries)
  const rootRoute = createRootRoute({
    component: () => (
      <ScoreRepositoryContext.Provider value={repository}>
        <NetImportSettingsProvider>
          <RatingCalculator />
        </NetImportSettingsProvider>
      </ScoreRepositoryContext.Provider>
    ),
  })
  const router = createRouter({ routeTree: rootRoute, history: createMemoryHistory({ initialEntries: ['/rating'] }) })
  render(
    // The anonymous visitor's local save, decided (the context default), unless the test says otherwise
    <ActiveSaveContext.Consumer>
      {(base) => (
        <ActiveSaveContext.Provider value={{ ...base, ...activeSave }}>
          <QueryClientProvider client={new QueryClient()}>
            <CatalogSliceProvider slice={null}>
              <RouterProvider router={router} />
            </CatalogSliceProvider>
          </QueryClientProvider>
        </ActiveSaveContext.Provider>
      )}
    </ActiveSaveContext.Consumer>,
  )
  await act(async () => {
    await router.load()
  })
}

const loadCatalog = () =>
  act(async () => {
    setLoadedCatalogDocumentForTests(catalogSnapshot)
  })

describe('RatingCalculator before the complete catalog has loaded', () => {
  beforeEach(() => {
    // The community overlay (tags and aliases) the sheets are read with: none
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(toV2Community({ tagGroups: [], tags: [], tagSongs: [] }, []))),
    )
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    resetCommunityListsForTests()
    setLoadedCatalogDocumentForTests(catalogSnapshot)
    window.localStorage.clear()
  })

  it('shows a new visitor the onboarding at once, and keeps it in place when the catalog arrives', async () => {
    await renderBeforeCatalog([])

    const heading = screen.getByRole('heading', ONBOARDING)
    // The add form holds its place, with nothing to pick from yet
    expect(screen.getByRole('combobox').hasAttribute('disabled')).toBe(true)

    await loadCatalog()
    // The same element, not a new one: the page's largest text is painted once (LCP)
    expect(screen.getByRole('heading', ONBOARDING)).toBe(heading)
    expect(screen.getByRole('combobox').hasAttribute('disabled')).toBe(false)
  })

  it('never shows the onboarding to a visitor with saved records', async () => {
    await renderBeforeCatalog([{ sheetId, achievementRate: 100.5 }])
    expect(screen.queryByRole('heading', ONBOARDING)).toBeNull()

    await loadCatalog()
    expect(screen.queryByRole('heading', ONBOARDING)).toBeNull()
    expect(screen.getByRole('heading', { name: 'Your records (1)' })).toBeTruthy()
  })

  it('waits for the catalog while a cloud save chosen in this browser may still replace the empty local save', async () => {
    window.localStorage.setItem(ACTIVE_SAVE_STORAGE_KEY, JSON.stringify({ user: 'save' }))
    await renderBeforeCatalog([], { decided: false })
    expect(screen.queryByRole('heading', ONBOARDING)).toBeNull()

    await loadCatalog()
    expect(screen.getByRole('heading', ONBOARDING)).toBeTruthy()
  })
})