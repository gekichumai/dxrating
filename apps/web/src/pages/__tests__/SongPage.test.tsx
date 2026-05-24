import { DifficultyEnum, VersionEnum } from '@gekichumai/dxdata'
import { render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initI18n } from '@/setup/init-i18n'
import { SongPage } from '../SongPage'

const routeState = vi.hoisted(() => ({
  params: {
    songId: 'WWW',
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

  it('uses search as the client fallback for the back link', () => {
    const { container } = render(<SongPage />)

    expect(container.querySelector('a')?.getAttribute('href')).toBe('/search')
  })
})
