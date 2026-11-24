import { CategoryEnum, DifficultyEnum, ServerEnum, TypeEnum, VersionEnum, type Sheet } from '@gekichumai/dxdata'
import { describe, expect, it } from 'vitest'
import {
  normalizeAquaDxRows,
  normalizeDivingFishRows,
  normalizeLxnsScores,
  normalizeMaimaiNetRecords,
} from '../import-normalizers'
import {
  ambiguousInternalIds,
  catalogNoteCountsApply,
  forProvider,
  scoreValidationChartOf,
  validateScore,
  type ScoreValidationChart,
} from '../score-validation'
import { buildSongCatalog, type SongCatalogSource } from '../song-catalog'

/** A chart of 500 notes: maximum DX score 1500, a PERFECT on every note gives 1000 */
const CHART: ScoreValidationChart = { isUtage: false, maxDxScore: 1500 }
const UNKNOWN_NOTES: ScoreValidationChart = { isUtage: false, maxDxScore: null }
const UTAGE: ScoreValidationChart = { isUtage: true, maxDxScore: null }

describe('validateScore', () => {
  it('accepts possible records', () => {
    expect(validateScore({ achievement: 1005000, comboFlag: null, syncFlag: null }, CHART)).toEqual([])
    expect(validateScore({ achievement: 1010000, comboFlag: 'app', syncFlag: 'fsdp', dxScore: 1500 }, CHART)).toEqual(
      [],
    )
    expect(validateScore({ achievement: 1007000, comboFlag: 'ap', syncFlag: 'fsd', dxScore: 1400 }, CHART)).toEqual([])
    expect(validateScore({ achievement: 0, comboFlag: null, syncFlag: null, playCount: 0 }, CHART)).toEqual([])
  })

  it('R1: above 101% on a rating chart', () => {
    expect(validateScore({ achievement: 1010001 }, CHART)).toEqual(['R1'])
    expect(validateScore({ achievement: 1010000 }, CHART)).toEqual([])
  })

  it('R1 trap: UTAGE charts reach 202%', () => {
    expect(validateScore({ achievement: 2020000 }, UTAGE)).toEqual([])
    expect(validateScore({ achievement: 1500000, comboFlag: 'app' }, UTAGE)).toEqual([])
    expect(validateScore({ achievement: 2020001 }, UTAGE)).toEqual(['R1'])
  })

  it('R2: unknown combo, sync or difficulty values', () => {
    expect(validateScore({ achievement: 1000000, comboFlag: 'fdx' }, CHART)).toEqual(['R2'])
    expect(validateScore({ achievement: 1000000, comboFlag: 7 }, CHART)).toEqual(['R2'])
    expect(validateScore({ achievement: 1000000, syncFlag: 'fdx' }, CHART)).toEqual(['R2'])
    expect(validateScore({ achievement: 1000000, difficulty: 'extreme' }, CHART)).toEqual(['R2'])
    expect(validateScore({ achievement: 1000000, difficulty: DifficultyEnum.ReMaster }, CHART)).toEqual([])
    // a 【…】 label is a difficulty on UTAGE only
    expect(validateScore({ achievement: 1000000, difficulty: '【宴】' }, CHART)).toEqual(['R2'])
    expect(validateScore({ achievement: 1000000, difficulty: '【宴】' }, UTAGE)).toEqual([])
  })

  it('R3: DX score above the maximum', () => {
    expect(validateScore({ achievement: 1000000, dxScore: 1501 }, CHART)).toEqual(['R3'])
  })

  it('R4: the maximum DX score needs AP+ and 101%', () => {
    expect(validateScore({ achievement: 1010000, comboFlag: 'ap', dxScore: 1500 }, CHART)).toEqual(['R4'])
    expect(validateScore({ achievement: 1009999, comboFlag: 'app', dxScore: 1500 }, CHART)).toEqual(['R4', 'R5'])
  })

  it('R4 trap: AP+ does not imply the maximum DX score', () => {
    // a non-critical PERFECT on a tap still gives 101%
    expect(validateScore({ achievement: 1010000, comboFlag: 'app', dxScore: 1499 }, CHART)).toEqual([])
    expect(validateScore({ achievement: 1010000, comboFlag: 'app', dxScore: 1000 }, CHART)).toEqual([])
  })

  it('R5: AP+ below 101%', () => {
    expect(validateScore({ achievement: 1009999, comboFlag: 'app' }, CHART)).toEqual(['R5'])
  })

  it('R6: AP below 100.5%', () => {
    expect(validateScore({ achievement: 1004999, comboFlag: 'ap' }, CHART)).toEqual(['R6'])
    expect(validateScore({ achievement: 1005000, comboFlag: 'ap' }, CHART)).toEqual([])
    // FC+ and below say nothing about the achievement
    expect(validateScore({ achievement: 900000, comboFlag: 'fcp' }, CHART)).toEqual([])
  })

  it('R7: AP or AP+ needs 2 DX score per note', () => {
    expect(validateScore({ achievement: 1007000, comboFlag: 'ap', dxScore: 999 }, CHART)).toEqual(['R7'])
    expect(validateScore({ achievement: 1010000, comboFlag: 'app', dxScore: 999 }, CHART)).toEqual(['R7'])
    expect(validateScore({ achievement: 1007000, comboFlag: 'ap', dxScore: 1000 }, CHART)).toEqual([])
    // 2N with N not a whole third of the source's maximum: 3 × 1333 < 2 × 2000, 3 × 1334 ≥ 2 × 2000
    expect(
      validateScore({ achievement: 1007000, comboFlag: 'ap', dxScore: 1333 }, { ...CHART, maxDxScore: 2000 }),
    ).toEqual(['R7'])
    expect(
      validateScore({ achievement: 1007000, comboFlag: 'ap', dxScore: 1334 }, { ...CHART, maxDxScore: 2000 }),
    ).toEqual([])
  })

  it('R8: a score with a play count of 0', () => {
    expect(validateScore({ achievement: 980000, playCount: 0 }, CHART)).toEqual(['R8'])
    expect(validateScore({ achievement: 980000, playCount: 1 }, CHART)).toEqual([])
    // no play count from the source: nothing to check
    expect(validateScore({ achievement: 980000 }, CHART)).toEqual([])
  })

  it('trap: the DX rules are skipped when the note count is unknown', () => {
    const record = { achievement: 1010000, comboFlag: 'fc', dxScore: 99999 }
    expect(validateScore(record, UNKNOWN_NOTES)).toEqual([])
    expect(validateScore(record, CHART)).toEqual(['R3'])
  })

  it('trap: best-of fields from different plays are not cross-checked beyond the listed rules', () => {
    // best achievement from one play, FS+ from another, a low DX score from a third: all possible
    expect(validateScore({ achievement: 1008000, comboFlag: 'fc', syncFlag: 'fsp', dxScore: 600 }, CHART)).toEqual([])
    // the maximum DX score with a best-of AP+ and 101% is fine even if the sync is low
    expect(validateScore({ achievement: 1010000, comboFlag: 'app', syncFlag: null, dxScore: 1500 }, CHART)).toEqual([])
  })

  it('lists every broken rule in order', () => {
    expect(
      validateScore({ achievement: 1020000, comboFlag: 'ap', syncFlag: 'x', dxScore: 1600, playCount: 0 }, CHART),
    ).toEqual(['R1', 'R2', 'R3', 'R8'])
  })
})

