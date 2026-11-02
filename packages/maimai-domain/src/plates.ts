/**
 * Version plates (名刺プレート / 牌子): 極, 将, 神, 舞舞 and 覇者.
 *
 * Sources, cross-checked against each other:
 * - Yuri-YuzuChaN/maimaiDX `core/image/plate_table.py` (`PlateTable.PLAN_CRITERIA`, `_is_qualified`) for the
 *   conditions, and `constants.py` (`VERSION_MAP`, `SD_VERSION`, `DX_VERSION`, `DX_CN_VERSION`, `PLATE_CN`) for the
 *   version groups.
 * - Diving-Fish maimaidx-prober `web/src/components/PlateQualifier.vue` for the 舞 / 覇 Re:MASTER rule.
 * - In-game rules (maimai DX collection descriptions): a plate needs every Basic to Master chart of the songs of
 *   its versions; 舞 and 覇 also need the Re:MASTER charts of the songs that had one in the SD era; 真将 does not
 *   exist; 覇 only exists as 覇者.
 *
 * Song lists are generated from the dxdata `version` field of the sheets (the version a chart first appeared in),
 * so charts added later (a DX chart of an old song, a later Re:MASTER) never move a song into another plate.
 * Charts removed from a server (`serverIds` without it) do not count there.
 */
import { DifficultyEnum, type Sheet, type Song, TypeEnum, VersionEnum } from '@gekichumai/dxdata'
import type { ComboFlag, SyncFlag } from './types'

export type PlateKind = 'kiwami' | 'sho' | 'shin' | 'maimai' | 'hasha'

/** Display characters of the plate kinds */
export const PLATE_KIND_LABELS: Record<PlateKind, { ja: string; zh: string }> = {
  kiwami: { ja: '極', zh: '极' },
  sho: { ja: '将', zh: '将' },
  shin: { ja: '神', zh: '神' },
  maimai: { ja: '舞舞', zh: '舞舞' },
  hasha: { ja: '者', zh: '者' },
}

export type PlateRegion = 'jp' | 'intl' | 'cn'

export interface PlateVersionGroup {
  /** URL-safe slug, unique per region */
  id: string
  /** Plate character as written on the JP / INTL plate */
  ja: string
  /** Plate character on the CN plate (simplified) */
  zh: string
  /** dxdata versions whose charts the plate needs */
  versions: readonly VersionEnum[]
  kinds: readonly PlateKind[]
  /** Re:MASTER charts of SD-era songs count (舞 and 覇 only) */
  includesRemaster: boolean
  /** Mapping not yet confirmed against an in-game plate list */
  unverified?: boolean
}

/** Every SD (pre-DX) version: maimai to FiNALE */
export const SD_VERSIONS = [
  VersionEnum.Maimai,
  VersionEnum.MaimaiPLUS,
  VersionEnum.GreeN,
  VersionEnum.GreeNPLUS,
  VersionEnum.Orange,
  VersionEnum.OrangePlus,
  VersionEnum.PiNK,
  VersionEnum.PiNKPLUS,
  VersionEnum.MURASAKi,
  VersionEnum.MURASAKiPLUS,
  VersionEnum.MiLK,
  VersionEnum.MiLKPLUS,
  VersionEnum.FiNALE,
] as const satisfies readonly VersionEnum[]

const STANDARD_KINDS: readonly PlateKind[] = ['kiwami', 'sho', 'shin', 'maimai']

const group = (
  id: string,
  ja: string,
  zh: string,
  versions: readonly VersionEnum[],
  extra: Partial<Pick<PlateVersionGroup, 'kinds' | 'includesRemaster' | 'unverified'>> = {},
): PlateVersionGroup => ({ id, ja, zh, versions, kinds: STANDARD_KINDS, includesRemaster: false, ...extra })

