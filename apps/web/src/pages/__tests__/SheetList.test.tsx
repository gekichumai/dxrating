import type { ServerEnum } from '@gekichumai/dxdata'
import { DifficultyEnum, TypeEnum, VersionEnum } from '@gekichumai/dxdata'
import { fireEvent, render, screen, type RenderResult } from '@testing-library/react'
import { act } from 'react'
import type { ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import type { FlattenedSheet } from '@/songs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'
import { SheetList } from '../SheetList'

const routeState = vi.hoisted(() => {
  const state: {
    search: Record<string, unknown>
    pendingSearch?: Record<string, unknown>
    syncSearchOnNavigate: boolean
    onNavigate?: () => void
    navigate: ReturnType<typeof vi.fn>
    /** Finishes the navigations still loading: the route reports the newest one's search */
    finishNavigations: () => void
    settleNavigations: (() => void)[]
  } = {
    search: {},
    syncSearchOnNavigate: true,
    settleNavigations: [],
    finishNavigations: () => {
      state.search = state.pendingSearch ?? state.search
      for (const settle of state.settleNavigations.splice(0)) settle()
    },
    navigate: vi.fn((options: { search?: Record<string, unknown> | ((prev: Record<string, unknown>) => unknown) }) => {
      let nextSearch = state.search
      if (typeof options.search === 'function') {
        nextSearch = options.search(state.search) as Record<string, unknown>
      } else if (options.search) {
        nextSearch = options.search
      }

      state.onNavigate?.()
      if (state.syncSearchOnNavigate) {
        state.search = nextSearch
        return Promise.resolve()
      }
      state.pendingSearch = nextSearch
      return new Promise<void>((resolve) => state.settleNavigations.push(resolve))
    }),
  }

  return state
})

const sheetMocks = vi.hoisted(() => ({
  filteredTerms: [] as string[],
  results: [] as FlattenedSheet[],
  isLoading: false,
  searchElapsed: 0,
}))

vi.mock('@tanstack/react-router', () => ({
  // InternalLink: no router in these tests, so links render as plain anchors
  useRouter: () => undefined,
  getRouteApi: () => ({
    useSearch: () => routeState.search,
  }),
  useNavigate: () => routeState.navigate,
}))

vi.mock('@sentry/tanstackstart-react', () => ({
  metrics: {
    distribution: vi.fn(),
  },
}))

vi.mock('posthog-js/react', () => ({
  usePostHog: () => null,
}))

vi.mock('@/models/context/useAppContext', () => ({
  useAppContextDXDataVersion: () => VersionEnum.CiRCLEPLUS,
}))

vi.mock('@/songs', () => ({
  canonicalIdFromParts: (...parts: string[]) => parts.join(':'),
  useFilteredSheets: (term: string) => {
    sheetMocks.filteredTerms.push(term)
    return { results: sheetMocks.results, elapsed: sheetMocks.searchElapsed }
  },
  useSheets: () => ({ data: [], isLoading: sheetMocks.isLoading }),
}))

vi.mock('@/components/global/ResponsiveDialog', () => ({
  ResponsiveDialog: ({ children }: { children: () => ReactNode }) => <>{children()}</>,
}))

vi.mock('@/components/sheet/SheetDialogContent', () => ({
  SheetDialogContent: () => null,
}))

vi.mock('@/components/sheet/SheetListContainer', () => ({
  SheetListContainer: ({ sheets }: { sheets: FlattenedSheet[] }) => (
    <div data-testid="sheet-list">{sheets.map((sheet) => sheet.id).join(',')}</div>
  ),
}))

vi.mock('@/components/sheet/SheetGridContainer', () => ({
  SheetGridContainer: ({ sheets }: { sheets: FlattenedSheet[] }) => (
    <div data-testid="sheet-grid">{sheets.map((sheet) => sheet.id).join(',')}</div>
  ),
  SheetGridSkeleton: () => <div data-testid="sheet-grid-skeleton" />,
}))

vi.mock('@/components/sheet/SheetSortFilter', async (importOriginal) => ({
  getDefaultSheetSortFilterForm: (await importOriginal<typeof import('@/components/sheet/SheetSortFilter')>())
    .getDefaultSheetSortFilterForm,
  countActiveSortFilters: () => 0,
  SheetSortFilter: () => <div data-testid="sheet-sort-filter" />,
  SheetSortFilterTrigger: () => <button type="button">Filter Sort</button>,
}))

/** Below lg (phones, tablets) or from lg, which decides the default layout (happy-dom's own window is 1024px wide) */
const stubViewport = (wide: boolean) => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: wide,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
}