const sheet = (overrides: Partial<Sheet> & Pick<Sheet, 'id' | 'type' | 'difficulty'>): Sheet => ({
  level: '13',
  internalLevelValue: 13,
  noteCounts: { total: 500 },
  serverIds: [ServerEnum.JP, ServerEnum.CN],
  isSpecial: false,
  version: VersionEnum.CiRCLEPLUS,
  ...overrides,
})

const song = (id: string, title: string, sheets: Sheet[]) => ({
  id,
  title,
  version: VersionEnum.CiRCLEPLUS,
  artist: 'Artist',
  category: CategoryEnum.Maimai,
  imageName: id,
  isNew: false,
  isLocked: false,
  searchAcronyms: [],
  sheets,
})

const SONG_A_DX_MASTER = 'dsht_23456789ab'
const SONG_B_DX_MASTER = 'dsht_3456789abc'
const SONG_B_STD_MASTER = 'dsht_456789abcd'
const SONG_C_UTAGE = 'dsht_56789abcde'

const data: SongCatalogSource = {
  versions: [],
  songs: [
    song('dsng_23456789ab', 'Song A', [
      sheet({ id: SONG_A_DX_MASTER, internalId: 10001, type: TypeEnum.DX, difficulty: DifficultyEnum.Master }),
    ]),
    // dxdata's 360: one internal ID on both the STD and the DX sheets, with different note counts
    song('dsng_3456789abc', 'Song B', [
      sheet({
        id: SONG_B_DX_MASTER,
        internalId: 360,
        type: TypeEnum.DX,
        difficulty: DifficultyEnum.Master,
        noteCounts: { total: 789 },
      }),
      sheet({
        id: SONG_B_STD_MASTER,
        internalId: 360,
        type: TypeEnum.STD,
        difficulty: DifficultyEnum.Master,
        noteCounts: { total: 599 },
      }),
    ]),
    song('dsng_456789abcd', 'Song C', [
      sheet({
        id: SONG_C_UTAGE,
        internalId: 100001,
        type: TypeEnum.UTAGE2P,
        difficulty: '【協】' as DifficultyEnum,
        noteCounts: { total: 900 },
      }),
    ]),
  ],
}
const catalog = buildSongCatalog(data, VersionEnum.CiRCLEPLUS)
const sheetOf = (id: string) => catalog.getById(id)!

