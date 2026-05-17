import { CategoryEnum, DifficultyEnum, TypeEnum, VersionEnum, type DXData } from '@gekichumai/dxdata'
import { describe, expect, it } from 'vitest'
import { getDxdataSongCatalog } from '../dxdata-catalog.js'
import { buildSongCatalog, getSheetIdentityFromId } from '../song-catalog.js'

const fixtureData: DXData = {
  updateTime: '2026-05-17T00:00:00.000Z',
  categories: [],
  versions: [],
  types: [],
  difficulties: [],
  regions: [],
  songs: [
    {
      songId: 'song-a',
      title: 'Song A',
      artist: 'Artist',
      bpm: 180,
      category: CategoryEnum.Maimai,
      imageName: 'song-a',
      isNew: false,
      isLocked: false,
      searchAcronyms: ['sa'],
      sheets: [
        {
          internalId: 10001,
          type: TypeEnum.DX,
          difficulty: DifficultyEnum.Master,
          level: '13+',
          internalLevelValue: 13.7,
          multiverInternalLevelValue: {
            [VersionEnum.CiRCLE]: 13.8,
          } as Record<VersionEnum, number>,
          noteDesigner: 'Designer',
          noteCounts: { tap: 1, hold: 1, slide: 1, touch: 1, break: 1, total: 5 },
          regions: { jp: true, intl: true, cn: false },
          isSpecial: false,
          version: VersionEnum.PRiSMPLUS,
          releaseDate: '2025-03-01',
        },
        {
          internalId: 20001,
          type: TypeEnum.UTAGE,
          difficulty: DifficultyEnum.Master,
          level: '宴',
          internalLevelValue: 0,
          noteDesigner: null,
          noteCounts: { tap: null, hold: null, slide: null, touch: null, break: null, total: null },
          regions: { jp: true, intl: false, cn: false },
          isSpecial: true,
          version: VersionEnum.PRiSMPLUS,
        },
      ],
    },
  ],
}

