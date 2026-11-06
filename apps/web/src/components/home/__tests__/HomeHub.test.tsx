import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n } from '@/setup/init-i18n'
import { HomeHub } from '../HomeHub'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('../useHomeQuickStats', () => ({ useHomeQuickStats: () => null }))

const recentSongs = [
  { songId: 'song-a', title: 'Song A', imageName: 'song-a', href: '/songs/song-a' },
  { songId: 'song-b', title: 'Song B', imageName: 'song-b', href: '/songs/song-b' },
]

describe('HomeHub', () => {
  beforeAll(() => {
    initI18n()
  })

  it('folds the new charts below sm, by CSS, so the server render suits every width', () => {
    const html = renderToString(<HomeHub recentSongs={recentSongs} />)

    expect(html).toContain('aria-expanded="false"')
    expect(html).toMatch(/class="material-surface w-full hidden sm:block"/)
  })

  it('unfolds and folds the new charts with the heading button', () => {
    render(<HomeHub recentSongs={recentSongs} />)
    const toggle = screen.getByRole('button', { name: 'New charts' })
    const content = document.getElementById(toggle.getAttribute('aria-controls')!)!

    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(content.className).not.toContain('hidden')

    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(content.className).toContain('hidden sm:block')
  })

})