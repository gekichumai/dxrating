import { DifficultyEnum, TypeEnum } from '@gekichumai/dxdata'
import { match } from 'ts-pattern'
import type { SongCatalog } from './song-catalog.js'
import type {
  Best50Bucket,
  ComboFlag,
  ImportProvider,
  ImportWarning,
  ProviderMusicIdMap,
  RatingEntry,
  SyncFlag,
} from './types.js'

export interface RatingImportResult {
  entries: RatingEntry[]
  warnings: ImportWarning[]
}

type ImportRowResult = { entry: RatingEntry } | { warning: ImportWarning } | { skipped: true }

const LEVEL_INDEX_TO_DIFFICULTY: Record<number, DifficultyEnum> = {
  0: DifficultyEnum.Basic,
  1: DifficultyEnum.Advanced,
  2: DifficultyEnum.Expert,
  3: DifficultyEnum.Master,
  4: DifficultyEnum.ReMaster,
}

const AQUA_DX_LEVEL_TO_DIFFICULTY: Record<number, DifficultyEnum> = {
  1: DifficultyEnum.Basic,
  2: DifficultyEnum.Expert,
  3: DifficultyEnum.Master,
  4: DifficultyEnum.ReMaster,
}

const COMBO_FLAG_RANK: Record<NonNullable<ComboFlag>, number> = {
  fc: 1,
  fcp: 2,
  ap: 3,
  app: 4,
}

const SYNC_FLAG_RANK: Record<NonNullable<SyncFlag>, number> = {
  sync: 1,
  fs: 2,
  fsp: 3,
  fsd: 4,
  fsdp: 5,
}

const AQUA_COMBO_STATUS_TO_FLAG: Record<number, ComboFlag> = {
  0: null,
  1: 'fc',
  2: 'fcp',
  3: 'ap',
  4: 'app',
}

const AQUA_SYNC_STATUS_TO_FLAG: Record<number, SyncFlag> = {
  0: null,
  1: 'sync',
  2: 'fs',
  3: 'fsp',
  4: 'fsd',
  5: 'fsdp',
}

export interface LxnsScoreRow {
  id: number
  songName: string
  level: string
  levelIndex: number
  achievements: number
  fc: string | null
  fs: string | null
  type: string
  dxScore?: number
}

export function normalizeLxnsScores(catalog: SongCatalog, rows: LxnsScoreRow[]): RatingImportResult {
  return finalizeImport(
    rows.map((row) => {
      if (row.type === 'utage') {
        return missing('lxns', row, 'sheet-not-found', `UTAGE score is not rating eligible: ${row.songName}`)
      }

      const difficulty = LEVEL_INDEX_TO_DIFFICULTY[row.levelIndex]
      if (!difficulty) return missing('lxns', row, 'invalid-difficulty', `Unknown LXNS level index: ${row.levelIndex}`)

      const type = normalizeStandardDxType(row.type)
      if (!type) return missing('lxns', row, 'invalid-type', `Unknown LXNS chart type: ${row.type}`)

      const achievement = validateAchievement('lxns', row, row.achievements, 1)
      if ('warning' in achievement) return achievement

      const sheet = catalog.resolveReference({ kind: 'title', title: row.songName, type, difficulty })
      if (!sheet) {
        return missing('lxns', row, 'sheet-not-found', `No sheet found for ${row.songName} (${type}/${difficulty})`)
      }

      return {
        entry: {
          sheetId: sheet.id,
          identity: sheet.identity,
          achievementRate: achievement.rate,
          comboFlag: normalizeCombo(row.fc),
          syncFlag: normalizeSync(row.fs),
          source: { provider: 'lxns', providerId: row.id, providerSongName: row.songName },
        },
      }
    }),
  )
}

export interface MaimaiNetRecordRow {
  sheet: { songId: string; type: string; difficulty: string }
  achievement: { rate: number; dxScore: { achieved: number; total: number }; flags: string[] }
}

