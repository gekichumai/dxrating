import { CategoryEnum, DifficultyEnum, TypeEnum, VersionEnum } from '@gekichumai/dxdata'
import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n } from '@/setup/init-i18n'
import type { FlattenedSheet } from '@/songs'
import { SheetListItem, SheetListItemContent } from '../SheetListItem'

vi.mock('posthog-js/react', () => ({
  usePostHog: () => null,
}))

vi.mock('web-haptics/react', () => ({
  useWebHaptics: () => ({
    trigger: vi.fn(),
  }),
}))

function makeSheet(type: TypeEnum): FlattenedSheet {
  return {
    id: `song-1:${type}:master`,
    songId: 'song-1',
    identity: {
      songId: 'song-1',
      type,
      difficulty: DifficultyEnum.Master,
    },
    title: 'Song Title',
    artist: 'Artist',
    category: CategoryEnum.Maimai,
    bpm: 120,
    imageName: 'song-image',
    isNew: false,
    type,
    difficulty: DifficultyEnum.Master,
    level: '13',
    internalLevelValue: 13,
    noteDesigner: null,
    noteCounts: {
      tap: null,
      hold: null,
      slide: null,
      touch: null,
      break: null,
      total: null,
    },
    regions: {
      jp: true,
      intl: true,
      cn: true,
    },
    version: VersionEnum.CiRCLEPLUS,
    sheets: [],
    isSpecial: false,
    isLocked: false,
    isTypeUtage: type === TypeEnum.UTAGE || type === TypeEnum.UTAGE2P,
    isRatingEligible: type !== TypeEnum.UTAGE && type !== TypeEnum.UTAGE2P,
    comment: '',
    searchAcronyms: [],
    releaseDateTimestamp: 0,
    tags: [],
  }
}

const getFocusableElements = (container: HTMLElement) =>
  Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true')

describe('SheetListItem', () => {
  beforeAll(() => {
    initI18n()
  })

  it('renders the row as a single focusable link', () => {
    const { container } = render(<SheetListItem sheet={makeSheet(TypeEnum.DX)} />)

    const sheetLink = screen.getByRole('link', { name: /Song Title/ })
    const focusableElements = getFocusableElements(container)

    expect(focusableElements).toHaveLength(1)
    expect(focusableElements[0]).toBe(sheetLink)
  })
})

describe('SheetListItemContent', () => {
  beforeAll(() => {
    initI18n()
  })

  it('uses the song title for cover art alt text', () => {
    render(<SheetListItemContent sheet={makeSheet(TypeEnum.DX)} />)

    expect(screen.getByRole('img', { name: 'Cover art for Song Title' })).toBeTruthy()
    expect(screen.queryByRole('img', { name: 'song-image' })).toBeNull()
  })

  it('uses descriptive alt text for the DX type badge', () => {
    render(<SheetListItemContent sheet={makeSheet(TypeEnum.DX)} enableSheetImage={false} />)

    expect(screen.getByRole('img', { name: 'DX chart' }).getAttribute('src')).toBe(
      'https://shama.dxrating.net/images/type_dx.png',
    )
  })

  it('uses one descriptive accessible label for the Utage 2P badge artwork', () => {
    render(<SheetListItemContent sheet={makeSheet(TypeEnum.UTAGE2P)} enableSheetImage={false} />)

    expect(screen.getByRole('img', { name: 'Buddy chart' })).toBeTruthy()
    expect(screen.queryByRole('img', { name: 'utage2p' })).toBeNull()
  })
})