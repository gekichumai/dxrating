import { CategoryEnum, DifficultyEnum, TypeEnum, VersionEnum, type DXData } from '@gekichumai/dxdata'
import { describe, expect, it } from 'vitest'
import {
  normalizeAquaDxRows,
  normalizeAquaSqliteRows,
  normalizeDivingFishRows,
  normalizeLxnsScores,
  normalizeMaimaiNetRecords,
  normalizeMuNetRows,
} from '../import-normalizers.js'
import { buildSongCatalog } from '../song-catalog.js'

const data: DXData = {
  updateTime: '2026-05-17T00:00:00.000Z',
  categories: [],
  versions: [],
  types: [],
  difficulties: [],
  regions: [],
  songs: [
    {
      songId: 'Song A',
      title: 'Song A',
      artist: 'Artist',
      bpm: 120,
      category: CategoryEnum.Maimai,
      imageName: 'song-a',
      isNew: false,
      isLocked: false,
      searchAcronyms: [],
      sheets: [
        {
          internalId: 10001,
          type: TypeEnum.DX,
          difficulty: DifficultyEnum.Master,
          level: '13',
          internalLevelValue: 13,
          noteDesigner: null,
          noteCounts: { tap: 1, hold: 1, slide: 1, touch: 1, break: 1, total: 5 },
          regions: { jp: true, intl: true, cn: true },
          isSpecial: false,
          version: VersionEnum.CiRCLEPLUS,
        },
      ],
    },
  ],
}

const catalog = buildSongCatalog(data, VersionEnum.CiRCLEPLUS)