export function normalizeMaimaiNetRecords(catalog: SongCatalog, rows: MaimaiNetRecordRow[]): RatingImportResult {
  return finalizeImport(
    rows.map((row) => {
      const type = normalizeStandardDxType(row.sheet.type)
      const difficulty = Object.values(DifficultyEnum).includes(row.sheet.difficulty as DifficultyEnum)
        ? (row.sheet.difficulty as DifficultyEnum)
        : null
      if (!type) return missing('maimai-net', row, 'invalid-type', `Unknown MaimaiNET chart type: ${row.sheet.type}`)
      if (!difficulty) {
        return missing('maimai-net', row, 'invalid-difficulty', `Unknown MaimaiNET difficulty: ${row.sheet.difficulty}`)
      }

      const achievement = validateAchievement('maimai-net', row, row.achievement.rate, 10000)
      if ('warning' in achievement) return achievement

      const sheet = catalog.resolveReference({ kind: 'title', title: row.sheet.songId, type, difficulty })
      if (!sheet) {
        return missing(
          'maimai-net',
          row,
          'sheet-not-found',
          `No sheet found for ${row.sheet.songId} (${type}/${difficulty})`,
        )
      }

      return {
        entry: {
          sheetId: sheet.id,
          identity: sheet.identity,
          achievementRate: achievement.rate,
          comboFlag: extractNetCombo(row.achievement.flags),
          syncFlag: extractNetSync(row.achievement.flags),
          source: { provider: 'maimai-net', providerSongName: row.sheet.songId },
        },
      }
    }),
  )
}

export interface DivingFishRow {
  bucket?: Best50Bucket
  achievements: number
  fc: string | null
  fs: string | null
  level_index: number
  title: string
  type: string
  song_id: number
}

export function normalizeDivingFishRows(catalog: SongCatalog, rows: DivingFishRow[]): RatingImportResult {
  return finalizeImport(
    rows.map((row) => {
      const difficulty = LEVEL_INDEX_TO_DIFFICULTY[row.level_index]
      const type = normalizeDivingFishType(row.type)
      if (!difficulty) {
        return missing('diving-fish', row, 'invalid-difficulty', `Unknown Diving Fish level index: ${row.level_index}`)
      }
      if (!type) return missing('diving-fish', row, 'invalid-type', `Unknown Diving Fish chart type: ${row.type}`)

      const achievement = validateAchievement('diving-fish', row, row.achievements, 1)
      if ('warning' in achievement) return achievement

      const sheet =
        catalog.resolveReference({ kind: 'internal-id', internalId: row.song_id, type, difficulty }) ??
        catalog.resolveReference({ kind: 'title', title: row.title, type, difficulty })
      if (!sheet) {
        return missing('diving-fish', row, 'sheet-not-found', `No sheet found for ${row.title} (${type}/${difficulty})`)
      }

      return {
        entry: {
          sheetId: sheet.id,
          identity: sheet.identity,
          achievementRate: achievement.rate,
          comboFlag: normalizeCombo(row.fc),
          syncFlag: normalizeSync(row.fs),
          source: {
            provider: 'diving-fish',
            providerId: row.song_id,
            providerSongName: row.title,
            best50Bucket: row.bucket,
          },
        },
      }
    }),
  )
}

export interface AquaDxRow {
  musicId: string | number
  level: number
  achievement: number
}

export function normalizeAquaDxRows(
  catalog: SongCatalog,
  rows: AquaDxRow[],
  map: ProviderMusicIdMap,
): RatingImportResult {
  return finalizeImport(
    rows.map((row) => {
      const difficulty = AQUA_DX_LEVEL_TO_DIFFICULTY[row.level]
      if (!difficulty) return missing('aqua-dx', row, 'invalid-difficulty', `Unknown AquaDX level: ${row.level}`)

      if (shouldSkipProviderMusicId(row.musicId, map)) return skipped()

      const achievement = validateAchievement('aqua-dx', row, row.achievement, 10000)
      if ('warning' in achievement) return achievement

      const sheet = catalog.resolveReference({ kind: 'provider-music-id', musicId: row.musicId, difficulty, map })
      if (!sheet) return missing('aqua-dx', row, 'sheet-not-found', `No sheet found for AquaDX music id ${row.musicId}`)

      return {
        entry: {
          sheetId: sheet.id,
          identity: sheet.identity,
          achievementRate: achievement.rate,
          source: { provider: 'aqua-dx', providerId: row.musicId },
        },
      }
    }),
  )
}

