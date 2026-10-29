import { catalogSnapshot } from '@gekichumai/dxdata/snapshot'
import { act } from '@testing-library/react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { buildCatalogSlice, toCatalogMeta } from '../catalogSource'
import {
  CatalogSliceProvider,
  useCatalogDocument,
  useCompleteSongCatalog,
  useIsCatalogComplete,
} from '../CatalogContext'
import { setLoadedCatalogDocumentForTests } from '../clientCatalog'

vi.mock('@/models/context/useAppContext', () => ({
  useAppContextDXDataVersion: () => 'MAGiCAL',
}))

// 君の知らない物語, as the song page's loader puts it in the page
const song = catalogSnapshot.songs.find((candidate) => candidate.id === 'dsng_kkx38yfx4t')!
const slice = buildCatalogSlice(toCatalogMeta(catalogSnapshot), [song])

function CatalogSummary() {
  const document = useCatalogDocument()
  const complete = useIsCatalogComplete()
  const completeCatalog = useCompleteSongCatalog()
  return (
    <output>
      {complete ? 'complete' : 'slice'}:{document.songs.length}:{document.songs[0]?.title}:
      {completeCatalog ? 'catalog' : 'no catalog'}
    </output>
  )
}

const app = (
  <CatalogSliceProvider slice={slice}>
    <CatalogSummary />
  </CatalogSliceProvider>
)

describe('catalog during SSR and hydration', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  afterAll(() => {
    setLoadedCatalogDocumentForTests(catalogSnapshot)
  })

  it('renders the page slice on the server, even when the complete catalog is at hand', () => {
    setLoadedCatalogDocumentForTests(catalogSnapshot)

    expect(renderToString(app).replaceAll('<!-- -->', '')).toContain('slice:1:君の知らない物語:no catalog')
  })

  it.each([
    ['loads after hydration', false],
    ['was cached before hydration', true],
  ])('hydrates from the slice and then switches to the complete catalog that %s', async (_case, loadedEarly) => {
    setLoadedCatalogDocumentForTests(null)
    const container = document.createElement('div')
    container.innerHTML = renderToString(app)
    document.body.append(container)
    if (loadedEarly) setLoadedCatalogDocumentForTests(catalogSnapshot)

    const onRecoverableError = vi.fn()
    await act(async () => {
      hydrateRoot(container, app, { onRecoverableError })
    })
    if (!loadedEarly) {
      expect(container.textContent).toContain('slice:1:君の知らない物語:no catalog')
      await act(async () => {
        setLoadedCatalogDocumentForTests(catalogSnapshot)
      })
    }

    expect(onRecoverableError).not.toHaveBeenCalled()
    expect(container.textContent).toContain(`complete:${catalogSnapshot.songs.length}:`)
    expect(container.textContent).toContain(':catalog')
  })
})