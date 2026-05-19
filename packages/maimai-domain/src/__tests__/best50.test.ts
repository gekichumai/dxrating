import { CategoryEnum, DifficultyEnum, TypeEnum, VersionEnum, type DXData } from '@gekichumai/dxdata'
import { describe, expect, it } from 'vitest'
import { SCORE_COEFFICIENT_TABLE, calculateBest50, calculateRatingAward } from '../best50.js'
import { buildSongCatalog } from '../song-catalog.js'
import { formatSheetIdentity } from '../sheet-identity.js'
import type { ComboFlag, RatingEntry, SheetIdentity } from '../types.js'

function makeData(): DXData {
  return {
    updateTime: '2026-05-17T00:00:00.000Z',
    categories: [],
    versions: [],
    types: [],
    difficulties: [],
    regions: [],
    songs: [
      makeSong('current', VersionEnum.CiRCLEPLUS, { jp: true, intl: true, cn: true }),
      makeSong('previous', VersionEnum.CiRCLE, { jp: true, intl: true, cn: true }),
      makeSong('old', VersionEnum.PRiSMPLUS, { jp: true, intl: false, cn: true }),
    ],
  }
}

function makeSong(songId: string, version: VersionEnum, regions: { jp: boolean; intl: boolean; cn: boolean }) {
  return {
    songId,
    title: songId,
    artist: 'artist',
    bpm: 120,
    category: CategoryEnum.Maimai,
    imageName: songId,
    isNew: false,
    isLocked: false,
    searchAcronyms: [],
    sheets: [
      {
        internalId: songId.length * 100,
        type: TypeEnum.DX,
        difficulty: DifficultyEnum.Master,
        level: '13',
        internalLevelValue: 13,
        noteDesigner: null,
        noteCounts: { tap: 1, hold: 1, slide: 1, touch: 1, break: 1, total: 5 },
        regions,
        isSpecial: false,
        version,
      },
    ],
  }
}

function entry(identity: SheetIdentity, achievementRate: number, best50Bucket?: 'b15' | 'b35'): RatingEntry {
  return providerEntry(identity, achievementRate, 'diving-fish', best50Bucket)
}

function providerEntry(
  identity: SheetIdentity,
  achievementRate: number,
  provider: NonNullable<RatingEntry['source']>['provider'],
  best50Bucket?: 'b15' | 'b35',
): RatingEntry {
  return {
    sheetId: formatSheetIdentity(identity),
    identity,
    achievementRate,
    source: best50Bucket ? { provider, best50Bucket } : undefined,
  }
}

function masterIdentity(songId: string): SheetIdentity {
  return { songId, type: TypeEnum.DX, difficulty: DifficultyEnum.Master }
}