describe('Rating Import normalizers', () => {
  it('normalizes LXNS scores and warns on UTAGE or missing sheets', () => {
    const result = normalizeLxnsScores(catalog, [
      {
        id: 1,
        songName: 'Song A',
        level: '13',
        levelIndex: 3,
        achievements: 100.5,
        fc: 'ap',
        fs: 'fsdp',
        type: 'dx',
        dxScore: 1000,
      },
      {
        id: 2,
        songName: 'Missing',
        level: '13',
        levelIndex: 3,
        achievements: 99,
        fc: null,
        fs: null,
        type: 'dx',
      },
    ])

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.sheetId).toBe('Song A__dxrt__dx__dxrt__master')
    expect(result.entries[0]!.comboFlag).toBe('ap')
    expect(result.entries[0]!.syncFlag).toBe('fsdp')
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]!.code).toBe('sheet-not-found')
  })

  it('dedupes by Sheet Identity and keeps highest achievement', () => {
    const result = normalizeMaimaiNetRecords(catalog, [
      {
        sheet: { songId: 'Song A', type: 'dx', difficulty: 'master' },
        achievement: { rate: 990000, dxScore: { achieved: 1, total: 2 }, flags: [] },
      },
      {
        sheet: { songId: 'Song A', type: 'dx', difficulty: 'master' },
        achievement: { rate: 1005000, dxScore: { achieved: 1, total: 2 }, flags: ['allPerfect'] },
      },
    ])

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.achievementRate).toBe(100.5)
    expect(result.entries[0]!.comboFlag).toBe('ap')
  })

  it('normalizes MaimaiNET visible titles when song id differs from title', () => {
    const titleCatalog = buildSongCatalog(
      {
        ...data,
        songs: [
          {
            ...data.songs[0]!,
            songId: 'internal-song-a',
            title: 'Visible Song A',
          },
        ],
      },
      VersionEnum.CiRCLEPLUS,
    )

    const result = normalizeMaimaiNetRecords(titleCatalog, [
      {
        sheet: { songId: 'Visible Song A', type: 'dx', difficulty: 'master' },
        achievement: { rate: 1005000, dxScore: { achieved: 1, total: 2 }, flags: [] },
      },
    ])

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.identity.songId).toBe('internal-song-a')
  })

  it('warns when a MaimaiNET visible title is ambiguous', () => {
    const ambiguousCatalog = buildSongCatalog(
      {
        ...data,
        songs: [
          {
            ...data.songs[0]!,
            songId: 'song-a-1',
            title: 'Shared Visible Title',
          },
          {
            ...data.songs[0]!,
            songId: 'song-a-2',
            title: 'Shared Visible Title',
            sheets: [{ ...data.songs[0]!.sheets[0]!, internalId: 10002 }],
          },
        ],
      },
      VersionEnum.CiRCLEPLUS,
    )

    const result = normalizeMaimaiNetRecords(ambiguousCatalog, [
      {
        sheet: { songId: 'Shared Visible Title', type: 'dx', difficulty: 'master' },
        achievement: { rate: 1005000, dxScore: { achieved: 1, total: 2 }, flags: [] },
      },
    ])

    expect(result.entries).toHaveLength(0)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]!.code).toBe('sheet-not-found')
  })

  it('dedupes equal achievements by better combo and sync flags regardless of order', () => {
    const fcThenAp = normalizeLxnsScores(catalog, [
      {
        id: 1,
        songName: 'Song A',
        level: '13',
        levelIndex: 3,
        achievements: 100.5,
        fc: 'fc',
        fs: 'fs',
        type: 'dx',
      },
      {
        id: 2,
        songName: 'Song A',
        level: '13',
        levelIndex: 3,
        achievements: 100.5,
        fc: 'ap',
        fs: 'fsdp',
        type: 'dx',
      },
    ])
    const apThenFc = normalizeLxnsScores(catalog, [
      {
        id: 1,
        songName: 'Song A',
        level: '13',
        levelIndex: 3,
        achievements: 100.5,
        fc: 'ap',
        fs: 'fsdp',
        type: 'dx',
      },
      {
        id: 2,
        songName: 'Song A',
        level: '13',
        levelIndex: 3,
        achievements: 100.5,
        fc: 'fc',
        fs: 'fs',
        type: 'dx',
      },
    ])

    expect(fcThenAp.entries).toHaveLength(1)
    expect(fcThenAp.entries[0]!.comboFlag).toBe('ap')
    expect(fcThenAp.entries[0]!.syncFlag).toBe('fsdp')
    expect(apThenFc.entries).toHaveLength(1)
    expect(apThenFc.entries[0]!.comboFlag).toBe('ap')
    expect(apThenFc.entries[0]!.syncFlag).toBe('fsdp')
  })

  it('preserves Diving Fish bucket hints when a better duplicate lacks the hint', () => {
    const result = normalizeDivingFishRows(catalog, [
      {
        bucket: 'b35',
        achievements: 100,
        fc: 'fc',
        fs: null,
        level_index: 3,
        title: 'Song A',
        type: 'dx',
        song_id: 123,
      },
      {
        achievements: 100.5,
        fc: 'ap',
        fs: 'fsdp',
        level_index: 3,
        title: 'Song A',
        type: 'dx',
        song_id: 123,
      },
    ])

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.achievementRate).toBe(100.5)
    expect(result.entries[0]!.comboFlag).toBe('ap')
    expect(result.entries[0]!.syncFlag).toBe('fsdp')
    expect(result.entries[0]!.source?.best50Bucket).toBe('b35')
  })

  it('warns and skips invalid achievements across providers', () => {
    const lxns = normalizeLxnsScores(catalog, [
      {
        id: 1,
        songName: 'Song A',
        level: '13',
        levelIndex: 3,
        achievements: Infinity,
        fc: null,
        fs: null,
        type: 'dx',
      },
    ])
    const maimaiNet = normalizeMaimaiNetRecords(catalog, [
      {
        sheet: { songId: 'Song A', type: 'dx', difficulty: 'master' },
        achievement: { rate: 1006000, dxScore: { achieved: 1, total: 2 }, flags: [] },
      },
    ])
    const divingFish = normalizeDivingFishRows(catalog, [
      {
        bucket: 'b15',
        achievements: -1,
        fc: null,
        fs: null,
        level_index: 3,
        title: 'Song A',
        type: 'dx',
        song_id: 123,
      },
    ])
    const aquaDx = normalizeAquaDxRows(catalog, [{ musicId: '99999', level: 3, achievement: Number.NaN }], {
      '99999': { name: 'Song A' },
    })

    for (const result of [lxns, maimaiNet, divingFish, aquaDx]) {
      expect(result.entries).toHaveLength(0)
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0]!.code).toBe('invalid-achievement')
    }
  })

  it('keeps Diving Fish Best 50 Bucket hints', () => {
    const result = normalizeDivingFishRows(catalog, [
      {
        bucket: 'b15',
        achievements: 100.5,
        fc: 'ap',
        fs: null,
        level_index: 3,
        title: 'Song A',
        type: 'dx',
        song_id: 123,
      },
    ])

    expect(result.entries[0]!.source?.best50Bucket).toBe('b15')
  })

  it('normalizes AquaDX rows through provider music id maps', () => {
    const result = normalizeAquaDxRows(catalog, [{ musicId: '99999', level: 3, achievement: 1005000 }], {
      '99999': { name: 'Song A' },
    })

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.achievementRate).toBe(100.5)
  })

  it('normalizes MuNET rows through zero-based level indexes', () => {
    const result = normalizeMuNetRows(catalog, [{ musicId: 99999, level: 3, achievement: 1005000 }], {
      '99999': { name: 'Song A' },
    })

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.identity.difficulty).toBe(DifficultyEnum.Master)
  })

  it('skips AquaDX rows with provider map version 24000 before internal id fallback', () => {
    const result = normalizeAquaDxRows(catalog, [{ musicId: 10001, level: 3, achievement: 1005000 }], {
      '10001': { name: 'Song A', ver: '24000' },
    })

    expect(result.entries).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })

  it('skips MuNET rows with provider map version 24000 before internal id fallback', () => {
    const result = normalizeMuNetRows(catalog, [{ musicId: 10001, level: 3, achievement: 1005000 }], {
      '10001': { name: 'Song A', ver: '24000' },
    })

    expect(result.entries).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })

  it('normalizes Aqua SQLite rows by selected user and internal id', () => {
    const result = normalizeAquaSqliteRows(catalog, {
      selectedUserId: 10,
      gameplays: [
        {
          id: 1,
          music_id: 10001,
          level: DifficultyEnum.Master,
          achievement: 1005000,
          user_id: 10,
          type: TypeEnum.DX,
        },
        {
          id: 2,
          music_id: 10001,
          level: DifficultyEnum.Master,
          achievement: 990000,
          user_id: 11,
          type: TypeEnum.DX,
        },
      ],
    })

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.achievementRate).toBe(100.5)
  })

  it('normalizes Aqua SQLite combo and sync statuses when present', () => {
    const result = normalizeAquaSqliteRows(catalog, {
      selectedUserId: 10,
      gameplays: [
        {
          id: 1,
          music_id: 10001,
          level: DifficultyEnum.Master,
          achievement: 1005000,
          user_id: 10,
          type: TypeEnum.DX,
          combo_status: 4,
          sync_status: 5,
        },
      ],
    })

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.comboFlag).toBe('app')
    expect(result.entries[0]!.syncFlag).toBe('fsdp')
  })
})