describe('Song Catalog', () => {
  it('projects Versioned Sheets with identity, id, and selected internal level', () => {
    const catalog = buildSongCatalog(fixtureData, VersionEnum.CiRCLE)
    const sheet = catalog.getByIdentity({
      songId: 'song-a',
      type: TypeEnum.DX,
      difficulty: DifficultyEnum.Master,
    })

    expect(sheet?.id).toBe('song-a__dxrt__dx__dxrt__master')
    expect(sheet?.identity).toEqual({
      songId: 'song-a',
      type: TypeEnum.DX,
      difficulty: DifficultyEnum.Master,
    })
    expect(sheet?.internalLevelValue).toBe(13.8)
    expect(sheet?.releaseDateTimestamp).toBe(new Date('2025-03-01T06:00:00+09:00').valueOf())
  })

  it('marks UTAGE sheets as not rating eligible', () => {
    const catalog = buildSongCatalog(fixtureData, VersionEnum.CiRCLE)
    const sheet = catalog.getByIdentity({
      songId: 'song-a',
      type: TypeEnum.UTAGE,
      difficulty: DifficultyEnum.Master,
    })

    expect(sheet?.isTypeUtage).toBe(true)
    expect(sheet?.isRatingEligible).toBe(false)
  })

  it('resolves explicit provider references without fuzzy matching', () => {
    const catalog = buildSongCatalog(fixtureData, VersionEnum.CiRCLE)

    expect(
      catalog.resolveReference({
        kind: 'title',
        title: 'Song A',
        type: TypeEnum.DX,
        difficulty: DifficultyEnum.Master,
      })?.identity.songId,
    ).toBe('song-a')

    expect(
      catalog.resolveReference({
        kind: 'internal-id',
        internalId: 10001,
        type: TypeEnum.DX,
        difficulty: DifficultyEnum.Master,
      })?.identity.songId,
    ).toBe('song-a')

    expect(
      catalog.resolveReference({
        kind: 'title',
        title: 'Song',
        type: TypeEnum.DX,
        difficulty: DifficultyEnum.Master,
      }),
    ).toBeNull()
  })

  it('returns null for ambiguous exact title references', () => {
    const catalog = buildSongCatalog(
      {
        ...fixtureData,
        songs: [
          ...fixtureData.songs,
          {
            songId: 'song-b',
            title: 'Song A',
            artist: 'Other Artist',
            bpm: 190,
            category: CategoryEnum.Maimai,
            imageName: 'song-b',
            isNew: false,
            isLocked: false,
            searchAcronyms: ['sb'],
            sheets: [
              {
                internalId: 10002,
                type: TypeEnum.DX,
                difficulty: DifficultyEnum.Master,
                level: '13',
                internalLevelValue: 13,
                noteDesigner: 'Other Designer',
                noteCounts: { tap: 2, hold: 2, slide: 2, touch: 2, break: 2, total: 10 },
                regions: { jp: true, intl: true, cn: false },
                isSpecial: false,
                version: VersionEnum.PRiSMPLUS,
              },
            ],
          },
        ],
      },
      VersionEnum.CiRCLE,
    )

    expect(
      catalog.resolveReference({
        kind: 'title',
        title: 'Song A',
        type: TypeEnum.DX,
        difficulty: DifficultyEnum.Master,
      }),
    ).toBeNull()
  })

  it('resolves provider music ids by internal id before ambiguous title fallback', () => {
    const catalog = buildSongCatalog(
      {
        ...fixtureData,
        songs: [
          {
            ...fixtureData.songs[0]!,
            title: 'Shared Title',
          },
          {
            songId: 'song-b',
            title: 'Shared Title',
            artist: 'Other Artist',
            bpm: 190,
            category: CategoryEnum.Maimai,
            imageName: 'song-b',
            isNew: false,
            isLocked: false,
            searchAcronyms: ['sb'],
            sheets: [
              {
                internalId: 10002,
                type: TypeEnum.DX,
                difficulty: DifficultyEnum.Master,
                level: '13',
                internalLevelValue: 13,
                noteDesigner: 'Other Designer',
                noteCounts: { tap: 2, hold: 2, slide: 2, touch: 2, break: 2, total: 10 },
                regions: { jp: true, intl: true, cn: false },
                isSpecial: false,
                version: VersionEnum.PRiSMPLUS,
              },
            ],
          },
        ],
      },
      VersionEnum.CiRCLE,
    )

    expect(
      catalog.resolveReference({
        kind: 'provider-music-id',
        musicId: 10002,
        difficulty: DifficultyEnum.Master,
      })?.identity.songId,
    ).toBe('song-b')
  })

  it('resolves provider music id maps through exact mapped names', () => {
    const catalog = buildSongCatalog(fixtureData, VersionEnum.CiRCLE)
    const sheet = catalog.resolveReference({
      kind: 'provider-music-id',
      musicId: 99999,
      difficulty: DifficultyEnum.Master,
      map: {
        '99999': { name: 'Song A', ver: '24000' },
      },
    })

    expect(sheet?.identity).toEqual({
      songId: 'song-a',
      type: TypeEnum.DX,
      difficulty: DifficultyEnum.Master,
    })
  })

  it('resolves provider music id maps by song id before ambiguous title fallback', () => {
    const catalog = buildSongCatalog(
      {
        ...fixtureData,
        songs: [
          {
            ...fixtureData.songs[0]!,
            songId: 'Shared Name',
            title: 'Shared Name',
          },
          {
            songId: 'song-b',
            title: 'Shared Name',
            artist: 'Other Artist',
            bpm: 190,
            category: CategoryEnum.Maimai,
            imageName: 'song-b',
            isNew: false,
            isLocked: false,
            searchAcronyms: ['sb'],
            sheets: [
              {
                internalId: 10002,
                type: TypeEnum.DX,
                difficulty: DifficultyEnum.Master,
                level: '13',
                internalLevelValue: 13,
                noteDesigner: 'Other Designer',
                noteCounts: { tap: 2, hold: 2, slide: 2, touch: 2, break: 2, total: 10 },
                regions: { jp: true, intl: true, cn: false },
                isSpecial: false,
                version: VersionEnum.PRiSMPLUS,
              },
            ],
          },
        ],
      },
      VersionEnum.CiRCLE,
    )

    expect(
      catalog.resolveReference({
        kind: 'provider-music-id',
        musicId: 999999,
        difficulty: DifficultyEnum.Master,
        map: {
          '999999': { name: 'Shared Name' },
        },
      })?.identity.songId,
    ).toBe('Shared Name')
  })

  it('resolves cached provider music id maps through title fallback when internal id misses', () => {
    const catalog = getDxdataSongCatalog(VersionEnum.CiRCLE)
    const sheet = catalog.resolveReference({
      kind: 'provider-music-id',
      musicId: 99999,
      difficulty: DifficultyEnum.Master,
      map: {
        '99999': { name: '君の知らない物語', ver: '24000' },
      },
    })

    expect(sheet?.identity).toEqual({
      songId: '君の知らない物語',
      type: TypeEnum.DX,
      difficulty: DifficultyEnum.Master,
    })
  })

  it('parses catalog ids for UTAGE custom difficulty labels', () => {
    const catalog = buildSongCatalog(
      {
        updateTime: '2026-05-17T00:00:00.000Z',
        categories: [],
        versions: [],
        types: [],
        difficulties: [],
        regions: [],
        songs: [
          {
            songId: 'utage-song',
            title: 'UTAGE Song',
            artist: 'Artist',
            bpm: 180,
            category: CategoryEnum.宴会場,
            imageName: 'utage-song',
            isNew: false,
            isLocked: false,
            searchAcronyms: [],
            sheets: [
              {
                internalId: 30001,
                type: TypeEnum.UTAGE,
                difficulty: '【協】' as unknown as DifficultyEnum,
                level: '13?',
                internalLevelValue: 13,
                noteDesigner: null,
                noteCounts: { tap: null, hold: null, slide: null, touch: null, break: null, total: null },
                regions: { jp: true, intl: false, cn: false },
                isSpecial: true,
                version: VersionEnum.PRiSMPLUS,
              },
            ],
          },
        ],
      },
      VersionEnum.CiRCLE,
    )
    const sheet = catalog.sheets[0]

    expect(sheet?.id).toBe('utage-song__dxrt__utage__dxrt__【協】')
    const identity = sheet ? getSheetIdentityFromId(sheet.id) : null
    expect(identity).toEqual({
      songId: 'utage-song',
      type: TypeEnum.UTAGE,
      difficulty: '【協】',
    })
    if (!identity) throw new Error('Expected UTAGE catalog id to parse')
    expect(catalog.getByIdentity(identity)?.id).toBe(sheet?.id)
  })

  it('resolves bundled provider music ids by internal id before ambiguous title fallback', () => {
    const catalog = getDxdataSongCatalog(VersionEnum.CiRCLE)
    const sheet = catalog.resolveReference({
      kind: 'provider-music-id',
      musicId: 383,
      difficulty: DifficultyEnum.Basic,
    })

    expect(sheet?.identity).toEqual({
      songId: 'Link (2)',
      type: TypeEnum.STD,
      difficulty: DifficultyEnum.Basic,
    })
  })

  it('prevents cached dxdata catalog mutations from leaking between callers', () => {
    const catalog = getDxdataSongCatalog(VersionEnum.CiRCLE)
    const originalLength = catalog.sheets.length
    const firstSheet = catalog.sheets[0]
    if (!firstSheet) throw new Error('Expected dxdata catalog to include at least one sheet')
    const originalTitle = firstSheet.title
    const mutableSheets = catalog.sheets as unknown[]
    const mutableFirstSheet = firstSheet as unknown as { title: string }

    try {
      mutableSheets.push(firstSheet)
    } catch {
      // Frozen catalogs reject array mutation.
    }

    try {
      mutableFirstSheet.title = 'Mutated title'
    } catch {
      // Frozen sheet objects reject property mutation.
    }

    const nextCatalog = getDxdataSongCatalog(VersionEnum.CiRCLE)
    expect(nextCatalog.sheets).toHaveLength(originalLength)
    expect(nextCatalog.sheets[0]?.title).toBe(originalTitle)
  })

  it('prevents cached dxdata lookup mutations from leaking between callers', () => {
    const catalog = getDxdataSongCatalog(VersionEnum.CiRCLE)
    const exposedSheet = catalog.sheets[0]
    if (!exposedSheet) throw new Error('Expected dxdata catalog to include at least one sheet')

    const lookupById = catalog.getById(exposedSheet.id)
    const lookupByIdentity = catalog.getByIdentity(exposedSheet.identity)
    const lookupByReference = catalog.resolveReference({
      kind: 'identity',
      identity: exposedSheet.identity,
    })
    if (!lookupById || !lookupByIdentity || !lookupByReference) {
      throw new Error('Expected dxdata catalog lookups to resolve the exposed sheet')
    }

    expect(Object.isFrozen(lookupById)).toBe(true)
    expect(Object.isFrozen(lookupByIdentity)).toBe(true)
    expect(Object.isFrozen(lookupByReference)).toBe(true)
    expect(lookupById).toBe(exposedSheet)
    expect(lookupByIdentity).toBe(exposedSheet)
    expect(lookupByReference).toBe(exposedSheet)

    try {
      ;(lookupById as unknown as { title: string }).title = '__MUTATED_BY_LOOKUP__'
    } catch {
      // Frozen lookup results reject property mutation.
    }

    const nextCatalog = getDxdataSongCatalog(VersionEnum.CiRCLE)
    expect(nextCatalog.getById(exposedSheet.id)?.title).toBe(exposedSheet.title)
    expect(nextCatalog.getByIdentity(exposedSheet.identity)?.title).toBe(exposedSheet.title)
    expect(
      nextCatalog.resolveReference({
        kind: 'identity',
        identity: exposedSheet.identity,
      })?.title,
    ).toBe(exposedSheet.title)
    expect(nextCatalog.sheets[0]?.title).toBe(exposedSheet.title)
  })

  it('deep-freezes runtime nested dxdata extras returned through cached lookups', () => {
    const catalog = getDxdataSongCatalog(VersionEnum.CiRCLE)
    const sheetWithOverrides = catalog.sheets.find((sheet) => getIntlRegionOverrides(sheet))
    if (!sheetWithOverrides) throw new Error('Expected dxdata catalog to include regionOverrides.intl')

    const lookup = catalog.getById(sheetWithOverrides.id)
    const regionOverrides = getRegionOverrides(lookup)
    const intlOverrides = getIntlRegionOverrides(lookup)
    if (!regionOverrides || !intlOverrides) {
      throw new Error('Expected dxdata lookup to expose regionOverrides.intl')
    }

    expect(Object.isFrozen(regionOverrides)).toBe(true)
    expect(Object.isFrozen(intlOverrides)).toBe(true)

    try {
      intlOverrides.__lookupProbe = '__MUTATED_REGION_OVERRIDES__'
    } catch {
      // Frozen nested runtime extras reject property mutation.
    }

    const nextLookup = getDxdataSongCatalog(VersionEnum.CiRCLE).getById(sheetWithOverrides.id)
    expect(getIntlRegionOverrides(nextLookup)?.__lookupProbe).toBeUndefined()
  })
})

function getRegionOverrides(sheet: unknown): Record<string, unknown> | undefined {
  const regionOverrides = (sheet as { regionOverrides?: unknown } | null | undefined)?.regionOverrides
  return isRecord(regionOverrides) ? regionOverrides : undefined
}

function getIntlRegionOverrides(sheet: unknown): Record<string, unknown> | undefined {
  const intlOverrides = getRegionOverrides(sheet)?.intl
  return isRecord(intlOverrides) ? intlOverrides : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}