import type { ServerEnum } from '@gekichumai/dxdata'
import { CategoryEnum, DifficultyEnum, TypeEnum, VersionEnum } from '@gekichumai/dxdata'
import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n } from '@/setup/init-i18n'
import type { FlattenedSheet } from '@/songs'
import { SheetListItemContent } from '../SheetListItem'
import { SheetRowLayoutContext } from '../sheetRowLayout'

vi.mock('posthog-js/react', () => ({
  usePostHog: () => null,
}))

const sheet: FlattenedSheet = {
  id: 'song-1:dx:master',
  songId: 'song-1',
  identity: { songId: 'song-1', type: TypeEnum.DX, difficulty: DifficultyEnum.Master },
  title: 'Song Title',
  artist: 'Song Artist',
  category: CategoryEnum.Maimai,
  bpm: 120,
  imageName: 'song-image',
  isNew: false,
  type: TypeEnum.DX,
  difficulty: DifficultyEnum.Master,
  level: '13',
  internalLevelValue: 13,
  noteCounts: {},
  serverIds: ['jp', 'intl', 'usa', 'cn'] as ServerEnum[],
  version: VersionEnum.CiRCLEPLUS,
  isSpecial: false,
  isLocked: false,
  isTypeUtage: false,
  isRatingEligible: true,
  comment: '',
  searchAcronyms: [],
  releaseDateTimestamp: 0,
  tags: [],
}

describe('SheetListItemContent in a table row', () => {
  beforeAll(() => {
    initI18n()
  })

  it('keeps one heading and adds the artist column and the full title on hover', () => {
    render(
      <SheetRowLayoutContext.Provider value="table">
        <SheetListItemContent sheet={sheet} />
      </SheetRowLayoutContext.Provider>,
    )

    expect(screen.getAllByRole('heading')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: /Song Title/ })).toBeTruthy()
    // The artist is a column from lg only, so phones keep the stacked row they had
    expect(screen.getByText('Song Artist').className).toMatch(/(^| )hidden( |$)/)
    expect(screen.getByTitle('Song Title').textContent).toBe('Song Title')
    expect(screen.getByText(/ver\./)).toBeTruthy()
  })

  it('stays stacked under a nested stacked provider, as in a dialog opened from a table row', () => {
    render(
      <SheetRowLayoutContext.Provider value="table">
        <SheetRowLayoutContext.Provider value="stacked">
          <SheetListItemContent sheet={sheet} />
        </SheetRowLayoutContext.Provider>
      </SheetRowLayoutContext.Provider>,
    )

    expect(screen.queryByText('Song Artist')).toBeNull()
    expect(screen.queryByTitle('Song Title')).toBeNull()
  })
})