import { describe, expect, it } from 'vitest'
import type { PlayEntry } from '../../../components/rating/RatingCalculatorAddEntryForm'
import {
  type ChartScore,
  classifyChange,
  diffEntries,
  isRiskyPlan,
  planChangesSave,
  planImport,
  summarizeEntries,
} from '../importPlan'
import { LocalScoreRepository } from '../LocalScoreRepository'

const entry = (sheetId: string, achievementRate: number, extra: Partial<PlayEntry> = {}): PlayEntry => ({
  sheetId,
  achievementRate,
  ...extra,
})

const score = (achievementRate: number, extra: Partial<ChartScore> = {}): ChartScore => ({
  achievementRate,
  comboFlag: null,
  syncFlag: null,
  dxScore: null,
  ...extra,
})

describe('summarizeEntries', () => {
  it('collapses duplicate entries of a chart field by field', () => {
    const charts = summarizeEntries([
      entry('a', 99, { comboFlag: 'ap', dxScore: 1000 }),
      entry('a', 100.5, { syncFlag: 'fs' }),
      entry('b', 97),
    ])
    expect([...charts.keys()]).toEqual(['a', 'b'])
    expect(charts.get('a')).toEqual({ achievementRate: 100.5, comboFlag: 'ap', syncFlag: 'fs', dxScore: 1000 })
  })

  it('skips entries without a sheet ID or a finite achievement', () => {
    const charts = summarizeEntries([
      entry('a', Number.NaN),
      { achievementRate: 99 } as PlayEntry,
      null as unknown as PlayEntry,
      entry('b', 98),
    ])
    expect([...charts.keys()]).toEqual(['b'])
  })
})

describe('classifyChange', () => {
  it('reads a higher field with none lower as improved', () => {
    expect(classifyChange(score(99), score(100))).toBe('improved')
    expect(classifyChange(score(99), score(99, { comboFlag: 'fc' }))).toBe('improved')
    expect(classifyChange(score(99, { dxScore: 10 }), score(99, { dxScore: 11 }))).toBe('improved')
  })

  it('reads identical scores as unchanged, and a missing DX score as no change', () => {
    expect(classifyChange(score(99, { syncFlag: 'fs' }), score(99, { syncFlag: 'fs' }))).toBe('unchanged')
    expect(classifyChange(score(99, { dxScore: 1200 }), score(99))).toBe('unchanged')
  })

  it('reads any lower field as lowered, even with another one higher', () => {
    expect(classifyChange(score(100), score(99))).toBe('lowered')
    expect(classifyChange(score(99, { comboFlag: 'ap' }), score(100, { comboFlag: 'fc' }))).toBe('lowered')
    expect(classifyChange(score(99, { syncFlag: 'fsd' }), score(99, { syncFlag: 'sync' }))).toBe('lowered')
    expect(classifyChange(score(99, { dxScore: 2000 }), score(99, { dxScore: 1999 }))).toBe('lowered')
  })
})

describe('diffEntries', () => {
  it('counts every kind of change', () => {
    const { counts, changes } = diffEntries(
      [entry('same', 99), entry('up', 98), entry('down', 100), entry('gone', 97)],
      [entry('same', 99), entry('up', 99), entry('down', 99.5), entry('new', 95)],
    )
    expect(counts).toEqual({ added: 1, improved: 1, unchanged: 1, lowered: 1, removed: 1 })
    expect(changes.find((change) => change.sheetId === 'gone')).toEqual({
      sheetId: 'gone',
      kind: 'removed',
      before: score(97),
      after: null,
    })
  })
})

describe('planImport', () => {
  const current = [entry('kept', 100), entry('dropped', 99), entry('lower', 100.5), entry('much-lower', 100.5)]
  const imported = [entry('kept', 100.2), entry('lower', 100.4), entry('much-lower', 97), entry('new', 98)]

  it('previews a replace: what the import drops and lowers is risky, removed first, then the largest drop', () => {
    const plan = planImport(current, imported, { source: 'lxns', mode: 'replace' })
    expect(plan.counts).toEqual({ added: 1, improved: 1, unchanged: 0, lowered: 2, removed: 1 })
    expect(plan.risky.map((change) => change.sheetId)).toEqual(['dropped', 'much-lower', 'lower'])
    expect(plan.importedCount).toBe(4)
    expect(plan.previousEntries).toBe(current)
    expect(isRiskyPlan(plan)).toBe(true)
    expect(planChangesSave(plan)).toBe(true)
  })

  it('previews a merge: nothing is removed and a lower achievement is kept', () => {
    const plan = planImport(current, imported, { source: 'maimai-net', mode: 'merge' })
    expect(plan.counts).toEqual({ added: 1, improved: 1, unchanged: 3, lowered: 0, removed: 0 })
    expect(plan.risky).toEqual([])
  })

  it('flags a merge that lowers a flag along with a higher achievement', () => {
    const plan = planImport([entry('a', 99, { comboFlag: 'ap' })], [entry('a', 100, { comboFlag: 'fc' })], {
      source: 'maimai-net',
      mode: 'merge',
    })
    expect(plan.risky).toMatchObject([{ sheetId: 'a', kind: 'lowered' }])
  })

  it('reports no change for an import identical to the save', () => {
    const plan = planImport(current, current, { source: 'dxrating-json', mode: 'replace' })
    expect(planChangesSave(plan)).toBe(false)
    expect(plan.counts.unchanged).toBe(4)
  })

  it('previews exactly the save applyImport writes', async () => {
    for (const mode of ['merge', 'replace'] as const) {
      const repository = LocalScoreRepository.inMemory(current)
      const plan = planImport(repository.entries(), imported, { source: 'lxns', mode })
      await repository.applyImport(imported, { source: 'lxns', mode })
      expect(repository.entries()).toEqual(plan.nextEntries)
    }
  })
})