import {
  DifficultyEnum,
  TypeEnum,
  VERSION_SLUG_MAP,
  VERSION_SORT_ORDER,
  type SongCatalogDocument,
  type VersionEnum,
} from '@gekichumai/dxdata'
import { buildSheetPath } from '@/components/sheet/sheetLinks'

/** Versions newest first, as `/versions/<slug>` pages */
export const VERSION_PAGE_VERSIONS = [...VERSION_SORT_ORDER].reverse() as VersionEnum[]

export const versionSlug = (version: VersionEnum) => VERSION_SLUG_MAP.get(version) ?? null

export const versionPagePath = (version: VersionEnum) => `/versions/${versionSlug(version)}`

export const parseVersionSlug = (slug: string): VersionEnum | null =>
  VERSION_PAGE_VERSIONS.find((version) => versionSlug(version) === slug.toLowerCase()) ?? null

const LISTED_DIFFICULTIES = [DifficultyEnum.Expert, DifficultyEnum.Master, DifficultyEnum.ReMaster] as const

export type VersionPageChart = {
  difficulty: DifficultyEnum
  level: string
  /** One decimal, or null when unknown */
  constant: string | null
  href: string
}

export type VersionPageRow = {
  songId: string
  title: string
  artist: string
  type: TypeEnum
  /** True when the song itself is from an older version and only charts were added */
  isNewChartOnly: boolean
  charts: VersionPageChart[]
  href: string
}

export type VersionPageGroup = {
  /** `YYYY-MM-DD`, or null for charts without a known release date */
  releaseDate: string | null
  rows: VersionPageRow[]
}

export type VersionPage = {
  version: VersionEnum
  songCount: number
  chartCount: number
  groups: VersionPageGroup[]
}

/**
 * The DX / Standard charts added in one version, one row per song and chart type, grouped by release date (newest
 * first). Utage charts are left out.
 */
export function buildVersionPage(document: SongCatalogDocument, version: VersionEnum): VersionPage {
  const rows: (VersionPageRow & { releaseDate: string | null })[] = []
  let chartCount = 0

  for (const song of document.songs) {
    for (const type of [TypeEnum.DX, TypeEnum.STD]) {
      const added = song.sheets.filter((sheet) => sheet.type === type && sheet.version === version)
      if (added.length === 0) continue
      chartCount += added.length

      const listed = song.sheets.filter(
        (sheet) => sheet.type === type && (LISTED_DIFFICULTIES as readonly string[]).includes(sheet.difficulty),
      )
      const releaseDate =
        added
          .map((sheet) => sheet.releaseDate)
          .filter((date): date is string => Boolean(date))
          .sort()[0] ?? null
      const main = added.find((sheet) => sheet.difficulty === DifficultyEnum.Master) ?? added.at(-1)!

      rows.push({
        songId: song.id,
        title: song.title,
        artist: song.artist,
        type,
        isNewChartOnly: song.version !== version,
        releaseDate,
        charts: LISTED_DIFFICULTIES.flatMap((difficulty) => {
          const sheet = listed.find((candidate) => candidate.difficulty === difficulty)
          if (!sheet) return []
          return [
            {
              difficulty,
              level: sheet.level,
              constant: sheet.internalLevelValue > 0 ? sheet.internalLevelValue.toFixed(1) : null,
              href: buildSheetPath({ songId: song.id, type, difficulty }),
            },
          ]
        }),
        href: buildSheetPath({ songId: song.id, type, difficulty: main.difficulty }),
      })
    }
  }

  rows.sort(
    (a, b) =>
      (b.releaseDate ?? '').localeCompare(a.releaseDate ?? '') ||
      a.title.localeCompare(b.title) ||
      a.type.localeCompare(b.type),
  )

  const groups: VersionPageGroup[] = []
  for (const { releaseDate, ...row } of rows) {
    const group = groups.at(-1)
    if (group && group.releaseDate === releaseDate) group.rows.push(row)
    else groups.push({ releaseDate, rows: [row] })
  }

  return { version, songCount: new Set(rows.map((row) => row.songId)).size, chartCount, groups }
}