describe('calculateRatingAward', () => {
  describe('rank thresholds', () => {
    it.each([
      { rate: 0, expectedRank: 'd', expectedCoeff: 0 },
      { rate: 10, expectedRank: 'd', expectedCoeff: 1.6 },
      { rate: 20, expectedRank: 'd', expectedCoeff: 3.2 },
      { rate: 30, expectedRank: 'd', expectedCoeff: 4.8 },
      { rate: 40, expectedRank: 'd', expectedCoeff: 6.4 },
      { rate: 50, expectedRank: 'c', expectedCoeff: 8 },
      { rate: 60, expectedRank: 'b', expectedCoeff: 9.6 },
      { rate: 70, expectedRank: 'bb', expectedCoeff: 11.2 },
      { rate: 75, expectedRank: 'bbb', expectedCoeff: 12.0 },
      { rate: 80, expectedRank: 'a', expectedCoeff: 13.6 },
      { rate: 90, expectedRank: 'aa', expectedCoeff: 15.2 },
      { rate: 94, expectedRank: 'aaa', expectedCoeff: 16.8 },
      { rate: 97, expectedRank: 's', expectedCoeff: 20 },
      { rate: 98, expectedRank: 'sp', expectedCoeff: 20.3 },
      { rate: 99, expectedRank: 'ss', expectedCoeff: 20.8 },
      { rate: 99.5, expectedRank: 'ssp', expectedCoeff: 21.1 },
      { rate: 100, expectedRank: 'sss', expectedCoeff: 21.6 },
      { rate: 100.5, expectedRank: 'sssp', expectedCoeff: 22.4 },
    ])(
      'achievement rate $rate -> rank $expectedRank (coeff $expectedCoeff)',
      ({ rate, expectedRank, expectedCoeff }) => {
        const result = calculateRatingAward(13.0, rate)
        expect(result.rank).toBe(expectedRank)
        expect(result.coefficient).toBe(expectedCoeff)
      },
    )
  })

  describe('formula: floor(coefficient * internalLevel * min(100.5, rate) / 100)', () => {
    it('calculates SSS+ for level 14.0 at 100.5%', () => {
      const result = calculateRatingAward(14.0, 100.5)
      expect(result.ratingAwardValue).toBe(315)
      expect(result.rank).toBe('sssp')
    })

    it('calculates SSS for level 13.0 at 100.4999%', () => {
      const result = calculateRatingAward(13.0, 100.4999)
      expect(result.ratingAwardValue).toBe(290)
      expect(result.rank).toBe('sss')
    })

    it('calculates S for level 12.5 at 97%', () => {
      const result = calculateRatingAward(12.5, 97)
      expect(result.ratingAwardValue).toBe(242)
      expect(result.rank).toBe('s')
    })

    it('calculates SS for level 13.7 at 99%', () => {
      const result = calculateRatingAward(13.7, 99)
      expect(result.ratingAwardValue).toBe(282)
      expect(result.rank).toBe('ss')
    })

    it('calculates AAA for level 10.0 at 95%', () => {
      const result = calculateRatingAward(10.0, 95)
      expect(result.ratingAwardValue).toBe(159)
      expect(result.rank).toBe('aaa')
    })
  })

  describe('achievement rate capping at 100.5', () => {
    it('caps achievement rate at 100.5 even if higher', () => {
      const at100_5 = calculateRatingAward(13.0, 100.5)
      const at101 = calculateRatingAward(13.0, 101)
      expect(at101.ratingAwardValue).toBe(at100_5.ratingAwardValue)
    })
  })

  describe('boundary conditions between ranks', () => {
    it('79.9999% is BBB, 80% is A', () => {
      const bbb = calculateRatingAward(13.0, 79.9999)
      const a = calculateRatingAward(13.0, 80)
      expect(bbb.rank).toBe('bbb')
      expect(a.rank).toBe('a')
      expect(bbb.coefficient).toBe(12.8)
      expect(a.coefficient).toBe(13.6)
    })

    it('96.9999% is AAA, 97% is S', () => {
      const aaa = calculateRatingAward(13.0, 96.9999)
      const s = calculateRatingAward(13.0, 97)
      expect(aaa.rank).toBe('aaa')
      expect(s.rank).toBe('s')
      expect(aaa.coefficient).toBe(17.6)
      expect(s.coefficient).toBe(20)
    })

    it('98.9999% is S+, 99% is SS', () => {
      const sp = calculateRatingAward(13.0, 98.9999)
      const ss = calculateRatingAward(13.0, 99)
      expect(sp.rank).toBe('sp')
      expect(ss.rank).toBe('ss')
    })

    it('99.9999% is SS+, 100% is SSS', () => {
      const ssp = calculateRatingAward(13.0, 99.9999)
      const sss = calculateRatingAward(13.0, 100)
      expect(ssp.rank).toBe('ssp')
      expect(sss.rank).toBe('sss')
    })

    it('100.4999% is SSS, 100.5% is SSS+', () => {
      const sss = calculateRatingAward(13.0, 100.4999)
      const sssp = calculateRatingAward(13.0, 100.5)
      expect(sss.rank).toBe('sss')
      expect(sssp.rank).toBe('sssp')
    })
  })

  describe('floor truncation', () => {
    it('always floors to integer', () => {
      const result = calculateRatingAward(13.5, 100.5)
      expect(result.ratingAwardValue).toBe(303)
      expect(Number.isInteger(result.ratingAwardValue)).toBe(true)
    })

    it('floors down, not rounds', () => {
      const result = calculateRatingAward(12.7, 97)
      expect(result.ratingAwardValue).toBe(246)
    })
  })

  describe('zero and low achievement rates', () => {
    it('returns 0 rating for 0% achievement', () => {
      const result = calculateRatingAward(14.0, 0)
      expect(result.ratingAwardValue).toBe(0)
      expect(result.rank).toBe('d')
      expect(result.coefficient).toBe(0)
    })

    it('returns 0 rating for very low achievement with coeff 0', () => {
      const result = calculateRatingAward(14.0, 5)
      expect(result.ratingAwardValue).toBe(0)
      expect(result.coefficient).toBe(0)
    })
  })

  describe('coefficient table is sorted', () => {
    it('achievement rate thresholds are monotonically increasing', () => {
      for (let i = 1; i < SCORE_COEFFICIENT_TABLE.length; i++) {
        expect(SCORE_COEFFICIENT_TABLE[i]![0]).toBeGreaterThan(SCORE_COEFFICIENT_TABLE[i - 1]![0])
      }
    })

    it('coefficients are monotonically increasing', () => {
      for (let i = 1; i < SCORE_COEFFICIENT_TABLE.length; i++) {
        expect(SCORE_COEFFICIENT_TABLE[i]![1]).toBeGreaterThanOrEqual(SCORE_COEFFICIENT_TABLE[i - 1]![1])
      }
    })
  })

  describe('known reference values', () => {
    it('level 14.0 SSS+ = 315', () => {
      expect(calculateRatingAward(14.0, 100.5).ratingAwardValue).toBe(315)
    })

    it('level 15.0 SSS+ = 337', () => {
      expect(calculateRatingAward(15.0, 100.5).ratingAwardValue).toBe(337)
    })

    it('level 13.0 SSS+ = 292', () => {
      expect(calculateRatingAward(13.0, 100.5).ratingAwardValue).toBe(292)
    })

    it('level 14.0 SS+ at 99.5% = 293', () => {
      expect(calculateRatingAward(14.0, 99.5).ratingAwardValue).toBe(293)
    })

    it('level 14.0 S at 97% = 271', () => {
      expect(calculateRatingAward(14.0, 97).ratingAwardValue).toBe(271)
    })
  })
})