describe('scoreValidationChartOf', () => {
  it('uses 3 × the dxdata note total', () => {
    expect(scoreValidationChartOf(catalog, sheetOf(SONG_A_DX_MASTER))).toEqual({ isUtage: false, maxDxScore: 1500 })
  })

  it('skips the DX rules on an ambiguous internal ID (dxdata 360)', () => {
    expect([...ambiguousInternalIds(catalog)]).toEqual([360])
    expect(scoreValidationChartOf(catalog, sheetOf(SONG_B_DX_MASTER)).maxDxScore).toBeNull()
    expect(scoreValidationChartOf(catalog, sheetOf(SONG_B_STD_MASTER)).maxDxScore).toBeNull()
  })

  it("prefers the source's own maximum (the player's region's chart)", () => {
    expect(scoreValidationChartOf(catalog, sheetOf(SONG_A_DX_MASTER), 1650).maxDxScore).toBe(1650)
    expect(scoreValidationChartOf(catalog, sheetOf(SONG_B_DX_MASTER), 2367).maxDxScore).toBe(2367)
    expect(scoreValidationChartOf(catalog, sheetOf(SONG_A_DX_MASTER), 0).maxDxScore).toBe(1500)
  })

  it('skips the DX rules without a note total, and on UTAGE', () => {
    const noTotal = { ...sheetOf(SONG_A_DX_MASTER), noteCounts: {} }
    expect(scoreValidationChartOf(catalog, noTotal).maxDxScore).toBeNull()
    expect(scoreValidationChartOf(catalog, sheetOf(SONG_C_UTAGE))).toEqual({ isUtage: true, maxDxScore: null })
  })
})

describe('import normalizers reject impossible rows', () => {
  const lxnsRow = (overrides: Partial<Parameters<typeof normalizeLxnsScores>[1][number]>) => ({
    id: 1,
    songName: 'Song A',
    level: '13',
    levelIndex: 3,
    achievements: 100.5,
    fc: null,
    fs: null,
    type: 'dx',
    ...overrides,
  })

  it('turns an impossible row into an impossible-score warning with its rules and sheet', () => {
    const result = normalizeLxnsScores(catalog, [
      lxnsRow({ achievements: 100.2, fc: 'app', dxScore: 1500 }),
      lxnsRow({ songName: 'Song B', achievements: 99, fc: 'ap' }),
    ])
    expect(result.entries).toEqual([])
    expect(result.warnings.map(({ code, rules, sheetId }) => ({ code, rules, sheetId }))).toEqual([
      // R4 is a DX rule: LXNS is a CN provider, so only R5 applies
      { code: 'impossible-score', rules: ['R5'], sheetId: SONG_A_DX_MASTER },
      { code: 'impossible-score', rules: ['R6'], sheetId: SONG_B_DX_MASTER },
    ])
  })

  it('rejects an achievement above 101% as R1 rather than an invalid value', () => {
    const result = normalizeLxnsScores(catalog, [lxnsRow({ achievements: 101.5 })])
    expect(result.entries).toEqual([])
    expect(result.warnings).toMatchObject([{ code: 'impossible-score', rules: ['R1'] }])
  })

  it('rejects combo and sync values the normalizer does not know (R2), not dropping them to none', () => {
    const lxns = normalizeLxnsScores(catalog, [lxnsRow({ fc: 'fdx' }), lxnsRow({ levelIndex: 3, fs: 'fdx+' })])
    expect(lxns.warnings.map((warning) => warning.rules)).toEqual([['R2'], ['R2']])

    const aqua = normalizeAquaDxRows(
      catalog,
      [
        { musicId: 10001, level: 3, achievement: 1005000, comboStatus: 9 },
        { musicId: 10001, level: 3, achievement: 1005000, comboStatus: 0, syncStatus: '0' },
      ],
      {},
    )
    expect(aqua.warnings.map((warning) => warning.rules)).toEqual([['R2']])
    expect(aqua.entries).toHaveLength(1)
  })

  it("still reads the providers' empty values as none", () => {
    const divingFish = normalizeDivingFishRows(catalog, [
      {
        achievements: 100.5,
        fc: '',
        fs: '',
        level_index: 3,
        title: 'Song A',
        type: 'DX',
        song_id: 10001,
        dxScore: 1200,
      },
    ])
    expect(divingFish.warnings).toEqual([])
    expect(divingFish.entries[0]).toMatchObject({ comboFlag: null, syncFlag: null })
  })

  it('R8 from the AquaDX play count', () => {
    const result = normalizeAquaDxRows(
      catalog,
      [{ musicId: 10001, level: 3, achievement: 1005000, comboStatus: 0, playCount: 0 }],
      {},
    )
    expect(result.warnings).toMatchObject([{ code: 'impossible-score', rules: ['R8'] }])
  })

  it("uses maimai NET's own maximum DX score, and skips the DX rules on dxdata 360 otherwise", () => {
    const netRow = (title: string, dxScore: { achieved: number; total: number }) => ({
      sheet: { songId: title, type: 'dx', difficulty: 'master' },
      achievement: { rate: 1007000, dxScore, flags: ['allPerfect'] },
    })
    // dxdata says 500 notes (1500), the region's chart has 600 (1800): 1700 is possible
    expect(normalizeMaimaiNetRecords(catalog, [netRow('Song A', { achieved: 1700, total: 1800 })]).warnings).toEqual([])
    expect(
      normalizeMaimaiNetRecords(catalog, [netRow('Song A', { achieved: 1100, total: 1800 })]).warnings,
    ).toMatchObject([{ rules: ['R7'] }])

    // Diving-Fish has no maximum of its own: on the ambiguous ID nothing about the DX score is checked
    const divingFish = normalizeDivingFishRows(catalog, [
      {
        achievements: 100.7,
        fc: 'ap',
        fs: null,
        level_index: 3,
        title: 'Song B',
        type: 'DX',
        song_id: 360,
        dxScore: 5000,
      },
    ])
    expect(divingFish.warnings).toEqual([])
    expect(divingFish.entries).toHaveLength(1)
  })
})