const Providers = ({ children }: { children: ReactNode }) => (
  <LocaleProvider initialLocale="en">{children}</LocaleProvider>
)

const renderPage = () =>
  renderToString(
    <Providers>
      <SheetList />
    </Providers>,
  )

describe('SheetList', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    stubViewport(false)
    window.localStorage.clear()
    routeState.search = {}
    routeState.pendingSearch = undefined
    routeState.settleNavigations = []
    routeState.syncSearchOnNavigate = true
    routeState.onNavigate = undefined
    routeState.navigate.mockClear()
    sheetMocks.filteredTerms = []
    sheetMocks.results = []
    sheetMocks.isLoading = false
    sheetMocks.searchElapsed = 0
  })

  it('applies default sorting before the first server or client paint', async () => {
    const { getFlattenedSheets } = await vi.importActual<typeof import('@/songs')>('@/songs')
    const { catalogSnapshot } = await import('@gekichumai/dxdata/snapshot')
    const { getSongCatalog } = await import('@gekichumai/maimai-domain')
    const sheet = getFlattenedSheets(getSongCatalog(catalogSnapshot, VersionEnum.CiRCLEPLUS))[0]!
    sheetMocks.results = [
      { ...sheet, id: 'older', songId: 'older', releaseDateTimestamp: 1 },
      { ...sheet, id: 'newer', songId: 'newer', releaseDateTimestamp: 2 },
    ]
    expect(renderPage()).toContain('newer,older')
    render(<SheetList />, { wrapper: Providers })
    expect(screen.getByTestId('sheet-list').textContent).toBe('newer,older')
  })

  it('introduces the page in the server render when there is no query, and drops it for a query', () => {
    const intro = m.root_pages_search_introduction({}, { locale: 'en' })
    expect(intro).toMatch(/maimai DX/)
    expect(renderPage()).toContain(intro)

    routeState.search = { q: 'test' }
    expect(renderPage()).not.toContain(intro)
  })

  it('uses the route query immediately and shows seeded results while sheets load', () => {
    routeState.search = { q: '螺旋' }
    sheetMocks.isLoading = true

    render(
      <SheetList
        seedSheets={[
          {
            songId: 'galatea',
            title: 'ガラテアの螺旋',
            artist: 'sasakure.UK',
            imageName: 'galatea',
            type: TypeEnum.STD,
            difficulty: DifficultyEnum.Master,
            level: '14+',
            internalLevelValue: 14.6,
            version: VersionEnum.CiRCLEPLUS,
            serverIds: ['jp', 'intl', 'usa', 'cn'] as ServerEnum[],
            isLocked: false,
            isTypeUtage: false,
            path: '/songs/galatea/std/master',
          },
        ]}
      />,
      { wrapper: Providers },
    )

    expect(sheetMocks.filteredTerms).toContain('螺旋')
    expect(screen.getByRole('link', { name: /ガラテアの螺旋/ }).getAttribute('href')).toBe('/songs/galatea/std/master')
    expect(screen.queryByTestId('sheet-list')).toBeNull()
  })

  it('writes the query to the URL once typing pauses, not on every keystroke', () => {
    vi.useFakeTimers()
    try {
      routeState.search = {}
      render(<SheetList />, { wrapper: Providers })
      const input = screen.getByRole('textbox', { name: 'Search' }) as HTMLInputElement
      for (const value of ['s', 'sy', 'sys']) fireEvent.change(input, { target: { value } })

      expect(input.value).toBe('sys')
      expect(routeState.navigate).not.toHaveBeenCalled()

      act(() => {
        vi.advanceTimersByTime(500)
      })
      expect(routeState.navigate).toHaveBeenCalledTimes(1)
      expect(routeState.search).toMatchObject({ q: 'sys' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('follows a query that changes from outside, such as Back', () => {
    routeState.search = { q: 'first' }
    const view = render(<SheetList />, { wrapper: Providers })
    const input = screen.getByRole('textbox', { name: 'Search' }) as HTMLInputElement
    expect(input.value).toBe('first')

    routeState.search = { q: 'second' }
    view.rerender(<SheetList />)
    expect(input.value).toBe('second')
  })

  it('lets Back or a link replace a draft whose URL write is still waiting', () => {
    vi.useFakeTimers()
    try {
      routeState.search = { q: 'first' }
      const view = render(<SheetList />, { wrapper: Providers })
      const input = screen.getByRole('textbox', { name: 'Search' }) as HTMLInputElement
      fireEvent.change(input, { target: { value: 'typing' } })

      routeState.search = { q: 'back-target' }
      view.rerender(<SheetList />)
      expect(input.value).toBe('back-target')

      act(() => {
        vi.advanceTimersByTime(500)
      })
      expect(routeState.navigate).not.toHaveBeenCalled()
      expect(routeState.search).toMatchObject({ q: 'back-target' })
      expect(input.value).toBe('back-target')
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps newer typing when an older URL write arrives late', () => {
    vi.useFakeTimers()
    try {
      routeState.search = {}
      routeState.syncSearchOnNavigate = false
      const view = render(<SheetList />, { wrapper: Providers })
      const input = screen.getByRole('textbox', { name: 'Search' }) as HTMLInputElement

      fireEvent.change(input, { target: { value: 'a' } })
      act(() => {
        vi.advanceTimersByTime(500)
      })
      expect(routeState.navigate).toHaveBeenCalledTimes(1)

      // Typing resumes before the 'a' navigation has finished
      fireEvent.change(input, { target: { value: 'ab' } })
      routeState.finishNavigations()
      view.rerender(<SheetList />)
      expect(input.value).toBe('ab')

      act(() => {
        vi.advanceTimersByTime(500)
      })
      expect(routeState.pendingSearch).toMatchObject({ q: 'ab' })
      expect(input.value).toBe('ab')
    } finally {
      vi.useRealTimers()
      routeState.syncSearchOnNavigate = true
    }
  })

  it('writes a return to the reported query while an older URL write is still loading', () => {
    vi.useFakeTimers()
    try {
      routeState.search = {}
      routeState.syncSearchOnNavigate = false
      const view = render(<SheetList />, { wrapper: Providers })
      const input = screen.getByRole('textbox', { name: 'Search' }) as HTMLInputElement

      fireEvent.change(input, { target: { value: 'a' } })
      act(() => {
        vi.advanceTimersByTime(500)
      })
      // Cleared before the 'a' navigation has finished: the route still reports no query
      fireEvent.change(input, { target: { value: '' } })
      act(() => {
        vi.advanceTimersByTime(500)
      })
      routeState.finishNavigations()
      view.rerender(<SheetList />)
      act(() => {
        vi.advanceTimersByTime(500)
      })

      expect(routeState.navigate).toHaveBeenCalledTimes(2)
      expect(routeState.search.q).toBeUndefined()
      expect(input.value).toBe('')
    } finally {
      vi.useRealTimers()
      routeState.syncSearchOnNavigate = true
    }
  })

  it('follows Back after typing returned to the reported query while a write was loading', async () => {
    vi.useFakeTimers()
    try {
      routeState.search = {}
      routeState.syncSearchOnNavigate = false
      const view = render(<SheetList />, { wrapper: Providers })
      const input = screen.getByRole('textbox', { name: 'Search' }) as HTMLInputElement

      fireEvent.change(input, { target: { value: 'a' } })
      act(() => {
        vi.advanceTimersByTime(500)
      })
      fireEvent.change(input, { target: { value: '' } })
      act(() => {
        vi.advanceTimersByTime(500)
      })
      // Both writes settle; the route ends where it started, so it never reports either of them
      routeState.finishNavigations()
      view.rerender(<SheetList />)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500)
      })

      routeState.search = { q: 'a' }
      view.rerender(<SheetList />)
      expect(input.value).toBe('a')
      expect(sheetMocks.filteredTerms.at(-1)).toBe('a')
    } finally {
      vi.useRealTimers()
      routeState.syncSearchOnNavigate = true
    }
  })

  it('follows Back to a query this list wrote before', async () => {
    vi.useFakeTimers()
    try {
      routeState.search = {}
      const view = render(<SheetList />, { wrapper: Providers })
      const input = screen.getByRole('textbox', { name: 'Search' }) as HTMLInputElement
      for (const value of ['a', 'ab']) {
        fireEvent.change(input, { target: { value } })
        await act(async () => {
          await vi.advanceTimersByTimeAsync(500)
        })
        view.rerender(<SheetList />)
      }
      expect(routeState.search).toMatchObject({ q: 'ab' })

      fireEvent.change(input, { target: { value: 'abc' } })
      routeState.search = { q: 'a' }
      view.rerender(<SheetList />)
      expect(input.value).toBe('a')
      expect(sheetMocks.filteredTerms.at(-1)).toBe('a')

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500)
      })
      expect(routeState.search).toMatchObject({ q: 'a' })
      expect(input.value).toBe('a')
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps an in-progress search edit when the route query update is pending', () => {
    routeState.search = { q: 'abcdef' }
    routeState.syncSearchOnNavigate = false
    let view: RenderResult
    routeState.onNavigate = () => {
      view.rerender(<SheetList />)
    }

    view = render(<SheetList />, { wrapper: Providers })

    const input = screen.getByRole('textbox', { name: 'Search' }) as HTMLInputElement
    input.focus()
    input.setSelectionRange(4, 4)

    fireEvent.change(input, {
      target: { value: 'abcd1ef', selectionStart: 5, selectionEnd: 5 },
    })

    expect(input.value).toBe('abcd1ef')
    expect(input.selectionStart).toBe(5)
    expect(input.selectionEnd).toBe(5)

    routeState.finishNavigations()
    view.rerender(<SheetList />)

    expect(input.value).toBe('abcd1ef')
    expect(input.selectionStart).toBe(5)
    expect(input.selectionEnd).toBe(5)
  })

  describe('list and grid layouts', () => {
    const seedResults = async () => {
      const { getFlattenedSheets } = await vi.importActual<typeof import('@/songs')>('@/songs')
      const { catalogSnapshot } = await import('@gekichumai/dxdata/snapshot')
      const { getSongCatalog } = await import('@gekichumai/maimai-domain')
      const sheet = getFlattenedSheets(getSongCatalog(catalogSnapshot, VersionEnum.CiRCLEPLUS))[0]!
      sheetMocks.results = [{ ...sheet, id: 'only', songId: 'only' }]
    }

    it('server-renders both layouts, each shown by CSS at the widths it is the default for', async () => {
      await seedResults()
      const html = renderPage()

      expect(html).toMatch(/<div class="w-full lg:hidden"><div data-testid="sheet-list">only<\/div>/)
      expect(html).toMatch(/<div class="w-full hidden lg:block"><div data-testid="sheet-grid">only<\/div>/)
      // Neither segment claims to be pressed until the page knows the layout
      expect(html).not.toContain('aria-pressed')
    })

    it('lists results below lg and shows the grid from lg until the visitor picks one', async () => {
      await seedResults()
      stubViewport(false)
      const phone = render(<SheetList />, { wrapper: Providers })
      expect(screen.getByTestId('sheet-list')).toBeTruthy()
      expect(screen.queryByTestId('sheet-grid')).toBeNull()
      expect(screen.getByRole('button', { name: 'List' }).getAttribute('aria-pressed')).toBe('true')
      phone.unmount()

      stubViewport(true)
      render(<SheetList />, { wrapper: Providers })
      expect(screen.getByTestId('sheet-grid')).toBeTruthy()
      expect(screen.queryByTestId('sheet-list')).toBeNull()
      expect(screen.getByRole('button', { name: 'Grid' }).getAttribute('aria-pressed')).toBe('true')
    })

    it('switches layout and remembers the choice over the default for the width', async () => {
      await seedResults()
      stubViewport(false)
      const view = render(<SheetList />, { wrapper: Providers })

      fireEvent.click(screen.getByRole('button', { name: 'Grid' }))

      expect(screen.getByTestId('sheet-grid')).toBeTruthy()
      expect(screen.queryByTestId('sheet-list')).toBeNull()
      expect(window.localStorage.getItem('sheet-list-layout')).toBe('grid')

      view.unmount()
      render(<SheetList />, { wrapper: Providers })
      expect(screen.getByTestId('sheet-grid')).toBeTruthy()
    })
  })
})