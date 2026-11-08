import { CategoryEnum, DifficultyEnum, ServerEnum, TypeEnum, VersionEnum } from '@gekichumai/dxdata'
import { describe, expect, it } from 'vitest'
import {
  normalizeAquaDxRows,
  normalizeAquaSqliteRows,
  normalizeDivingFishRows,
  normalizeLxnsScores,
  normalizeMaimaiNetRecords,
  normalizeMuNetRows,
  difficultyFromGameLevel,
  ratingEntryAchievementInt,
  withAchievementInt,
} from '../import-normalizers'
import { buildSongCatalog, type SongCatalogSource } from '../song-catalog'

const SONG_A_MASTER = 'dsht_23456789ab'

const data: SongCatalogSource = {
  versions: [],
  songs: [
    {
      id: 'dsng_23456789ab',
      title: 'Song A',
      version: VersionEnum.CiRCLEPLUS,
      artist: 'Artist',
      bpm: 120,
      category: CategoryEnum.Maimai,
      imageName: 'song-a',
      isNew: false,
      isLocked: false,
      searchAcronyms: [],
      sheets: [
        {
          id: SONG_A_MASTER,
          internalId: 10001,
          type: TypeEnum.DX,
          difficulty: DifficultyEnum.Master,
          level: '13',
          internalLevelValue: 13,
          noteCounts: { tap: 1, hold: 1, slide: 1, touch: 1, break: 1, total: 5 },
          serverIds: [ServerEnum.JP, ServerEnum.INTL, ServerEnum.USA, ServerEnum.CN],
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
    expect(result.entries[0]!.sheetId).toBe(SONG_A_MASTER)
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

  it('keeps MaimaiNET SSS+ achievements above the rating cap', () => {
    const result = normalizeMaimaiNetRecords(catalog, [
      {
        sheet: { songId: 'Song A', type: 'dx', difficulty: 'master' },
        achievement: { rate: 1008427, dxScore: { achieved: 1, total: 2 }, flags: ['allPerfect'] },
      },
    ])

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.achievementRate).toBe(100.8427)
    expect(result.entries[0]!.comboFlag).toBe('ap')
  })

  it('normalizes MaimaiNET visible titles when song id differs from title', () => {
    const titleCatalog = buildSongCatalog(
      {
        ...data,
        songs: [
          {
            ...data.songs[0]!,
            id: 'internal-song-a',
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
            id: 'song-a-1',
            title: 'Shared Visible Title',
          },
          {
            ...data.songs[0]!,
            id: 'song-a-2',
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
        achievement: { rate: 1011000, dxScore: { achieved: 1, total: 2 }, flags: [] },
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

  it('resolves Diving Fish ambiguous titles by provider song id before title fallback', () => {
    const ambiguousCatalog = buildSongCatalog(
      {
        ...data,
        songs: [
          {
            ...data.songs[0]!,
            id: 'link-original',
            title: 'Link',
            sheets: [{ ...data.songs[0]!.sheets[0]!, internalId: 383, type: TypeEnum.STD }],
          },
          {
            ...data.songs[0]!,
            id: 'link-cover',
            title: 'Link',
            sheets: [{ ...data.songs[0]!.sheets[0]!, internalId: 384, type: TypeEnum.STD }],
          },
        ],
      },
      VersionEnum.CiRCLEPLUS,
    )

    const result = normalizeDivingFishRows(ambiguousCatalog, [
      {
        bucket: 'b35',
        achievements: 100.5,
        fc: null,
        fs: null,
        level_index: 3,
        title: 'Link',
        type: 'SD',
        song_id: 383,
      },
    ])

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.identity.songId).toBe('link-original')
    expect(result.warnings).toHaveLength(0)
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

  it('resolves provider map names of songs sharing a title through their legacy song ID', () => {
    const linkCatalog = buildSongCatalog(
      {
        ...data,
        songs: [
          {
            ...data.songs[0]!,
            id: 'dsng_linkoriginl',
            title: 'Link',
            sheets: [
              { ...data.songs[0]!.sheets[0]!, id: 'dsht_linkoriginl', type: TypeEnum.STD, internalId: undefined },
            ],
          },
          {
            ...data.songs[0]!,
            id: 'dsng_linkcoverxx',
            title: 'Link',
            sheets: [
              { ...data.songs[0]!.sheets[0]!, id: 'dsht_linkcoverxx', type: TypeEnum.STD, internalId: undefined },
            ],
          },
        ],
      },
      VersionEnum.CiRCLEPLUS,
    )
    const map = { 'not-numeric': { name: 'Link' } }
    const rows = [{ musicId: 'not-numeric', level: 3, achievement: 1005000 }]

    expect(normalizeAquaDxRows(linkCatalog, rows, map).entries).toHaveLength(0)
    expect(
      normalizeAquaDxRows(linkCatalog, rows, map, { Link: 'dsng_linkoriginl', 'Link (2)': 'dsng_linkcoverxx' })
        .entries[0]?.sheetId,
    ).toBe('dsht_linkoriginl')
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
          sync_status: 4,
        },
      ],
    })

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.comboFlag).toBe('app')
    expect(result.entries[0]!.syncFlag).toBe('fsdp')
  })

  it('adds integer achievements without changing the normalizer output', () => {
    const lxns = normalizeLxnsScores(catalog, [
      { id: 1, songName: 'Song A', level: '13', levelIndex: 3, achievements: 97.12345, fc: null, fs: null, type: 'dx' },
    ])
    expect(lxns.entries[0]).not.toHaveProperty('achievementInt')
    expect(lxns.entries[0]!.achievementRate).toBe(97.12345)

    const withInt = withAchievementInt(lxns)
    expect(withInt.entries).toEqual([{ ...lxns.entries[0], achievementInt: 971234 }])
    expect(withInt.warnings).toEqual(lxns.warnings)

    const net = normalizeMaimaiNetRecords(catalog, [
      {
        sheet: { songId: 'Song A', type: 'dx', difficulty: 'master' },
        achievement: { rate: 1008427, dxScore: { achieved: 1, total: 2 }, flags: [] },
      },
    ])
    expect(withAchievementInt(net).entries[0]!.achievementInt).toBe(1008427)
    expect(ratingEntryAchievementInt({ achievementRate: 100.5432 })).toBe(1005432)
  })

  it('turns entries without a valid integer achievement into warnings', () => {
    const result = withAchievementInt({
      entries: [
        {
          sheetId: SONG_A_MASTER,
          identity: { songId: 'dsng_23456789ab', type: TypeEnum.DX, difficulty: DifficultyEnum.Master },
          achievementRate: 101.5,
          source: { provider: 'lxns' },
        },
      ],
      warnings: [],
    })
    expect(result.entries).toEqual([])
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]!.code).toBe('invalid-achievement')
  })

  it('keeps the DX score a provider reports, and leaves it out when there is none', () => {
    const divingFish = normalizeDivingFishRows(catalog, [
      {
        achievements: 100.5,
        fc: null,
        fs: null,
        level_index: 3,
        title: 'Song A',
        type: 'dx',
        song_id: 123,
        dxScore: 1234,
      },
    ])
    const lxns = normalizeLxnsScores(catalog, [
      {
        id: 1,
        songName: 'Song A',
        level: '13',
        levelIndex: 3,
        achievements: 100.5,
        fc: null,
        fs: null,
        type: 'dx',
        dxScore: 1000,
      },
    ])
    const net = normalizeMaimaiNetRecords(catalog, [
      {
        sheet: { songId: 'Song A', type: 'dx', difficulty: 'master' },
        achievement: { rate: 1005000, dxScore: { achieved: 987, total: 1200 }, flags: [] },
      },
    ])
    const withoutDxScore = normalizeDivingFishRows(catalog, [
      { achievements: 100.5, fc: null, fs: null, level_index: 3, title: 'Song A', type: 'dx', song_id: 123 },
    ])
    const invalidDxScore = normalizeDivingFishRows(catalog, [
      {
        achievements: 100.5,
        fc: null,
        fs: null,
        level_index: 3,
        title: 'Song A',
        type: 'dx',
        song_id: 123,
        dxScore: -1,
      },
    ])

    expect(divingFish.entries[0]!.dxScore).toBe(1234)
    expect(lxns.entries[0]!.dxScore).toBe(1000)
    expect(net.entries[0]!.dxScore).toBe(987)
    expect(withoutDxScore.entries[0]).not.toHaveProperty('dxScore')
    expect(invalidDxScore.entries[0]).not.toHaveProperty('dxScore')
  })
})
// Game enums, as documented in gekichumai/meta#54 and gekichumai/meta#55 (maimai DX 1.70)
const GAME_LEVELS: [number, DifficultyEnum][] = [
  [0, DifficultyEnum.Basic],
  [1, DifficultyEnum.Advanced],
  [2, DifficultyEnum.Expert],
  [3, DifficultyEnum.Master],
  [4, DifficultyEnum.ReMaster],
]
// `PlayComboflagID`
const GAME_COMBO_STATUSES: [number, string | null][] = [
  [0, null],
  [1, 'fc'],
  [2, 'fcp'],
  [3, 'ap'],
  [4, 'app'],
]
// `PlaySyncflagID`: SYNC PLAY is 5, not 1
const GAME_SYNC_STATUSES: [number, string | null][] = [
  [0, null],
  [1, 'fs'],
  [2, 'fsp'],
  [3, 'fsd'],
  [4, 'fsdp'],
  [5, 'sync'],
]

const allDifficultiesCatalog = buildSongCatalog(
  {
    ...data,
    songs: [
      {
        ...data.songs[0]!,
        sheets: GAME_LEVELS.map(([level, difficulty]) => ({
          ...data.songs[0]!.sheets[0]!,
          id: `dsht_level${level}xxxx`,
          difficulty,
        })),
      },
    ],
  },
  VersionEnum.CiRCLEPLUS,
)
const musicIdMap = { '10001': { name: 'Song A' } }

describe('game enum mappings (gekichumai/meta#54, gekichumai/meta#55)', () => {
  it.each(GAME_LEVELS)('maps MusicDifficultyID %i to %s', (level, difficulty) => {
    expect(difficultyFromGameLevel(level)).toBe(difficulty)
  })

  it.each([-1, 5, 6, 1.5, Number.NaN])('maps no difficulty to level %s (5 and up is UTAGE)', (level) => {
    expect(difficultyFromGameLevel(level)).toBeUndefined()
  })

  it.each(GAME_LEVELS)('imports AquaDX level %i onto the %s chart', (level, difficulty) => {
    const result = normalizeAquaDxRows(
      allDifficultiesCatalog,
      [{ musicId: 10001, level, achievement: 1005000 }],
      musicIdMap,
    )

    expect(result.warnings).toEqual([])
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.identity.difficulty).toBe(difficulty)
    expect(result.entries[0]!.sheetId).toBe(`dsht_level${level}xxxx`)
  })

  it('imports every AquaDX difficulty of one song as its own entry', () => {
    const result = normalizeAquaDxRows(
      allDifficultiesCatalog,
      GAME_LEVELS.map(([level]) => ({ musicId: 10001, level, achievement: 1000000 + level })),
      musicIdMap,
    )

    expect(result.entries.map((entry) => entry.identity.difficulty).sort()).toEqual(
      GAME_LEVELS.map(([, difficulty]) => difficulty).sort(),
    )
  })

  it('warns on an AquaDX UTAGE level instead of mapping it to a chart', () => {
    const result = normalizeAquaDxRows(
      allDifficultiesCatalog,
      [{ musicId: 10001, level: 5, achievement: 1005000 }],
      musicIdMap,
    )

    expect(result.entries).toEqual([])
    expect(result.warnings.map((warning) => warning.code)).toEqual(['invalid-difficulty'])
  })

  it.each(GAME_LEVELS)('imports MuNET level %i onto the %s chart', (level, difficulty) => {
    const result = normalizeMuNetRows(
      allDifficultiesCatalog,
      [{ musicId: 10001, level, achievement: 1005000 }],
      musicIdMap,
    )

    expect(result.entries[0]?.identity.difficulty).toBe(difficulty)
  })

  it.each(GAME_COMBO_STATUSES)('maps AquaDX comboStatus %i to %s', (comboStatus, flag) => {
    const result = normalizeAquaDxRows(
      allDifficultiesCatalog,
      [{ musicId: 10001, level: 3, achievement: 1005000, comboStatus }],
      musicIdMap,
    )

    expect(result.entries[0]!.comboFlag).toBe(flag)
  })

  it.each(GAME_SYNC_STATUSES)('maps AquaDX syncStatus %i to %s', (syncStatus, flag) => {
    const result = normalizeAquaDxRows(
      allDifficultiesCatalog,
      [{ musicId: 10001, level: 3, achievement: 1005000, syncStatus }],
      musicIdMap,
    )

    expect(result.entries[0]!.syncFlag).toBe(flag)
  })

  it('leaves AquaDX lamps empty when the export has no combo or sync status', () => {
    const result = normalizeAquaDxRows(
      allDifficultiesCatalog,
      [{ musicId: 10001, level: 3, achievement: 1005000 }],
      musicIdMap,
    )

    expect(result.entries[0]!.comboFlag).toBeNull()
    expect(result.entries[0]!.syncFlag).toBeNull()
  })

  const aquaSqliteRow = (overrides: { combo_status?: number; sync_status?: number }) =>
    normalizeAquaSqliteRows(allDifficultiesCatalog, {
      selectedUserId: 10,
      gameplays: [
        {
          id: 1,
          music_id: 10001,
          level: DifficultyEnum.Master,
          achievement: 1005000,
          user_id: 10,
          type: TypeEnum.DX,
          ...overrides,
        },
      ],
    }).entries[0]!

  it.each(GAME_COMBO_STATUSES)('maps Aqua SQLite combo_status %i to %s', (combo_status, flag) => {
    expect(aquaSqliteRow({ combo_status }).comboFlag).toBe(flag)
  })

  it.each(GAME_SYNC_STATUSES)('maps Aqua SQLite sync_status %i to %s', (sync_status, flag) => {
    expect(aquaSqliteRow({ sync_status }).syncFlag).toBe(flag)
  })

  it.each([-1, 6, 7])('maps an unknown status %i to no lamp', (status) => {
    const entry = aquaSqliteRow({ combo_status: status, sync_status: status })
    expect(entry.comboFlag).toBeNull()
    expect(entry.syncFlag).toBeNull()
  })

  it('keeps a SYNC PLAY record below FDX+ when merging duplicates', () => {
    const result = normalizeAquaSqliteRows(allDifficultiesCatalog, {
      selectedUserId: 10,
      gameplays: [5, 4].map((sync_status, index) => ({
        id: index,
        music_id: 10001,
        level: DifficultyEnum.Master,
        achievement: 1005000,
        user_id: 10,
        type: TypeEnum.DX,
        sync_status,
      })),
    })

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.syncFlag).toBe('fsdp')
  })
})