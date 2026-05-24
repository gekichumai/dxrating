import { render, screen, within } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initI18n } from '@/setup/init-i18n'
import { TrendingPage } from '../TrendingPage'

const mocks = vi.hoisted(() => {
  const chartSheet = {
    songId: 'song-a',
    title: 'Song A',
    artist: 'Artist A',
    type: 'dx',
    difficulty: 'master',
    level: '13+',
    internalLevelValue: 13.7,
    releaseDate: '2025-05-01',
    href: '/songs/song-a/dx/master',
  }

  return {
    chartSheet,
    results: [{ songId: 'song-a' }],
    buildTrendingChartLinks: vi.fn(() => [chartSheet]),
    queryState: {
      data: null as null | {
        dateFrom: string
        dateTo: string
        results: Array<{ songId: string }>
      },
      isError: false,
      isLoading: false,
      isRefetching: false,
      refetch: vi.fn(),
    },
  }
})

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: { initialData?: typeof mocks.queryState.data }) => ({
    ...mocks.queryState,
    data: mocks.queryState.data ?? options.initialData,
    isLoading: mocks.queryState.data || options.initialData ? false : mocks.queryState.isLoading,
  }),
}))

vi.mock('@/lib/orpc', () => ({
  orpc: {
    analytics: {
      trending: {
        queryOptions: vi.fn((options) => options),
      },
    },
  },
}))

vi.mock('@/components/chartDiscovery/trendingCharts', () => ({
  buildTrendingChartLinks: mocks.buildTrendingChartLinks,
}))

vi.mock('@/components/sheet/SheetListItem', () => ({
  SheetListItem: ({ sheet }: { sheet: typeof mocks.chartSheet }) => (
    <a data-testid="sheet-list-item" href={sheet.href}>
      {sheet.title}
    </a>
  ),
}))

describe('TrendingPage', () => {
  beforeAll(() => {
    initI18n()
  })

  beforeEach(() => {
    mocks.queryState.data = {
      dateFrom: '2026-05-01',
      dateTo: '2026-05-24',
      results: mocks.results,
    }
    mocks.queryState.isError = false
    mocks.queryState.isLoading = false
    mocks.queryState.isRefetching = false
    mocks.queryState.refetch.mockClear()
    mocks.buildTrendingChartLinks.mockClear()
  })

  it('renders trending charts through SheetListItem', () => {
    render(<TrendingPage />)

    const list = screen.getByRole('list')
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)

    const sheetListItem = screen.getByTestId('sheet-list-item')
    expect(sheetListItem.textContent).toBe('Song A')
    expect(sheetListItem.getAttribute('href')).toBe('/songs/song-a/dx/master')
  })

  it('renders crawlable chart anchors in server HTML from initial trending data', () => {
    mocks.queryState.data = null

    const html = renderToString(
      <TrendingPage
        initialTrendingData={{
          dateFrom: '2026-05-01',
          dateTo: '2026-05-24',
          results: mocks.results,
        }}
      />,
    )

    expect(html).toContain('href="/songs/song-a/dx/master"')
    expect(html).toContain('itemType="https://schema.org/CollectionPage"')
    expect(html).toContain('itemType="https://schema.org/ItemList"')
    expect(html).toContain('itemType="https://schema.org/ListItem"')
    expect(html).toContain('itemType="https://schema.org/MusicRecording"')
    expect(html).toContain('Song A')
    expect(html).not.toContain('Loading trending charts...')
  })

  it('memoizes chart mapping while the trending results reference is unchanged', () => {
    const { rerender } = render(<TrendingPage />)

    rerender(<TrendingPage />)

    expect(mocks.buildTrendingChartLinks).toHaveBeenCalledTimes(1)
  })

  it('renders skeleton rows while trending charts are loading', () => {
    mocks.queryState.data = null
    mocks.queryState.isLoading = true

    render(<TrendingPage />)

    expect(screen.queryByText('Loading trending charts...')).toBeNull()
    expect(screen.getByRole('status', { name: 'Loading trending charts...' })).toBeTruthy()
    expect(document.querySelectorAll('.MuiSkeleton-root').length).toBeGreaterThan(0)
    expect(mocks.buildTrendingChartLinks).not.toHaveBeenCalled()
  })
})