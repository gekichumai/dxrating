import { DifficultyEnum, TypeEnum } from '@gekichumai/dxdata'
import { render, screen, waitFor } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { initI18n } from '@/setup/init-i18n'
import { SearchSeedList } from '../SearchSeedList'
import type { SearchSeedSheet } from '../searchSeed'

const seedSheets: SearchSeedSheet[] = [
  {
    songId: 'song-1',
    title: 'Song 1',
    type: TypeEnum.DX,
    difficulty: DifficultyEnum.Master,
    level: '13+',
    internalLevelValue: 13.7,
    releaseDate: '2026-05-16',
    path: '/songs/song-1/dx/master',
  },
]

describe('SearchSeedList', () => {
  beforeAll(() => {
    initI18n()
  })

  it('renders crawlable chart anchors in server HTML', () => {
    const html = renderToString(<SearchSeedList sheets={seedSheets} />)

    expect(html).toContain('data-testid="search-seed-list"')
    expect(html).toContain('href="/songs/song-1/dx/master"')
    expect(html).toContain('Song 1')
    expect(html).not.toContain('display:none')
  })

  it('removes the seed section after client hydration', async () => {
    render(<SearchSeedList sheets={seedSheets} />)

    await waitFor(() => {
      expect(screen.queryByTestId('search-seed-list')).toBeNull()
    })
  })
})