import {
  DifficultyEnum,
  type Sheet,
  type SongCatalogDocument,
  type TypeEnum,
  type VersionEnum,
} from '@gekichumai/dxdata'
import {
  buildPlateCharts,
  findPlate,
  getPlateVersionGroups,
  listPlates,
  type PlateDefinition,
  type PlateKind,
  type PlateRecord,
  meetsPlateCondition,
  type PlateRegion,
  plateName,
} from '@gekichumai/maimai-domain'
import type { SupportedLocale } from '@/setup/locale'

export const PLATE_REGIONS: readonly PlateRegion[] = ['jp', 'intl', 'cn']
export const DEFAULT_PLATE_REGION: PlateRegion = 'jp'

export const parsePlateRegion = (value: unknown): PlateRegion | undefined =>
  typeof value === 'string' && (PLATE_REGIONS as readonly string[]).includes(value) ? (value as PlateRegion) : undefined

export const platePath = (plateId: string) => `/plates/${encodeURIComponent(plateId)}`

/** zh-Hans readers see the simplified CN plate characters; everyone else the JP ones */
export const plateScript = (locale: SupportedLocale): 'ja' | 'zh' => (locale === 'zh-Hans' ? 'zh' : 'ja')

export const plateDisplayName = (plate: PlateDefinition, locale: SupportedLocale) =>
  plateName(plate, plateScript(locale))

/** Plates of the default region: the indexable set listed in the sitemap */
export const listIndexablePlateIds = (): string[] => listPlates(DEFAULT_PLATE_REGION).map((plate) => plate.id)

export interface PlatePageSheet {
  id: string
  difficulty: DifficultyEnum
  level: string
  internalLevelValue: number
}

export interface PlatePageChart {
  songId: string
  title: string
  artist: string
  imageName: string
  type: typeof TypeEnum.DX | typeof TypeEnum.STD
  version: VersionEnum
  /** Master level, the grouping key */
  level: string
  levelValue: number
  sheets: PlatePageSheet[]
  /** Its Re:MASTER is one whose plate membership differs between servers; it counts and the page labels it */
  remasterDiffersByServer: boolean
}

/** Lean, serialisable plate data for the SSR page (the user overlay is added on the client) */
export interface PlatePageData {
  plateId: string
  region: PlateRegion
  kind: PlateKind
  groupId: string
  versions: readonly VersionEnum[]
  includesRemaster: boolean
  unverified: boolean
  /** Names in both scripts so the client can pick by locale */
  names: { ja: string; zh: string }
  charts: PlatePageChart[]
  totalSheets: number
}

/** A sheet's level on a server: each field of its server override wins independently over the base value */
export function levelOn(sheet: Sheet, region: PlateRegion): { level: string; levelValue: number } {
  const override = sheet.serverOverrides?.[region]
  return { level: override?.level ?? sheet.level, levelValue: override?.levelValue ?? sheet.internalLevelValue }
}

/** Search of a plate link: the default server stays implicit so the canonical URL is kept */
export const plateRegionSearch = (region: PlateRegion): { region: PlateRegion | undefined } => ({
  region: region === DEFAULT_PLATE_REGION ? undefined : region,
})

export function buildPlatePageData(
  document: SongCatalogDocument,
  region: PlateRegion,
  plateId: string,
): PlatePageData | null {
  const plate = findPlate(region, plateId)
  if (!plate) return null
  const charts = buildPlateCharts(document.songs, plate.group, region)
    .map((chart): PlatePageChart => {
      const master =
        chart.requiredSheets.find((sheet) => sheet.difficulty === DifficultyEnum.Master) ?? chart.requiredSheets.at(-1)
      return {
        songId: chart.song.id,
        title: chart.song.title,
        artist: chart.song.artist,
        imageName: chart.song.imageName,
        type: chart.type,
        version: chart.version,
        level: master ? levelOn(master, region).level : '-',
        levelValue: master ? levelOn(master, region).levelValue : 0,
        sheets: chart.requiredSheets.map((sheet) => ({
          id: sheet.id,
          difficulty: sheet.difficulty,
          level: levelOn(sheet, region).level,
          internalLevelValue: levelOn(sheet, region).levelValue,
        })),
        remasterDiffersByServer: chart.hasServerVariantRemaster,
      }
    })
    .sort((a, b) => b.levelValue - a.levelValue || a.title.localeCompare(b.title))
  return {
    plateId: plate.id,
    region,
    kind: plate.kind,
    groupId: plate.group.id,
    versions: plate.group.versions,
    includesRemaster: plate.group.includesRemaster,
    unverified: !!plate.group.unverified,
    names: { ja: plateName(plate, 'ja'), zh: plateName(plate, 'zh') },
    charts,
    totalSheets: charts.reduce((sum, chart) => sum + chart.sheets.length, 0),
  }
}

export interface PlateIndexGroup {
  id: string
  ja: string
  zh: string
  versions: readonly VersionEnum[]
  unverified: boolean
  plates: { id: string; kind: PlateKind; names: { ja: string; zh: string } }[]
}

export function buildPlateIndex(region: PlateRegion): PlateIndexGroup[] {
  const plates = listPlates(region)
  return getPlateVersionGroups(region).map((group) => ({
    id: group.id,
    ja: group.ja,
    zh: group.zh,
    versions: group.versions,
    unverified: !!group.unverified,
    plates: plates
      .filter((plate) => plate.group.id === group.id)
      .map((plate) => ({
        id: plate.id,
        kind: plate.kind,
        names: { ja: plateName(plate, 'ja'), zh: plateName(plate, 'zh') },
      })),
  }))
}

export interface PlateLevelGroup {
  level: string
  charts: PlatePageChart[]
}

/** Groups charts by Master level, highest first (charts arrive sorted) */
export function groupPlateChartsByLevel(charts: readonly PlatePageChart[]): PlateLevelGroup[] {
  const groups: PlateLevelGroup[] = []
  for (const chart of charts) {
    const last = groups.at(-1)
    if (last && last.level === chart.level) last.charts.push(chart)
    else {
      const existing = groups.find((group) => group.level === chart.level)
      if (existing) existing.charts.push(chart)
      else groups.push({ level: chart.level, charts: [chart] })
    }
  }
  return groups
}

export interface PlateChartStatus {
  chart: PlatePageChart
  /** Sheet ID → condition met */
  met: ReadonlyMap<string, boolean>
  complete: boolean
}

export interface PlateUserProgress {
  charts: PlateChartStatus[]
  completedCharts: number
  totalCharts: number
  completedSheets: number
  totalSheets: number
}

/** Overlays the user's records (keyed by sheet ID) on SSR plate data */
export function evaluatePlatePage(
  data: Pick<PlatePageData, 'charts' | 'kind'>,
  records: ReadonlyMap<string, PlateRecord>,
): PlateUserProgress {
  let completedCharts = 0
  let completedSheets = 0
  let totalSheets = 0
  const charts = data.charts.map((chart) => {
    const met = new Map<string, boolean>()
    for (const sheet of chart.sheets) {
      const ok = meetsPlateCondition(data.kind, records.get(sheet.id))
      met.set(sheet.id, ok)
      totalSheets++
      if (ok) completedSheets++
    }
    const complete = chart.sheets.every((sheet) => met.get(sheet.id))
    if (complete) completedCharts++
    return { chart, met, complete }
  })
  return { charts, completedCharts, totalCharts: charts.length, completedSheets, totalSheets }
}

export const progressPercent = (done: number, total: number) => (total === 0 ? 0 : (done / total) * 100)