describe('AP/AP+ bonus', () => {
  it('AP grants +1 rating bonus', () => {
    const without = calculateRatingAward(14.0, 100.5)
    const withAp = calculateRatingAward(14.0, 100.5, 'ap')
    expect(withAp.ratingAwardValue).toBe(without.ratingAwardValue + 1)
  })

  it('AP+ grants +1 rating bonus', () => {
    const without = calculateRatingAward(14.0, 100.5)
    const withApp = calculateRatingAward(14.0, 100.5, 'app')
    expect(withApp.ratingAwardValue).toBe(without.ratingAwardValue + 1)
  })

  it.each([null, 'fc', 'fcp'] as ComboFlag[])('comboFlag %s does NOT grant bonus', (flag) => {
    const without = calculateRatingAward(14.0, 100.5)
    const withFlag = calculateRatingAward(14.0, 100.5, flag)
    expect(withFlag.ratingAwardValue).toBe(without.ratingAwardValue)
  })

  it('undefined comboFlag does NOT grant bonus', () => {
    const without = calculateRatingAward(14.0, 100.5)
    const withUndefined = calculateRatingAward(14.0, 100.5, undefined)
    expect(withUndefined.ratingAwardValue).toBe(without.ratingAwardValue)
  })

  it('AP bonus applies after floor truncation', () => {
    const result = calculateRatingAward(14.0, 100.5, 'ap')
    expect(result.ratingAwardValue).toBe(316)
  })

  it('AP bonus applies even at 0% achievement', () => {
    const result = calculateRatingAward(14.0, 0, 'ap')
    expect(result.ratingAwardValue).toBe(1)
  })
})

