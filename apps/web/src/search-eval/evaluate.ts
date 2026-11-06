import { VersionEnum } from '@gekichumai/dxdata'
import { catalogSnapshot } from '@gekichumai/dxdata/snapshot'
import { getSongCatalog } from '@gekichumai/maimai-domain'
import { createSheetsSearchEngine, getFlattenedSheets, type FlattenedSheet } from '@/songs'

export interface EvalCase {
  query: string
  expected: string[]
  bucket: string
  script: string
  source: 'synthetic' | 'posthog' | 'alias'
  note?: string
  hits?: number
}

export interface EvalSet {
  snapshotUpdatedAt: string
  cases: EvalCase[]
}

export interface Metrics {
  n: number
  'R@1': number
  'R@5': number
  'R@10': number
  MRR: number
}

export interface CaseResult {
  case: EvalCase
  /** 1-based rank of the first expected song among the ranked distinct songs, or null when it is not returned */
  rank: number | null
  top: string[]
}

export interface EvalReport {
  overall: Metrics
  bySource: Record<string, Metrics>
  byBucket: Record<string, Metrics>
  byScript: Record<string, Metrics>
  /** Cases whose expected songs have no sheet in the evaluated version */
  skipped: number
  results: CaseResult[]
  timing: { indexMs: number; meanQueryMs: number; p95QueryMs: number }
}

/** The current game version, which the site shows by default. Move it forward with each version and rebaseline. */
export const EVAL_VERSION = VersionEnum.MAGiCAL

/** The production search path: the snapshot songs and sheets with the community aliases as server aliases */
export function createEvalSearch() {
  const sheets = getFlattenedSheets(getSongCatalog(catalogSnapshot, EVAL_VERSION))
  const search = createSheetsSearchEngine({
    songs: catalogSnapshot.songs,
    sheets,
    serverAliases: catalogSnapshot.aliases,
  })
  return { search, sheets }
}

const round = (value: number) => Math.round(value * 10000) / 10000

function summarise(results: readonly CaseResult[]): Metrics {
  const n = results.length
  const within = (k: number) => results.filter(({ rank }) => rank !== null && rank <= k).length / (n || 1)
  const mrr = results.reduce((sum, { rank }) => sum + (rank ? 1 / rank : 0), 0) / (n || 1)
  return { n, 'R@1': round(within(1)), 'R@5': round(within(5)), 'R@10': round(within(10)), MRR: round(mrr) }
}

function groupBy(results: readonly CaseResult[], key: (result: CaseResult) => string) {
  const groups = new Map<string, CaseResult[]>()
  for (const result of results) {
    const name = key(result)
    groups.set(name, [...(groups.get(name) ?? []), result])
  }
  return Object.fromEntries(
    [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, group]) => [name, summarise(group)]),
  )
}

/** Distinct songs in result order */
function rankedSongs(sheets: readonly FlattenedSheet[]) {
  const songs: string[] = []
  const seen = new Set<string>()
  for (const sheet of sheets) {
    if (seen.has(sheet.songId)) continue
    seen.add(sheet.songId)
    songs.push(sheet.songId)
  }
  return songs
}

export function evaluate(
  cases: readonly EvalCase[],
  createSearch: () => {
    search: (term: string) => FlattenedSheet[]
    sheets: readonly FlattenedSheet[]
  } = createEvalSearch,
): EvalReport {
  const indexStart = performance.now()
  const { search, sheets } = createSearch()
  // The engine builds its index on the first query
  search('index warmup')
  const indexMs = performance.now() - indexStart

  const available = new Set(sheets.map((sheet) => sheet.songId))
  const titleBySong = new Map(sheets.map((sheet) => [sheet.songId, sheet.title]))
  const results: CaseResult[] = []
  const durations: number[] = []
  let skipped = 0
  for (const entry of cases) {
    const expected = entry.expected.filter((id) => available.has(id))
    if (!expected.length) {
      skipped++
      continue
    }
    const start = performance.now()
    const songs = rankedSongs(search(entry.query))
    durations.push(performance.now() - start)
    const index = songs.findIndex((id) => expected.includes(id))
    results.push({
      case: entry,
      rank: index === -1 ? null : index + 1,
      top: songs.slice(0, 3).map((id) => titleBySong.get(id) ?? id),
    })
  }

  durations.sort((a, b) => a - b)
  return {
    overall: summarise(results),
    bySource: groupBy(results, (result) => result.case.source),
    byBucket: groupBy(results, (result) => result.case.bucket),
    byScript: groupBy(results, (result) => `${result.case.source}:${result.case.script}`),
    skipped,
    results,
    timing: {
      indexMs: Math.round(indexMs),
      meanQueryMs: round(durations.reduce((sum, value) => sum + value, 0) / (durations.length || 1)),
      p95QueryMs: round(durations[Math.floor(durations.length * 0.95)] ?? 0),
    },
  }
}

export function formatReport(report: EvalReport, { failures = 40 }: { failures?: number } = {}) {
  const table = (title: string, rows: Record<string, Metrics>) => {
    const lines = [`\n${title}`, `${'name'.padEnd(34)} ${'n'.padStart(5)}   R@1    R@5    R@10   MRR`]
    for (const [name, metrics] of Object.entries(rows)) {
      lines.push(
        `${name.padEnd(34)} ${String(metrics.n).padStart(5)}  ${[
          metrics['R@1'],
          metrics['R@5'],
          metrics['R@10'],
          metrics.MRR,
        ]
          .map((value) => value.toFixed(3))
          .join('  ')}`,
      )
    }
    return lines.join('\n')
  }
  const missed = report.results.filter(({ rank }) => rank === null || rank > 10)
  const failureLines = missed
    .slice(0, failures)
    .map(
      ({ case: entry, rank, top }) =>
        `  [${entry.bucket}] ${JSON.stringify(entry.query)} -> ${entry.note ?? entry.expected.join(',')} (rank ${rank ?? '-'}; got ${top.join(' / ') || 'nothing'})`,
    )
  return [
    table('overall', { overall: report.overall }),
    table('by source', report.bySource),
    table('by bucket', report.byBucket),
    table('by source:script', report.byScript),
    `\nskipped (no sheet in ${EVAL_VERSION}): ${report.skipped}`,
    `timing: index ${report.timing.indexMs} ms, query mean ${report.timing.meanQueryMs} ms, p95 ${report.timing.p95QueryMs} ms`,
    `\nmissed (not in top 10): ${missed.length}, showing ${failureLines.length}`,
    ...failureLines,
  ].join('\n')
}