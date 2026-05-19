import { DifficultyEnum, TypeEnum, VersionEnum } from '@gekichumai/dxdata'
import type { SongCatalog } from '@gekichumai/maimai-domain'
import { describe, expect, it } from 'vitest'
import type { PlayEntry } from '../RatingCalculatorAddEntryForm'
import { calculateWebRatingEntries } from '../useRatingEntries'
import type { FlattenedSheet } from '../../../songs'

const makeSheet = (
  id: string,
  {
    isRatingEligible = true,
    tags = [],
    searchAcronyms = [],
  }: {
    isRatingEligible?: boolean
    tags?: number[]
    searchAcronyms?: string[]
  } = {},
): FlattenedSheet =>
  ({
    id,
    songId: id,
    title: id,
    artist: 'artist',
    bpm: 120,
    category: 'maimai',
    imageName: `${id}.png`,
    isNew: false,
    isLocked: false,
    searchAcronyms,
    sheets: [],
    internalId: 1,
    type: TypeEnum.DX,
    difficulty: DifficultyEnum.Master,
    level: '14',
    internalLevelValue: 14,
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
    identity: {
      songId: id,
      type: TypeEnum.DX,
      difficulty: DifficultyEnum.Master,
    },
    isTypeUtage: !isRatingEligible,
    isRatingEligible,
    releaseDateTimestamp: 1,
    tags,
  }) as FlattenedSheet

const makeCatalog = (sheets: FlattenedSheet[]): SongCatalog =>
  ({
    version: VersionEnum.CiRCLEPLUS,
    sheets,
    getById: (id: string) => sheets.find((sheet) => sheet.id === id) ?? null,
  }) as unknown as SongCatalog

describe('calculateWebRatingEntries', () => {
  it('keeps non-rating-eligible entries with null rating and no bucket', () => {
    const utageSheet = makeSheet('utage', { isRatingEligible: false, tags: [9] })
    const result = calculateWebRatingEntries({
      entries: [{ sheetId: utageSheet.id, achievementRate: 100.5 }],
      sheets: [utageSheet],
      catalog: makeCatalog([utageSheet]),
      appVersion: VersionEnum.CiRCLEPLUS,
      region: 'jp',
    })

    expect(result.allEntries).toHaveLength(1)
    expect(result.allEntries[0]!.sheet).toBe(utageSheet)
    expect(result.allEntries[0]!.rating).toBeNull()
    expect(result.allEntries[0]!.includedIn).toBeNull()
  })

  it('uses the web-enriched sheet rather than the catalog sheet', () => {
    const webSheet = makeSheet('eligible', { tags: [42], searchAcronyms: ['server alias'] })
    const catalogSheet = makeSheet('eligible')
    const result = calculateWebRatingEntries({
      entries: [{ sheetId: webSheet.id, achievementRate: 100.5 }],
      sheets: [webSheet],
      catalog: makeCatalog([catalogSheet]),
      appVersion: VersionEnum.CiRCLEPLUS,
      region: 'jp',
    })

    expect(result.allEntries[0]!.sheet).toBe(webSheet)
    expect(result.allEntries[0]!.sheet.tags).toEqual([42])
    expect(result.allEntries[0]!.sheet.searchAcronyms).toEqual(['server alias'])
  })

  it('marks the selected duplicate entry without mixing in another original entry', () => {
    const sheet = makeSheet('duplicate')
    const lowEntry: PlayEntry = {
      sheetId: sheet.id,
      achievementRate: 97,
      comboFlag: 'fc',
      syncFlag: 'fs',
    }
    const highEntry: PlayEntry = {
      sheetId: sheet.id,
      achievementRate: 100.5,
      comboFlag: 'ap',
      syncFlag: 'fsdp',
    }

    const result = calculateWebRatingEntries({
      entries: [lowEntry, highEntry],
      sheets: [sheet],
      catalog: makeCatalog([sheet]),
      appVersion: VersionEnum.CiRCLEPLUS,
      region: 'jp',
    })

    expect(result.allEntries).toHaveLength(2)
    expect(result.b15Entries).toHaveLength(1)
    expect(result.b15Entries[0]!.achievementRate).toBe(highEntry.achievementRate)
    expect(result.b15Entries[0]!.comboFlag).toBe(highEntry.comboFlag)
    expect(result.b15Entries[0]!.syncFlag).toBe(highEntry.syncFlag)
    expect(result.allEntries.find((entry) => entry.achievementRate === lowEntry.achievementRate)!.includedIn).toBeNull()
  })
})