describe('Best 50', () => {
  it('uses CiRCLE-era current and previous versions as b15 for regional catalogs', () => {
    const catalog = buildSongCatalog(makeData(), VersionEnum.CiRCLEPLUS)
    const result = calculateBest50({
      catalog,
      version: VersionEnum.CiRCLEPLUS,
      region: 'jp',
      entries: [
        entry(masterIdentity('current'), 100.5),
        entry(masterIdentity('previous'), 100.5),
        entry(masterIdentity('old'), 100.5),
      ],
    })

    expect(result.b15.map((e) => e.entry.identity.songId)).toEqual(['current', 'previous'])
    expect(result.b35.map((e) => e.entry.identity.songId)).toEqual(['old'])
    expect(result.statistics).toMatchObject({ b15Sum: 584, b35Sum: 292, b50Sum: 876 })
  })

  it('keeps non-current sheets in generic B35 calculations', () => {
    const catalog = buildSongCatalog(makeData(), VersionEnum.CiRCLE)
    const result = calculateBest50({
      catalog,
      version: VersionEnum.CiRCLE,
      region: '_generic',
      entries: [
        entry(masterIdentity('current'), 100.5),
        entry(masterIdentity('previous'), 100.5),
        entry(masterIdentity('old'), 100.5),
      ],
    })

    expect(result.b15.map((e) => e.entry.identity.songId)).toEqual(['previous'])
    expect(result.b35.map((e) => e.entry.identity.songId)).toEqual(['current', 'old'])
    expect(result.allEntries.find((e) => e.entry.identity.songId === 'current')?.bucket).toBe('b35')
  })

  it('honors provider-supplied Best 50 Bucket hints for cn region', () => {
    const catalog = buildSongCatalog(makeData(), VersionEnum.CiRCLEPLUS)
    const result = calculateBest50({
      catalog,
      version: VersionEnum.CiRCLEPLUS,
      region: 'cn',
      entries: [entry(masterIdentity('old'), 100.5, 'b15')],
    })

    expect(result.b15.map((e) => e.entry.identity.songId)).toEqual(['old'])
    expect(result.b35).toEqual([])
  })

  it('honors cn provider b35 hints over b15 version rules', () => {
    const catalog = buildSongCatalog(makeData(), VersionEnum.CiRCLEPLUS)
    const result = calculateBest50({
      catalog,
      version: VersionEnum.CiRCLEPLUS,
      region: 'cn',
      entries: [entry(masterIdentity('current'), 100.5, 'b35')],
    })

    expect(result.b15).toEqual([])
    expect(result.b35.map((e) => e.entry.identity.songId)).toEqual(['current'])
  })

  it('preserves authoritative cn Diving Fish bucket hints when deduping higher unhinted entries', () => {
    const catalog = buildSongCatalog(makeData(), VersionEnum.CiRCLEPLUS)
    const result = calculateBest50({
      catalog,
      version: VersionEnum.CiRCLEPLUS,
      region: 'cn',
      entries: [entry(masterIdentity('current'), 100.5), entry(masterIdentity('current'), 99.5, 'b35')],
    })

    expect(result.b15).toEqual([])
    expect(result.b35.map((e) => e.entry.identity.songId)).toEqual(['current'])
    expect(result.b35[0]?.entry.achievementRate).toBe(100.5)
    expect(result.b35[0]?.entry.source).toBeUndefined()
  })

  it('preserves authoritative cn Diving Fish bucket hints when deduping equal-rated unhinted entries', () => {
    const catalog = buildSongCatalog(makeData(), VersionEnum.CiRCLEPLUS)
    const result = calculateBest50({
      catalog,
      version: VersionEnum.CiRCLEPLUS,
      region: 'cn',
      entries: [entry(masterIdentity('current'), 100.5), entry(masterIdentity('current'), 100.5, 'b35')],
    })

    expect(result.b15).toEqual([])
    expect(result.b35.map((e) => e.entry.identity.songId)).toEqual(['current'])
    expect(result.b35[0]?.entry.achievementRate).toBe(100.5)
    expect(result.b35[0]?.entry.source).toBeUndefined()
  })

  it('preserves selected source provenance when duplicate Diving Fish hints force cn bucket', () => {
    const catalog = buildSongCatalog(makeData(), VersionEnum.CiRCLEPLUS)
    const identity = masterIdentity('current')
    const selectedEntry: RatingEntry = {
      sheetId: formatSheetIdentity(identity),
      identity,
      achievementRate: 100.5,
      source: {
        provider: 'lxns',
        providerId: 'lxns-current',
        providerSongName: 'LXNS Current',
      },
    }
    const result = calculateBest50({
      catalog,
      version: VersionEnum.CiRCLEPLUS,
      region: 'cn',
      entries: [selectedEntry, entry(identity, 99.5, 'b35')],
    })

    expect(result.b15).toEqual([])
    expect(result.b35.map((e) => e.entry.identity.songId)).toEqual(['current'])
    expect(result.b35[0]?.entry.achievementRate).toBe(100.5)
    expect(result.b35[0]?.entry.source).toEqual({
      provider: 'lxns',
      providerId: 'lxns-current',
      providerSongName: 'LXNS Current',
    })
  })

  it.each([
    {
      name: 'b35 before b15',
      hintedEntries: [entry(masterIdentity('current'), 97, 'b35'), entry(masterIdentity('current'), 99.5, 'b15')],
    },
    {
      name: 'b15 before b35',
      hintedEntries: [entry(masterIdentity('current'), 99.5, 'b15'), entry(masterIdentity('current'), 97, 'b35')],
    },
  ])('uses the highest-rated authoritative hint for duplicate cn rows: $name', ({ hintedEntries }) => {
    const catalog = buildSongCatalog(makeData(), VersionEnum.CiRCLEPLUS)
    const identity = masterIdentity('current')
    const selectedEntry: RatingEntry = {
      sheetId: formatSheetIdentity(identity),
      identity,
      achievementRate: 100.5,
      source: {
        provider: 'lxns',
        providerId: 'lxns-current',
        providerSongName: 'LXNS Current',
      },
    }
    const result = calculateBest50({
      catalog,
      version: VersionEnum.CiRCLEPLUS,
      region: 'cn',
      entries: [selectedEntry, ...hintedEntries],
    })

    expect(result.b15.map((e) => e.entry.identity.songId)).toEqual(['current'])
    expect(result.b35).toEqual([])
    expect(result.b15[0]?.entry.achievementRate).toBe(100.5)
    expect(result.b15[0]?.entry.source).toEqual({
      provider: 'lxns',
      providerId: 'lxns-current',
      providerSongName: 'LXNS Current',
    })
  })

  it.each([
    {
      name: 'b35 before b15',
      hintedEntries: [entry(masterIdentity('current'), 99.5, 'b35'), entry(masterIdentity('current'), 99.5, 'b15')],
    },
    {
      name: 'b15 before b35',
      hintedEntries: [entry(masterIdentity('current'), 99.5, 'b15'), entry(masterIdentity('current'), 99.5, 'b35')],
    },
  ])('prefers b15 when duplicate cn authoritative hints are tied: $name', ({ hintedEntries }) => {
    const catalog = buildSongCatalog(makeData(), VersionEnum.CiRCLEPLUS)
    const identity = masterIdentity('current')
    const selectedEntry: RatingEntry = {
      sheetId: formatSheetIdentity(identity),
      identity,
      achievementRate: 100.5,
      source: { provider: 'lxns', providerId: 'lxns-current' },
    }
    const result = calculateBest50({
      catalog,
      version: VersionEnum.CiRCLEPLUS,
      region: 'cn',
      entries: [selectedEntry, ...hintedEntries],
    })

    expect(result.b15.map((e) => e.entry.identity.songId)).toEqual(['current'])
    expect(result.b35).toEqual([])
    expect(result.b15[0]?.entry.source).toEqual({ provider: 'lxns', providerId: 'lxns-current' })
  })

  it('ignores cn provider hints from providers other than Diving Fish', () => {
    const catalog = buildSongCatalog(makeData(), VersionEnum.CiRCLEPLUS)
    const result = calculateBest50({
      catalog,
      version: VersionEnum.CiRCLEPLUS,
      region: 'cn',
      entries: [providerEntry(masterIdentity('current'), 100.5, 'aqua-dx', 'b35')],
    })

    expect(result.b15.map((e) => e.entry.identity.songId)).toEqual(['current'])
    expect(result.b35).toEqual([])
  })

  it('ignores provider hints outside cn region', () => {
    const catalog = buildSongCatalog(makeData(), VersionEnum.CiRCLEPLUS)
    const result = calculateBest50({
      catalog,
      version: VersionEnum.CiRCLEPLUS,
      region: 'jp',
      entries: [entry(masterIdentity('old'), 100.5, 'b15')],
    })

    expect(result.b15).toEqual([])
    expect(result.b35.map((e) => e.entry.identity.songId)).toEqual(['old'])
  })

  it('collapses duplicate sheet entries before bucket selection', () => {
    const catalog = buildSongCatalog(makeData(), VersionEnum.CiRCLEPLUS)
    const result = calculateBest50({
      catalog,
      version: VersionEnum.CiRCLEPLUS,
      region: 'jp',
      entries: Array.from({ length: 20 }, (_, index) => entry(masterIdentity('current'), 80 + index)),
    })

    expect(result.b15).toHaveLength(1)
    expect(result.b15[0]?.entry.achievementRate).toBe(99)
    expect(new Set(result.b15.map((e) => e.entry.sheetId)).size).toBe(result.b15.length)
  })

  it('caps b15 at 15 and b35 at 35 for unique entries', () => {
    const data: DXData = {
      ...makeData(),
      songs: [
        ...Array.from({ length: 20 }, (_, index) =>
          makeSong(`current-${index}`, VersionEnum.CiRCLEPLUS, { jp: true, intl: true, cn: true }),
        ),
        ...Array.from({ length: 40 }, (_, index) =>
          makeSong(`old-${index}`, VersionEnum.PRiSMPLUS, { jp: true, intl: true, cn: true }),
        ),
      ],
    }
    const catalog = buildSongCatalog(data, VersionEnum.CiRCLEPLUS)
    const result = calculateBest50({
      catalog,
      version: VersionEnum.CiRCLEPLUS,
      region: 'jp',
      entries: data.songs.map((song, index) => entry(masterIdentity(song.songId), 100.5 - index * 0.01)),
    })

    expect(result.b15).toHaveLength(15)
    expect(result.b35).toHaveLength(35)
    expect(new Set(result.b15.map((e) => e.entry.sheetId)).size).toBe(15)
    expect(new Set(result.b35.map((e) => e.entry.sheetId)).size).toBe(35)
  })

  it('excludes sheets unavailable in the selected region', () => {
    const catalog = buildSongCatalog(makeData(), VersionEnum.CiRCLEPLUS)
    const result = calculateBest50({
      catalog,
      version: VersionEnum.CiRCLEPLUS,
      region: 'intl',
      entries: [entry(masterIdentity('old'), 100.5)],
    })

    expect(result.b15).toEqual([])
    expect(result.b35).toEqual([])
  })
})