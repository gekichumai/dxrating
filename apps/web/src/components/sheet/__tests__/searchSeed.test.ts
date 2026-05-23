import { CategoryEnum, DifficultyEnum, TypeEnum, VersionEnum, type Song } from '@gekichumai/dxdata'
import { describe, expect, it } from 'vitest'
import {
  FILTER_LAST_ACTIVE_AT_COOKIE_NAME,
  SEARCH_SEED_LIMIT,
  SHEET_SORT_FILTER_TTL,
  buildSearchSeedSheets,
  hasActiveFilterLastActiveAtCookie,
  serializeClearFilterLastActiveAtCookie,
  serializeFilterLastActiveAtCookie,
  shouldShowSearchSeed,
} from '../searchSeed'

const createSong = (index: number, releaseDate = `2026-05-${String((index % 28) + 1).padStart(2, '0')}`): Song => ({
  songId: `song-${index}`,
  title: `Song ${index}`,
  artist: 'artist',
  category: CategoryEnum.Maimai,
  bpm: 120,
  imageName: '',
  isNew: false,
  isLocked: false,
  searchAcronyms: [],
  sheets: [
    {
      type: TypeEnum.DX,
      difficulty: DifficultyEnum.Master,
      level: '13',
      internalLevelValue: 13,
      releaseDate,
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
      isSpecial: false,
      version: VersionEnum.CiRCLEPLUS,
    },
  ],
})

describe('search seed helpers', () => {
  it('sorts seed sheets by release date descending and caps at 500', () => {
    const seed = buildSearchSeedSheets(
      Array.from({ length: 501 }, (_, index) =>
        createSong(index, new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10)),
      ),
    )

    expect(seed).toHaveLength(500)
    expect(seed[0]).toMatchObject({
      songId: 'song-500',
      title: 'Song 500',
      releaseDate: '2027-05-16',
      path: '/songs/song-500/dx/master',
    })
    expect(seed.every((sheet) => sheet.path.startsWith('/songs/'))).toBe(true)
  })

  it('returns a copy of the cached default seed list', () => {
    const first = buildSearchSeedSheets()
    const firstSeed = first[0]
    first.length = 0

    const second = buildSearchSeedSheets()

    expect(second).toHaveLength(SEARCH_SEED_LIMIT)
    expect(second[0]).toEqual(firstSeed)
  })

  it('keeps all difficulties in the seed candidates', () => {
    const seed = buildSearchSeedSheets([
      {
        ...createSong(1),
        sheets: [
          { ...createSong(1).sheets[0]!, difficulty: DifficultyEnum.Basic },
          { ...createSong(1).sheets[0]!, difficulty: DifficultyEnum.Master },
        ],
      },
    ])

    expect(seed.map((sheet) => sheet.difficulty)).toEqual([DifficultyEnum.Basic, DifficultyEnum.Master])
  })

  it('treats missing, invalid, expired, and far-future filter cookies as inactive', () => {
    expect(hasActiveFilterLastActiveAtCookie(null, 1_000_000)).toBe(false)
    expect(hasActiveFilterLastActiveAtCookie(`${FILTER_LAST_ACTIVE_AT_COOKIE_NAME}=nope`, 1_000_000)).toBe(false)
    expect(
      hasActiveFilterLastActiveAtCookie(
        `${FILTER_LAST_ACTIVE_AT_COOKIE_NAME}=${1_000_000 - SHEET_SORT_FILTER_TTL}`,
        1_000_000,
      ),
    ).toBe(false)
    expect(hasActiveFilterLastActiveAtCookie(`${FILTER_LAST_ACTIVE_AT_COOKIE_NAME}=1031001`, 1_000_000)).toBe(false)
  })

  it('treats current and slightly future filter cookies as active', () => {
    expect(hasActiveFilterLastActiveAtCookie(`${FILTER_LAST_ACTIVE_AT_COOKIE_NAME}=999999`, 1_000_000)).toBe(true)
    expect(hasActiveFilterLastActiveAtCookie(`${FILTER_LAST_ACTIVE_AT_COOKIE_NAME}=1030000`, 1_000_000)).toBe(true)
  })

  it('shows the seed only for default search without an active filter cookie', () => {
    expect(shouldShowSearchSeed({})).toBe(true)
    expect(shouldShowSearchSeed({ q: '宴' })).toBe(false)
    expect(shouldShowSearchSeed({ songId: 'song-1' })).toBe(false)
    expect(shouldShowSearchSeed({ type: 'dx' })).toBe(false)
    expect(shouldShowSearchSeed({ difficulty: 'master' })).toBe(false)
    expect(shouldShowSearchSeed({}, false)).toBe(true)
    expect(shouldShowSearchSeed({}, true)).toBe(false)
  })

  it('serializes the filter activity cookies with the expected browser scope', () => {
    expect(serializeFilterLastActiveAtCookie(1_234_567)).toBe(
      `${FILTER_LAST_ACTIVE_AT_COOKIE_NAME}=1234567; Max-Age=300; Path=/; SameSite=Lax`,
    )
    expect(serializeClearFilterLastActiveAtCookie()).toBe(
      `${FILTER_LAST_ACTIVE_AT_COOKIE_NAME}=; Max-Age=0; Path=/; SameSite=Lax`,
    )
  })
})