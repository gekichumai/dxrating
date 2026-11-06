import { VersionEnum } from '@gekichumai/dxdata'
import { render, screen, within } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n } from '@/setup/init-i18n'
import { SongHubPage } from '../SongHubPage'

// WWW, by its public song ID
const routeState = vi.hoisted(() => ({ params: { songId: 'dsng_d3kkdkrcqj' } }))

vi.mock('@tanstack/react-router', () => ({
  // InternalLink: no router in these tests, so links render as plain anchors
  useRouter: () => undefined,
  getRouteApi: () => ({ useParams: () => routeState.params }),
}))

vi.mock('@/models/context/useAppContext', () => ({
  useAppContextDXDataVersion: () => VersionEnum.CiRCLEPLUS,
}))

vi.mock('@/models/useServerAliases', () => ({
  useServerAliases: () => ({ data: [{ song_id: 'dsng_d3kkdkrcqj', name: 'test-alias' }] }),
}))

vi.mock('@/components/song/hub/SongChartsTable', () => ({
  SongChartsTable: ({ songId, sheets }: { songId: string; sheets: unknown[] }) => (
    <section aria-label="All charts" data-song-id={songId} data-sheets={sheets.length} />
  ),
}))

describe('SongHubPage', () => {
  beforeAll(() => {
    initI18n()
  })

  it('shows the title, artist, BPM, version and aliases above the all-charts table', () => {
    const { container } = render(<SongHubPage />)

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('WWW')
    expect(within(screen.getByTestId('song-hub-artist')).getAllByText(/.+/).length).toBeGreaterThan(1)
    expect(screen.getByTestId('song-hub-bpm').textContent).toMatch(/BPM\d+/)
    expect(screen.getByTestId('song-hub-version')).toBeTruthy()
    expect(screen.getByTestId('song-hub-aliases').textContent).toContain('test-alias')

    const table = screen.getByLabelText('All charts')
    expect(table.getAttribute('data-song-id')).toBe('dsng_d3kkdkrcqj')
    expect(Number(table.getAttribute('data-sheets'))).toBeGreaterThan(0)
    // The facts come first in the document
    const header = container.querySelector('header')!
    expect(header.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('renders the not-found content for an unknown song', () => {
    routeState.params = { songId: 'dsng_unknown' }
    render(<SongHubPage />)
    expect(screen.queryByRole('heading', { level: 1, name: 'WWW' })).toBeNull()
    routeState.params = { songId: 'dsng_d3kkdkrcqj' }
  })
})