/** SD-era plates: identical on every server (YuzuChaN `SD_VERSION`) */
const SD_PLATE_GROUPS: readonly PlateVersionGroup[] = [
  // 真将 does not exist: maimai PLUS had no SSS rank to award it
  group('shin-ver', '真', '真', [VersionEnum.Maimai, VersionEnum.MaimaiPLUS], {
    kinds: ['kiwami', 'shin', 'maimai'],
  }),
  group('cho', '超', '超', [VersionEnum.GreeN]),
  group('geki', '檄', '檄', [VersionEnum.GreeNPLUS]),
  group('orange', '橙', '橙', [VersionEnum.Orange]),
  group('akatsuki', '暁', '晓', [VersionEnum.OrangePlus]),
  group('momo', '桃', '桃', [VersionEnum.PiNK]),
  group('sakura', '櫻', '樱', [VersionEnum.PiNKPLUS]),
  group('murasaki', '紫', '紫', [VersionEnum.MURASAKi]),
  group('sumire', '菫', '堇', [VersionEnum.MURASAKiPLUS]),
  group('shiro', '白', '白', [VersionEnum.MiLK]),
  group('yuki', '雪', '雪', [VersionEnum.MiLKPLUS]),
  group('kagayaki', '輝', '辉', [VersionEnum.FiNALE]),
  group('mai', '舞', '舞', SD_VERSIONS, { includesRemaster: true }),
  group('ha', '覇', '霸', SD_VERSIONS, { kinds: ['hasha'], includesRemaster: true }),
]

/** JP / INTL: every DX version and its PLUS are separate plates (YuzuChaN `DX_VERSION`) */
const JP_DX_PLATE_GROUPS: readonly PlateVersionGroup[] = [
  group('kuma', '熊', '熊', [VersionEnum.Maimaiでらっくす]),
  group('hana', '華', '华', [VersionEnum.MaimaiでらっくすPLUS]),
  group('sou', '爽', '爽', [VersionEnum.Splash]),
  group('kou', '煌', '煌', [VersionEnum.SplashPLUS]),
  group('chu', '宙', '宙', [VersionEnum.UNiVERSE]),
  group('hoshi', '星', '星', [VersionEnum.UNiVERSEPLUS]),
  group('matsuri', '祭', '祭', [VersionEnum.FESTiVAL]),
  group('iwai', '祝', '祝', [VersionEnum.FESTiVALPLUS]),
  group('sou-buddies', '双', '双', [VersionEnum.BUDDiES]),
  group('utage', '宴', '宴', [VersionEnum.BUDDiESPLUS]),
  group('kagami', '鏡', '镜', [VersionEnum.PRiSM]),
  group('irodori', '彩', '彩', [VersionEnum.PRiSMPLUS], { unverified: true }),
  group('maru', '丸', '丸', [VersionEnum.CiRCLE], { unverified: true }),
]

/**
 * CN: one 舞萌DX version a year covers a JP version and its PLUS, so both plate characters share one song list
 * (YuzuChaN `DX_CN_VERSION`, `熊&华` and so on). dxdata only has JP version names; the CN year is derived from them.
 */
const CN_DX_PLATE_GROUPS: readonly PlateVersionGroup[] = [
  ...(
    [
      ['kuma', '熊', [VersionEnum.Maimaiでらっくす, VersionEnum.MaimaiでらっくすPLUS]],
      ['hana', '华', [VersionEnum.Maimaiでらっくす, VersionEnum.MaimaiでらっくすPLUS]],
      ['sou', '爽', [VersionEnum.Splash, VersionEnum.SplashPLUS]],
      ['kou', '煌', [VersionEnum.Splash, VersionEnum.SplashPLUS]],
      ['chu', '宙', [VersionEnum.UNiVERSE, VersionEnum.UNiVERSEPLUS]],
      ['hoshi', '星', [VersionEnum.UNiVERSE, VersionEnum.UNiVERSEPLUS]],
      ['matsuri', '祭', [VersionEnum.FESTiVAL, VersionEnum.FESTiVALPLUS]],
      ['iwai', '祝', [VersionEnum.FESTiVAL, VersionEnum.FESTiVALPLUS]],
      ['sou-buddies', '双', [VersionEnum.BUDDiES, VersionEnum.BUDDiESPLUS]],
      ['utage', '宴', [VersionEnum.BUDDiES, VersionEnum.BUDDiESPLUS]],
      ['kagami', '镜', [VersionEnum.PRiSM]],
    ] as const
  ).map(([id, zh, versions]) => group(id, zh, zh, versions)),
  group('irodori', '彩', '彩', [VersionEnum.PRiSMPLUS], { unverified: true }),
]

