import type { ServerEnum } from '@gekichumai/dxdata'
import { DifficultyEnum, TypeEnum, VersionEnum } from '@gekichumai/dxdata'
import type { SongCatalog } from '@gekichumai/maimai-domain'
import { describe, expect, it } from 'vitest'
import type { PlayEntry } from '../RatingCalculatorAddEntryForm'
import { calculateWebRatingEntries } from '../useRatingEntries'
import { cloudRecordToPlayEntry, recordFromDTO } from '@/models/scores/cloudScoreMapping'
import { verifiedProvenance } from '@/models/scores/__tests__/fakeCloudSaveServer'
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
    internalId: 1,
    type: TypeEnum.DX,
    difficulty: DifficultyEnum.Master,
    level: '14',
    internalLevelValue: 14,
    noteCounts: {},
    serverIds: ['jp', 'intl', 'usa', 'cn'] as ServerEnum[],
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

  it('keeps a CN Diving Fish bucket hint in AP50 when it disagrees with the chart version', () => {
    // A CiRCLE PLUS chart would be B15 by version; the provider puts it in B35
    const sheet = makeSheet('hinted')
    const entries: PlayEntry[] = [
      {
        sheetId: 'hinted',
        achievementRate: 100.5,
        comboFlag: 'ap',
        providerConfig: { divingFish: { ratingEligibility: 'b35' } },
      },
      { sheetId: 'hinted', achievementRate: 100.6, comboFlag: 'fc' },
    ]
    const args = { entries, sheets: [sheet], catalog: makeCatalog([sheet]), appVersion: VersionEnum.CiRCLEPLUS }
    const b50 = calculateWebRatingEntries({ ...args, region: 'cn' })
    const ap50 = calculateWebRatingEntries({ ...args, region: 'cn', apOnly: true })
    expect(b50.b35Entries).toHaveLength(1)
    expect(ap50.b15Entries).toHaveLength(0)
    expect(ap50.b35Entries.map((entry) => entry.comboFlag)).toEqual(['ap'])
  })

  it('keeps the CN bucket of a Diving-Fish record read back from a cloud save, as a local import does', () => {
    const sheet = makeSheet('hinted')
    const cloud = recordFromDTO({
      sheetId: 'hinted',
      achievement: 1005000,
      comboFlag: 'ap',
      syncFlag: null,
      dxScore: 2400,
      best50Bucket: 'b35',
      providerRecordId: null,
      provenance: verifiedProvenance({ source: 'diving-fish', importJobId: 'dimp_df' }),
      revision: 1,
      valueChangedAt: '2026-11-03T00:00:00.000Z',
      clientEditedAt: null,
      deletedAt: null,
    })
    const args = {
      entries: [cloudRecordToPlayEntry(cloud, null)],
      sheets: [sheet],
      catalog: makeCatalog([sheet]),
      appVersion: VersionEnum.CiRCLEPLUS,
      region: 'cn' as const,
    }
    expect(calculateWebRatingEntries(args).b35Entries).toHaveLength(1)
    expect(calculateWebRatingEntries({ ...args, apOnly: true }).b35Entries).toHaveLength(1)
  })

  it('keeps the CN bucket a Diving-Fish import stored on a better score it kept from another provider', () => {
    const sheet = makeSheet('hinted')
    // An LXNS AP the Diving-Fish import did not replace: it keeps LXNS's provenance and gets Diving-Fish's B35
    const kept = recordFromDTO({
      sheetId: 'hinted',
      achievement: 1005000,
      comboFlag: 'ap',
      syncFlag: null,
      dxScore: null,
      best50Bucket: 'b35',
      providerRecordId: null,
      provenance: verifiedProvenance({ source: 'lxns', importJobId: 'dimp_lx' }),
      revision: 2,
      valueChangedAt: '2026-11-03T00:00:00.000Z',
      clientEditedAt: null,
      deletedAt: null,
    })
    const args = {
      entries: [cloudRecordToPlayEntry(kept, null)],
      sheets: [sheet],
      catalog: makeCatalog([sheet]),
      appVersion: VersionEnum.CiRCLEPLUS,
      region: 'cn' as const,
    }
    expect(calculateWebRatingEntries(args).b35Entries).toHaveLength(1)
    expect(calculateWebRatingEntries({ ...args, apOnly: true }).b35Entries).toHaveLength(1)
  })
})