export interface MuNetRow {
  musicId: string | number
  level: number
  achievement: number
}

export function normalizeMuNetRows(
  catalog: SongCatalog,
  rows: MuNetRow[],
  map: ProviderMusicIdMap,
): RatingImportResult {
  return finalizeImport(
    rows.map((row) => {
      const difficulty = LEVEL_INDEX_TO_DIFFICULTY[row.level]
      if (!difficulty) return missing('mu-net', row, 'invalid-difficulty', `Unknown MuNET level: ${row.level}`)

      if (shouldSkipProviderMusicId(row.musicId, map)) return skipped()

      const achievement = validateAchievement('mu-net', row, row.achievement, 10000)
      if ('warning' in achievement) return achievement

      const sheet = catalog.resolveReference({ kind: 'provider-music-id', musicId: row.musicId, difficulty, map })
      if (!sheet) return missing('mu-net', row, 'sheet-not-found', `No sheet found for MuNET music id ${row.musicId}`)

      return {
        entry: {
          sheetId: sheet.id,
          identity: sheet.identity,
          achievementRate: achievement.rate,
          source: { provider: 'mu-net', providerId: row.musicId },
        },
      }
    }),
  )
}

export interface AquaSqliteGameplayRow {
  id: number
  music_id: number
  level: DifficultyEnum
  achievement: number
  user_id: number
  type: TypeEnum
  combo_status?: number | string | null
  sync_status?: number | string | null
}

export function normalizeAquaSqliteRows(
  catalog: SongCatalog,
  input: { selectedUserId: number; gameplays: AquaSqliteGameplayRow[] },
): RatingImportResult {
  return finalizeImport(
    input.gameplays
      .filter((row) => row.user_id === input.selectedUserId)
      .map((row) => {
        const achievement = validateAchievement('aqua-sqlite', row, row.achievement, 10000)
        if ('warning' in achievement) return achievement

        const sheet = catalog.resolveReference({
          kind: 'internal-id',
          internalId: row.music_id,
          type: row.type,
          difficulty: row.level,
        })
        if (!sheet) {
          return missing(
            'aqua-sqlite',
            row,
            'sheet-not-found',
            `No sheet found for Aqua SQLite music id ${row.music_id}`,
          )
        }

        return {
          entry: {
            sheetId: sheet.id,
            identity: sheet.identity,
            achievementRate: achievement.rate,
            comboFlag: normalizeAquaComboStatus(row.combo_status ?? null),
            syncFlag: normalizeAquaSyncStatus(row.sync_status ?? null),
            source: { provider: 'aqua-sqlite', providerId: row.music_id },
          },
        }
      }),
  )
}

function finalizeImport(results: ImportRowResult[]): RatingImportResult {
  const warnings = results.flatMap((result) => ('warning' in result ? [result.warning] : []))
  const bySheetId = new Map<string, RatingEntry>()

  for (const result of results) {
    if (!('entry' in result)) continue

    const existing = bySheetId.get(result.entry.sheetId)
    if (!existing) {
      bySheetId.set(result.entry.sheetId, result.entry)
    } else {
      bySheetId.set(result.entry.sheetId, mergeDuplicateEntry(existing, result.entry))
    }
  }

  return { entries: [...bySheetId.values()], warnings }
}

function missing(
  provider: ImportProvider,
  row: unknown,
  code: ImportWarning['code'],
  message: string,
): { warning: ImportWarning } {
  return { warning: { provider, code, message, row } }
}

function skipped(): { skipped: true } {
  return { skipped: true }
}

function shouldSkipProviderMusicId(musicId: string | number, map: ProviderMusicIdMap): boolean {
  return map[String(musicId)]?.ver === '24000'
}

