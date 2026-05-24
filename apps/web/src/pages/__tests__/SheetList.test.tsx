import { VersionEnum } from '@gekichumai/dxdata'
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
  useFilteredSheets: () => ({ results: [], elapsed: 0 }),
  useSheets: () => ({ data: [], isLoading: false }),
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