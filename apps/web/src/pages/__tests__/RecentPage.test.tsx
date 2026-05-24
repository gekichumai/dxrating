import { DifficultyEnum, TypeEnum } from '@gekichumai/dxdata'
import { render, screen, within } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { initI18n } from '@/setup/init-i18n'
import { RecentPage } from '../RecentPage'

const charts = [
  {
    songId: 'song-a',
    title: 'Song A',
    artist: 'Artist A',
    type: TypeEnum.DX,
    difficulty: DifficultyEnum.Master,
    level: '13+',
    internalLevelValue: 13.7,
    releaseDate: '2025-05-01',
    href: '/songs/song-a/dx/master',
  },
]

describe('RecentPage', () => {
  beforeAll(() => {
    initI18n()
  })

  it('renders crawlable chart anchors in server HTML', () => {
    const html = renderToString(<RecentPage charts={charts} />)

    expect(html).toContain('<h1')
    expect(html).toContain('href="/songs/song-a/dx/master"')
    expect(html).toContain('Song A')
    expect(html).not.toContain('data-testid="search-seed-list"')
  })

  it('renders a semantic list of recent charts', () => {
    render(<RecentPage charts={charts} />)

    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy()
    const link = screen.getByRole('link', { name: /Song A/i }) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/songs/song-a/dx/master')
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(1)

    const date = screen.getByText('2025-05-01')
    expect(date.tagName.toLowerCase()).toBe('time')
    expect(date.getAttribute('datetime')).toBe('2025-05-01')
  })
})