export function getPlateVersionGroups(region: PlateRegion): readonly PlateVersionGroup[] {
  return [...SD_PLATE_GROUPS, ...(region === 'cn' ? CN_DX_PLATE_GROUPS : JP_DX_PLATE_GROUPS)]
}

export interface PlateDefinition {
  group: PlateVersionGroup
  kind: PlateKind
  /** e.g. `kagami-shin` */
  id: string
}

/** Every plate that exists in game for a region */
export function listPlates(region: PlateRegion): PlateDefinition[] {
  return getPlateVersionGroups(region).flatMap((group) =>
    group.kinds.map((kind) => ({ group, kind, id: `${group.id}-${kind}` })),
  )
}

export function findPlate(region: PlateRegion, plateId: string): PlateDefinition | undefined {
  return listPlates(region).find((plate) => plate.id === plateId)
}

export function plateName(plate: PlateDefinition, script: 'ja' | 'zh' = 'ja'): string {
  const prefix = plate.group[script]
  return plate.kind === 'hasha' ? `${prefix}者` : `${prefix}${PLATE_KIND_LABELS[plate.kind][script]}`
}

export interface PlateRecord {
  achievementRate: number
  comboFlag?: ComboFlag
  syncFlag?: SyncFlag
}

const FC_OR_BETTER: readonly ComboFlag[] = ['fc', 'fcp', 'ap', 'app']
const AP_OR_BETTER: readonly ComboFlag[] = ['ap', 'app']
const FDX_OR_BETTER: readonly SyncFlag[] = ['fsd', 'fsdp']

/** YuzuChaN `PLAN_CRITERIA`: whether one chart's record meets a plate kind */
export function meetsPlateCondition(kind: PlateKind, record: PlateRecord | undefined): boolean {
  if (!record) return false
  switch (kind) {
    case 'hasha':
      return record.achievementRate >= 80
    case 'kiwami':
      return FC_OR_BETTER.includes(record.comboFlag ?? null)
    case 'sho':
      return record.achievementRate >= 100
    case 'shin':
      return AP_OR_BETTER.includes(record.comboFlag ?? null)
    case 'maimai':
      return FDX_OR_BETTER.includes(record.syncFlag ?? null)
  }
}

const BASE_DIFFICULTIES: readonly DifficultyEnum[] = [
  DifficultyEnum.Basic,
  DifficultyEnum.Advanced,
  DifficultyEnum.Expert,
  DifficultyEnum.Master,
]
const SD_VERSION_SET: ReadonlySet<VersionEnum> = new Set(SD_VERSIONS)

/** The version a sheet belongs to on a server, honouring dxdata server overrides */
export function sheetVersionOn(sheet: Sheet, region: PlateRegion): VersionEnum {
  return sheet.serverOverrides?.[region]?.version ?? sheet.version
}

function isOnServer(sheet: Sheet, region: PlateRegion): boolean {
  return sheet.serverIds.includes(region)
}

/** One song chart set (a song's SD or DX charts) and the sheets of it a plate needs */
export interface PlateChart {
  song: Song
  type: typeof TypeEnum.DX | typeof TypeEnum.STD
  /** Version of the chart set: the earliest version among its Basic to Master sheets */
  version: VersionEnum
  requiredSheets: Sheet[]
}

/**
 * The chart sets a plate group needs on a server. A song with SD and DX charts is two chart sets, each placed by
 * its own version. Re:MASTER is only required by 舞 / 覇, and only when the Re:MASTER itself is from the SD era
 * (the in-game `舞ReMASTER` list; a Re:MASTER added in the DX era is not part of it).
 */
