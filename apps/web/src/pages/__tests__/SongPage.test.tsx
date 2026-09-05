import { DifficultyEnum, VersionEnum } from '@gekichumai/dxdata'
import { fireEvent, render, screen } from '@testing-library/react'
import i18n from 'i18next'
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

vi.mock('@/components/song/SongSheetContent', () => ({
  SongSheetContent: ({ sheet }: { sheet: { difficulty: string } }) => (
    <section data-testid="sheet-content">{sheet.difficulty}</section>
  ),
}))

describe('SongPage', () => {
  beforeAll(() => {
    initI18n()
  })

  beforeEach(async () => {
    routeState.navigate.mockClear()
    await i18n.changeLanguage('en')
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

    expect(container.querySelector('a')?.getAttribute('href')).toBe('/search?locale=en')
  })

  it('preserves the selected language when changing chart difficulty or type', async () => {
    await i18n.changeLanguage('ja')
    const { container } = render(<SongPage />)

    expect(container.querySelector('a')?.getAttribute('href')).toBe('/search?locale=ja')
    fireEvent.click(screen.getByRole('tab', { name: 'EXPERT' }))
    fireEvent.click(screen.getByRole('tab', { name: 'でらっくす譜面' }))

    expect(routeState.navigate).toHaveBeenCalledTimes(2)
    for (const [destination] of routeState.navigate.mock.calls) {
      expect(destination.search()).toEqual({ locale: 'ja' })
    }
    expect(routeState.navigate.mock.calls[0][0].params.difficulty).toBe(DifficultyEnum.Expert)
  })
})