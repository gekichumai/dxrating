// Search recall eval: runs every case in eval-set.json through the production sheet search and compares the metrics
// with baseline.json. No bucket may get worse.
//
//   pnpm --filter @gekichumai/dxrating-web search:eval          # write the report and the misses to search-eval.txt
//   pnpm --filter @gekichumai/dxrating-web search:eval:update   # accept the current metrics as the new baseline

import { catalogSnapshot } from '@gekichumai/dxdata/snapshot'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import baseline from './baseline.json'
import evalSet from './eval-set.json'
import { evaluate, formatReport, type EvalSet, type Metrics } from './evaluate'

/** Metric drops smaller than this are float rounding, not regressions */
const EPSILON = 0.0005
const METRICS = ['R@1', 'R@5', 'R@10', 'MRR'] as const

interface Baseline {
  snapshotUpdatedAt: string
  overall: Metrics
  bySource: Record<string, Metrics>
  byBucket: Record<string, Metrics>
}

describe('search recall eval', () => {
  const set = evalSet as EvalSet
  const report = evaluate(set.cases)

  if (process.env.SEARCH_EVAL_REPORT) {
    // A file, because vitest buffers console output from the collection phase
    const text = formatReport(report, { failures: Number(process.env.SEARCH_EVAL_FAILURES ?? 100) })
    fs.writeFileSync(path.resolve(process.env.SEARCH_EVAL_REPORT), `${text}\n`)
  }

  if (process.env.SEARCH_EVAL_UPDATE) {
    const next: Baseline = {
      snapshotUpdatedAt: set.snapshotUpdatedAt,
      overall: report.overall,
      bySource: report.bySource,
      byBucket: report.byBucket,
    }
    fs.writeFileSync(path.join(__dirname, 'baseline.json'), `${JSON.stringify(next, null, 2)}\n`)
  }

  it('was generated from the bundled catalog snapshot', () => {
    // A snapshot refresh can move songs in or out of the current version; regenerate the set and the baseline then.
    expect(set.snapshotUpdatedAt).toBe(catalogSnapshot.updatedAt)
  })

  it.skipIf(!!process.env.SEARCH_EVAL_UPDATE)('does not regress any bucket against the baseline', () => {
    const previous = baseline as Baseline
    const regressions: string[] = []
    const compare = (scope: string, before: Record<string, Metrics>, after: Record<string, Metrics>) => {
      for (const [name, old] of Object.entries(before)) {
        const current = after[name]
        if (!current) {
          regressions.push(`${scope} ${name}: missing from the current run`)
          continue
        }
        for (const metric of METRICS) {
          if (current[metric] < old[metric] - EPSILON) {
            regressions.push(`${scope} ${name} ${metric}: ${old[metric]} -> ${current[metric]}`)
          }
        }
      }
    }
    compare('overall', { overall: previous.overall }, { overall: report.overall })
    compare('source', previous.bySource, report.bySource)
    compare('bucket', previous.byBucket, report.byBucket)
    expect(regressions).toEqual([])
  })
})