export function buildPlateCharts(songs: readonly Song[], group: PlateVersionGroup, region: PlateRegion): PlateChart[] {
  const versions = new Set(group.versions)
  const charts: PlateChart[] = []
  for (const song of songs) {
    for (const type of [TypeEnum.STD, TypeEnum.DX] as const) {
      const sheets = song.sheets.filter((sheet) => sheet.type === type && isOnServer(sheet, region))
      const base = sheets.filter((sheet) => BASE_DIFFICULTIES.includes(sheet.difficulty))
      if (base.length === 0) continue
      const version = earliestVersion(base.map((sheet) => sheetVersionOn(sheet, region)))
      if (!versions.has(version)) continue
      const remaster = group.includesRemaster
        ? sheets.filter(
            (sheet) =>
              sheet.difficulty === DifficultyEnum.ReMaster && SD_VERSION_SET.has(sheetVersionOn(sheet, region)),
          )
        : []
      charts.push({ song, type, version, requiredSheets: [...sortByDifficulty(base), ...remaster] })
    }
  }
  return charts
}

const VERSION_ORDER = Object.values(VersionEnum)
const ORDERED_VERSIONS: readonly VersionEnum[] = [
  ...SD_VERSIONS,
  VersionEnum.Maimaiでらっくす,
  VersionEnum.MaimaiでらっくすPLUS,
  VersionEnum.Splash,
  VersionEnum.SplashPLUS,
  VersionEnum.UNiVERSE,
  VersionEnum.UNiVERSEPLUS,
  VersionEnum.FESTiVAL,
  VersionEnum.FESTiVALPLUS,
  VersionEnum.BUDDiES,
  VersionEnum.BUDDiESPLUS,
  VersionEnum.PRiSM,
  VersionEnum.PRiSMPLUS,
  VersionEnum.CiRCLE,
  VersionEnum.CiRCLEPLUS,
  VersionEnum.MAGiCAL,
]

function versionRank(version: VersionEnum): number {
  const index = ORDERED_VERSIONS.indexOf(version)
  return index === -1 ? ORDERED_VERSIONS.length + VERSION_ORDER.indexOf(version) : index
}

function earliestVersion(versions: VersionEnum[]): VersionEnum {
  return versions.reduce((a, b) => (versionRank(b) < versionRank(a) ? b : a))
}

function sortByDifficulty(sheets: Sheet[]): Sheet[] {
  return [...sheets].sort((a, b) => BASE_DIFFICULTIES.indexOf(a.difficulty) - BASE_DIFFICULTIES.indexOf(b.difficulty))
}

export interface PlateSheetProgress {
  sheet: Sheet
  record: PlateRecord | undefined
  met: boolean
}

export interface PlateChartProgress {
  chart: PlateChart
  sheets: PlateSheetProgress[]
  complete: boolean
  /** No required sheet has a record yet */
  untouched: boolean
}

export interface PlateProgress {
  plate: PlateDefinition
  charts: PlateChartProgress[]
  completedCharts: number
  totalCharts: number
  completedSheets: number
  totalSheets: number
}

/** Evaluates a plate against records keyed by public sheet ID */
export function evaluatePlate({
  songs,
  plate,
  region,
  records,
}: {
  songs: readonly Song[]
  plate: PlateDefinition
  region: PlateRegion
  records: ReadonlyMap<string, PlateRecord>
}): PlateProgress {
  const charts = buildPlateCharts(songs, plate.group, region).map((chart): PlateChartProgress => {
    const sheets = chart.requiredSheets.map((sheet) => {
      const record = records.get(sheet.id)
      return { sheet, record, met: meetsPlateCondition(plate.kind, record) }
    })
    return {
      chart,
      sheets,
      complete: sheets.every((sheet) => sheet.met),
      untouched: sheets.every((sheet) => !sheet.record),
    }
  })
  const allSheets = charts.flatMap((chart) => chart.sheets)
  return {
    plate,
    charts,
    completedCharts: charts.filter((chart) => chart.complete).length,
    totalCharts: charts.length,
    completedSheets: allSheets.filter((sheet) => sheet.met).length,
    totalSheets: allSheets.length,
  }
}