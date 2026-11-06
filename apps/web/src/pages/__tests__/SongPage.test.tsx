import { DifficultyEnum, VersionEnum } from '@gekichumai/dxdata'
import { render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initI18n } from '@/setup/init-i18n'
import { SongPage } from '../SongPage'

// WWW, by its public song ID
const routeState = vi.hoisted(() => ({
  params: {
    songId: 'dsng_d3kkdkrcqj',
    type: 'dx',
    difficulty: 'basic',
  },
  navigate: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useParams: () => routeState.params,
  }),
  useNavigate: () => routeState.navigate,
  Link: ({ children, params, to }: { children: React.ReactNode; params: { songId: string }; to: string }) => (
    <a href={to.replace('$songId', params.songId)}>{children}</a>
  ),
}))

vi.mock('@/models/context/useAppContext', () => ({
  useAppContextDXDataVersion: () => VersionEnum.CiRCLEPLUS,
}))

vi.mock('@/models/useServerAliases', () => ({
  useServerAliases: () => ({ data: [] }),
}))

vi.mock('@/components/song/SongHeader', () => ({
  SongHeader: ({ sheet }: { sheet: { title: string } }) => <h1>{sheet.title}</h1>,
}))

vi.mock('@/components/song/SongSheetTabs', () => ({
  SongSheetTabs: () => <nav aria-label="Sheet tabs" />,
}))

vi.mock('@/components/song/SongSheetContent', () => ({
  SongSheetContent: ({ sheet }: { sheet: { difficulty: string } }) => (
    <section data-testid="sheet-content">{sheet.difficulty}</section>
  ),
  SongSheetSummary: () => <div data-testid="sheet-summary" />,
}))

vi.mock('@/components/tools/ToleranceCalculator', () => ({
  ToleranceCalculator: () => <section data-testid="tolerance-calculator" />,
}))

describe('SongPage', () => {
  beforeAll(() => {
    initI18n()
  })

  beforeEach(() => {
    document.head.innerHTML = '<title>Route-owned title</title>'
  })

  it('lets route metadata own the document title', () => {
    render(<SongPage />)

    expect(screen.getByTestId('sheet-content').textContent).toBe(DifficultyEnum.Basic)
    expect(document.head.querySelectorAll('title')).toHaveLength(1)
    expect(document.head.querySelector('title')?.textContent).toBe('Route-owned title')
  })

  it('uses the home page (chart search) as the client fallback for the back link', () => {
    const { container } = render(<SongPage />)

    const back = container.querySelector('a')
    expect(back?.getAttribute('href')).toBe('/')
    expect(back?.getAttribute('aria-label')).toBe('Back')
  })

  it('links to the song hub instead of repeating the all-charts table', () => {
    render(<SongPage />)

    const hubLink = screen.getByRole('link', { name: /All charts of this song/ })
    expect(hubLink.getAttribute('href')).toBe('/songs/dsng_d3kkdkrcqj')
    expect(screen.queryByRole('table')).toBeNull()
  })
})