function validateAchievement(
  provider: ImportProvider,
  row: unknown,
  value: number,
  scale: number,
): { rate: number } | { warning: ImportWarning } {
  const rate = normalizeAchievement(value, scale)
  if (rate === null) {
    return missing(provider, row, 'invalid-achievement', `Invalid ${provider} achievement: ${String(value)}`)
  }

  return { rate }
}

function normalizeAchievement(value: number, scale: number): number | null {
  if (!Number.isFinite(value)) return null

  const rate = value / scale
  if (rate < 0 || rate > 100.5) return null
  return rate
}

function mergeDuplicateEntry(existing: RatingEntry, candidate: RatingEntry): RatingEntry {
  const preferred = compareEntry(candidate, existing) > 0 ? candidate : existing
  const other = preferred === candidate ? existing : candidate

  return {
    ...preferred,
    source: mergeSource(preferred.source, other.source),
  }
}

function compareEntry(a: RatingEntry, b: RatingEntry): number {
  if (a.achievementRate !== b.achievementRate) return a.achievementRate - b.achievementRate

  const comboDifference = comboRank(a.comboFlag) - comboRank(b.comboFlag)
  if (comboDifference !== 0) return comboDifference

  return syncRank(a.syncFlag) - syncRank(b.syncFlag)
}

function comboRank(flag: ComboFlag | undefined): number {
  return flag ? COMBO_FLAG_RANK[flag] : 0
}

function syncRank(flag: SyncFlag | undefined): number {
  return flag ? SYNC_FLAG_RANK[flag] : 0
}

function mergeSource(base: RatingEntry['source'], fallback: RatingEntry['source']): RatingEntry['source'] {
  if (!base) return fallback
  if (!fallback) return base

  return {
    ...base,
    providerId: base.providerId ?? fallback.providerId,
    providerSongName: base.providerSongName ?? fallback.providerSongName,
    best50Bucket: base.best50Bucket ?? fallback.best50Bucket,
  }
}

function normalizeCombo(value: string | null): ComboFlag {
  if (value === 'fc' || value === 'fcp' || value === 'ap' || value === 'app') return value
  return null
}

function normalizeSync(value: string | null): SyncFlag {
  if (value === 'fs' || value === 'fsp' || value === 'fsd' || value === 'fsdp' || value === 'sync') return value
  return null
}

function normalizeAquaComboStatus(value: number | string | null): ComboFlag {
  if (typeof value === 'number') return AQUA_COMBO_STATUS_TO_FLAG[value] ?? null
  return normalizeCombo(value)
}

function normalizeAquaSyncStatus(value: number | string | null): SyncFlag {
  if (typeof value === 'number') return AQUA_SYNC_STATUS_TO_FLAG[value] ?? null
  return normalizeSync(value)
}

function normalizeStandardDxType(value: string): TypeEnum.STD | TypeEnum.DX | null {
  return match(value)
    .returnType<TypeEnum.STD | TypeEnum.DX | null>()
    .with('standard', () => TypeEnum.STD)
    .with('dx', () => TypeEnum.DX)
    .otherwise(() => null)
}

function normalizeDivingFishType(value: string): TypeEnum.STD | TypeEnum.DX | null {
  return match(value.toLowerCase())
    .returnType<TypeEnum.STD | TypeEnum.DX | null>()
    .with('sd', () => TypeEnum.STD)
    .with('dx', () => TypeEnum.DX)
    .otherwise(() => null)
}

function extractNetCombo(flags: string[]): ComboFlag {
  if (flags.includes('allPerfect+')) return 'app'
  if (flags.includes('allPerfect')) return 'ap'
  if (flags.includes('fullCombo+')) return 'fcp'
  if (flags.includes('fullCombo')) return 'fc'
  return null
}

function extractNetSync(flags: string[]): SyncFlag {
  if (flags.includes('fullSyncDX+')) return 'fsdp'
  if (flags.includes('fullSyncDX')) return 'fsd'
  if (flags.includes('fullSync+')) return 'fsp'
  if (flags.includes('fullSync')) return 'fs'
  if (flags.includes('syncPlay')) return 'sync'
  return null
}