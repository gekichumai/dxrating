import type { ServerEnum } from '@gekichumai/dxdata'
import { DifficultyEnum, TypeEnum, VersionEnum } from '@gekichumai/dxdata'
import { render, screen, within } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { initI18n } from '@/setup/init-i18n'
import { RecentPage, groupRecentCharts } from '../RecentPage'

const charts = [
  {
    songId: 'song-a',
    title: 'Song A',
    artist: 'Artist A',
    imageName: 'song-a',
    type: TypeEnum.DX,
    difficulty: DifficultyEnum.Master,
    level: '13+',
    internalLevelValue: 13.7,
    version: VersionEnum.CiRCLEPLUS,
    serverIds: ['jp', 'intl', 'usa', 'cn'] as ServerEnum[],
    isLocked: false,
    isTypeUtage: false,
    releaseDate: '2025-05-01',
    releaseDateTimestamp: new Date('2025-05-01T06:00:00+09:00').valueOf(),
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
    expect(html).toContain('itemType="https://schema.org/CollectionPage"')
    expect(html).toContain('itemType="https://schema.org/ItemList"')
    expect(html).toContain('itemType="https://schema.org/ListItem"')
    expect(html).toContain('itemType="https://schema.org/MusicRecording"')
    expect(html).toContain('Song A')
    expect(html).not.toContain('data-testid="search-seed-list"')
  })

  it('renders a semantic list of recent charts', () => {
    render(<RecentPage charts={charts} />)

    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy()
    const link = screen.getByRole('link', { name: /Song A/i }) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/songs/song-a/dx/master')
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(1)

    const date = screen.getByText('May 1, 2025')
    expect(date.tagName.toLowerCase()).toBe('time')
    expect(date.getAttribute('datetime')).toBe('2025-05-01')
  })

  it('marks up recent charts with schema.org microdata', () => {
    render(<RecentPage charts={charts} />)

    const page = document.querySelector('[itemscope][itemtype="https://schema.org/CollectionPage"]')
    expect(page).toBeTruthy()
    expect(page?.querySelector('[itemprop="name"]')?.textContent).toBe('New charts')

    const list = page?.querySelector('[itemprop="mainEntity"][itemscope][itemtype="https://schema.org/ItemList"]')
    expect(list?.querySelector('meta[itemprop="numberOfItems"]')?.getAttribute('content')).toBe('1')

    const listItem = list?.querySelector(
      'li[itemprop="itemListElement"][itemscope][itemtype="https://schema.org/ListItem"]',
    )
    expect(listItem?.querySelector('meta[itemprop="position"]')?.getAttribute('content')).toBe('1')
    expect(listItem?.querySelector('link[itemprop="url"]')?.getAttribute('href')).toBe(
      'https://dxrating.net/songs/song-a/dx/master',
    )
    expect(listItem?.querySelector('a')?.getAttribute('href')).toBe('/songs/song-a/dx/master')

    const chart = listItem?.querySelector('article[itemscope][itemtype="https://schema.org/MusicRecording"]')
    expect(chart?.getAttribute('itemid')).toBe('https://dxrating.net/songs/song-a/dx/master')
    expect(chart?.querySelector('h3 [itemprop="name"]')?.textContent).toBe('Song A')
    expect(chart?.querySelector('[itemprop="byArtist"] [itemprop="name"]')?.textContent).toBe('Artist A')
    expect(chart?.querySelector('meta[itemprop="datePublished"]')?.getAttribute('content')).toBe('2025-05-01')
  })

  it('groups charts under one heading per release date, numbering positions across groups', () => {
    const second = {
      ...charts[0],
      songId: 'song-b',
      title: 'Song B',
      releaseDate: '2025-04-01',
      releaseDateTimestamp: new Date('2025-04-01T06:00:00+09:00').valueOf(),
      href: '/songs/song-b/dx/master',
    }
    const third = { ...second, difficulty: DifficultyEnum.ReMaster, href: '/songs/song-b/dx/remaster' }
    render(<RecentPage charts={[charts[0], second, third]} />)

    const dateHeadings = screen.getAllByRole('heading', { level: 2 })
    expect(dateHeadings.map((heading) => heading.textContent)).toEqual(['May 1, 2025', 'Apr 1, 2025'])
    expect(screen.getAllByRole('list').map((list) => within(list).getAllByRole('listitem').length)).toEqual([1, 2])
    expect(
      [...document.querySelectorAll('li[itemprop="itemListElement"] > meta[itemprop="position"]')].map((meta) =>
        meta.getAttribute('content'),
      ),
    ).toEqual(['1', '2', '3'])
  })

  it('keeps one section per date when an undated chart sorts between two charts of that date', () => {
    const datedA = { ...charts[0], songId: 'song-a', title: 'A', href: '/songs/song-a/dx/master' }
    const undatedB = {
      ...charts[0],
      songId: 'song-b',
      title: 'B',
      releaseDate: undefined,
      version: VersionEnum.PRiSM,
      href: '/songs/song-b/dx/master',
    }
    const datedC = { ...charts[0], songId: 'song-c', title: 'C', href: '/songs/song-c/dx/master' }
    const input = [datedA, undatedB, datedC]

    expect(
      groupRecentCharts(input).map((group) => [
        group.key,
        group.charts.map(({ chart, position }) => [chart.title, position]),
      ]),
    ).toEqual([
      [
        'date-2025-05-01',
        [
          ['A', 1],
          ['C', 2],
        ],
      ],
      [`version-${VersionEnum.PRiSM}`, [['B', 3]]],
    ])

    render(<RecentPage charts={input} />)

    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      'May 1, 2025',
      `ver. ${VersionEnum.PRiSM}`,
    ])
    const ids = [...document.querySelectorAll('h2[id]')].map((heading) => heading.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const section of document.querySelectorAll('section[aria-labelledby]')) {
      expect(document.getElementById(section.getAttribute('aria-labelledby') ?? '')?.tagName).toBe('H2')
    }
    expect(
      [...document.querySelectorAll('li[itemprop="itemListElement"] > meta[itemprop="position"]')].map((meta) =>
        meta.getAttribute('content'),
      ),
    ).toEqual(['1', '2', '3'])
  })
})