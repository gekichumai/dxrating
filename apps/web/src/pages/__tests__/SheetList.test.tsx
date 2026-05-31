import { DifficultyEnum, TypeEnum, VersionEnum } from '@gekichumai/dxdata'
import { fireEvent, render, screen, type RenderResult } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initI18n } from '@/setup/init-i18n'
import { SheetList } from '../SheetList'

const routeState = vi.hoisted(() => {
  const state: {
    search: Record<string, unknown>
    pendingSearch?: Record<string, unknown>
    syncSearchOnNavigate: boolean
    onNavigate?: () => void
    navigate: ReturnType<typeof vi.fn>
  } = {
    search: {},
    syncSearchOnNavigate: true,
    navigate: vi.fn((options: { search?: Record<string, unknown> | ((prev: Record<string, unknown>) => unknown) }) => {
      let nextSearch = state.search
      if (typeof options.search === 'function') {
        nextSearch = options.search(state.search) as Record<string, unknown>
      } else if (options.search) {
        nextSearch = options.search
      }

      if (state.syncSearchOnNavigate) {
        state.search = nextSearch
      } else {
        state.pendingSearch = nextSearch
      }
      state.onNavigate?.()
    }),
  }

  return state
})

const sheetMocks = vi.hoisted(() => ({
  filteredTerms: [] as string[],
  isLoading: false,
  searchElapsed: 0,
}))

vi.mock('@tanstack/react-router', () => ({
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
    return { results: [], elapsed: sheetMocks.searchElapsed }
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
  SheetListContainer: () => <div data-testid="sheet-list" />,
}))

vi.mock('@/components/sheet/SheetSortFilter', () => ({
  SheetSortFilter: () => <div data-testid="sheet-sort-filter" />,
  SheetSortFilterTrigger: () => <button type="button">Filter Sort</button>,
}))

describe('SheetList', () => {
  beforeAll(() => {
    initI18n()
  })

  beforeEach(() => {
    routeState.search = {}
    routeState.pendingSearch = undefined
    routeState.syncSearchOnNavigate = true
    routeState.onNavigate = undefined
    routeState.navigate.mockClear()
    sheetMocks.filteredTerms = []
    sheetMocks.isLoading = false
    sheetMocks.searchElapsed = 0
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
            type: TypeEnum.STD,
            difficulty: DifficultyEnum.Master,
            level: '14+',
            internalLevelValue: 14.6,
            path: '/songs/galatea/std/master',
          },
        ]}
      />,
    )

    expect(sheetMocks.filteredTerms).toContain('螺旋')
    expect(screen.getByRole('link', { name: /ガラテアの螺旋/ }).getAttribute('href')).toBe('/songs/galatea/std/master')
    expect(screen.queryByTestId('sheet-list')).toBeNull()
  })

  it('keeps an in-progress search edit when the route query update is pending', () => {
    routeState.search = { q: 'abcdef' }
    routeState.syncSearchOnNavigate = false
    let view: RenderResult
    routeState.onNavigate = () => {
      view.rerender(<SheetList />)
    }

    view = render(<SheetList />)

    const input = screen.getByRole('textbox', { name: 'Search' }) as HTMLInputElement
    input.focus()
    input.setSelectionRange(4, 4)

    fireEvent.change(input, {
      target: { value: 'abcd1ef', selectionStart: 5, selectionEnd: 5 },
    })

    expect(input.value).toBe('abcd1ef')
    expect(input.selectionStart).toBe(5)
    expect(input.selectionEnd).toBe(5)

    routeState.search = routeState.pendingSearch ?? routeState.search
    view.rerender(<SheetList />)

    expect(input.value).toBe('abcd1ef')
    expect(input.selectionStart).toBe(5)
    expect(input.selectionEnd).toBe(5)
  })
})