describe('CN providers (LXNS, Diving-Fish) skip the DX rules (owner, meta#82)', () => {
  it('trusts dxdata note counts for every provider but the CN ones', () => {
    expect(catalogNoteCountsApply('lxns')).toBe(false)
    expect(catalogNoteCountsApply('diving-fish')).toBe(false)
    for (const provider of ['maimai-net', 'aqua-dx', 'mu-net', 'aqua-sqlite', null, undefined]) {
      expect(catalogNoteCountsApply(provider)).toBe(true)
    }
    expect(forProvider(CHART, 'lxns')).toEqual(UNKNOWN_NOTES)
    expect(forProvider(CHART, 'aqua-dx')).toEqual(CHART)
  })

  const divingFishRow = (overrides: Partial<Parameters<typeof normalizeDivingFishRows>[1][number]>) => ({
    achievements: 100.5,
    fc: null,
    fs: null,
    level_index: 3,
    title: 'Song A',
    type: 'DX',
    song_id: 10001,
    ...overrides,
  })

  it('does not apply R3, R4 or R7 to LXNS or Diving-Fish rows', () => {
    // 500 notes in dxdata (1500): above it, the maximum without AP+, and an AP below 2 per note
    const rows = [
      { achievements: 99, dxScore: 1600 },
      { achievements: 100.8, fc: 'fcp', dxScore: 1500 },
      { achievements: 100.7, fc: 'ap', dxScore: 900 },
    ]
    for (const row of rows) {
      const divingFish = normalizeDivingFishRows(catalog, [divingFishRow(row)])
      expect(divingFish.warnings).toEqual([])
      expect(divingFish.entries).toHaveLength(1)
      const lxns = normalizeLxnsScores(catalog, [
        {
          id: 1,
          songName: 'Song A',
          level: '13',
          levelIndex: 3,
          achievements: row.achievements,
          fc: row.fc ?? null,
          fs: null,
          type: 'dx',
          dxScore: row.dxScore,
        },
      ])
      expect(lxns.warnings).toEqual([])
    }
    // Another provider is still checked against dxdata: a NET row that shows no maximum of its own
    const net = normalizeMaimaiNetRecords(catalog, [
      {
        sheet: { songId: 'Song A', type: 'dx', difficulty: 'master' },
        achievement: { rate: 990000, dxScore: { achieved: 1600, total: 0 }, flags: [] },
      },
    ])
    expect(net.warnings).toMatchObject([{ rules: ['R3'] }])
  })

  it('still applies R1, R2, R5 and R6 to them', () => {
    const result = normalizeDivingFishRows(catalog, [
      divingFishRow({ achievements: 101.2 }),
      divingFishRow({ fs: 'fdx' }),
      divingFishRow({ achievements: 100.9, fc: 'app', dxScore: 1500 }),
      divingFishRow({ achievements: 100.2, fc: 'ap' }),
    ])
    expect(result.entries).toEqual([])
    expect(result.warnings.map((warning) => warning.rules)).toEqual([['R1'], ['R2'], ['R5'], ['R6']])
  })
})