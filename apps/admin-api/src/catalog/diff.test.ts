import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import { diffCatalogs, diffFields, filterByPath, type Json } from './diff'

const sheet = (difficulty: string, extra: Record<string, Json> = {}) => ({
  type: 'dx',
  difficulty,
  level: '13',
  internalLevelValue: 13.5,
  noteCounts: { tap: 100, total: 200 },
  regions: { jp: true, cn: false },
  regionOverrides: { intl: {} },
  ...extra,
})
const song = (songId: string, sheets: Json[], extra: Record<string, Json> = {}) => ({
  songId,
  title: `Title ${songId}`,
  artist: 'Synthetic',
  searchAcronyms: ['a'],
  sheets,
  ...extra,
})

describe('diffFields', () => {
  it('compares leaves, keeps absent apart from null, treats a plain list as one value', () => {
    expect(
      diffFields(
        { a: 1, b: { c: 2, d: 3 }, e: null, list: ['x', 'y'], gone: 1, empty: {} },
        { a: 1, b: { c: 2, d: 4 }, list: ['y', 'x'], e: 0, added: false },
      ),
    ).toEqual([
      { path: 'added', after: false },
      { path: 'b.d', before: 3, after: 4 },
      { path: 'e', before: null, after: 0 },
      { path: 'empty', before: {} },
      { path: 'gone', before: 1 },
      { path: 'list', before: ['x', 'y'], after: ['y', 'x'] },
    ])
  })

  it('ignores key order', () => {
    expect(diffFields({ o: { x: 1, y: 2 } }, { o: { y: 2, x: 1 } })).toEqual([])
  })
})

describe('diffCatalogs', () => {
  const before = {
    songs: [
      song('kept', [sheet('expert'), sheet('master')]),
      song('gone', [sheet('master')]),
      song('same', [sheet('master')]),
    ],
    versions: [{ version: 'PRiSM' }],
    updateTime: '2026-11-01',
  }
  const after = {
    songs: [
      song('new', [sheet('basic'), sheet('master')]),
      song(
        'kept',
        [sheet('master', { internalLevelValue: 13.7, regions: { jp: true, cn: true } }), sheet('remaster')],
        {
          artist: 'Renamed',
        },
      ),
      song('same', [sheet('master')]),
    ],
    versions: [{ version: 'PRiSM' }, { version: 'CiRCLE' }],
    updateTime: '2026-11-02',
  }
  const diff = diffCatalogs(before, after)

  it('summarises songs, sheets and fields', () => {
    expect(diff.summary).toEqual({
      songsAdded: 1,
      songsRemoved: 1,
      songsChanged: 1,
      sheetsAdded: 3,
      sheetsRemoved: 2,
      sheetsChanged: 1,
      fieldChanges: 3,
    })
  })

  it('lists songs in the newer order, then the removed ones, with sheet-level changes', () => {
    expect(diff.songs.map((s) => [s.songId, s.kind])).toEqual([
      ['new', 'added'],
      ['kept', 'changed'],
      ['gone', 'removed'],
    ])
    const kept = diff.songs[1]!
    expect(kept.fields).toEqual([{ path: 'artist', before: 'Synthetic', after: 'Renamed' }])
    expect(kept.sheets).toEqual([
      {
        type: 'dx',
        difficulty: 'master',
        kind: 'changed',
        fields: [
          { path: 'internalLevelValue', before: 13.5, after: 13.7 },
          { path: 'regions.cn', before: false, after: true },
        ],
      },
      { type: 'dx', difficulty: 'remaster', kind: 'added', fields: [] },
      { type: 'dx', difficulty: 'expert', kind: 'removed', fields: [] },
    ])
  })

  it('counts by path pattern and filters by one', () => {
    expect(diff.pathCounts).toEqual([
      { path: 'sheets[]', count: 2 },
      { path: 'artist', count: 1 },
      { path: 'sheets[].internalLevelValue', count: 1 },
      { path: 'sheets[].regions.cn', count: 1 },
      { path: 'songs (added)', count: 1 },
      { path: 'songs (removed)', count: 1 },
    ])
    const levels = filterByPath(diff.songs, 'sheets[].internalLevelValue')
    expect(levels).toHaveLength(1)
    expect(levels[0]!.fields).toEqual([])
    expect(levels[0]!.sheets).toEqual([
      {
        type: 'dx',
        difficulty: 'master',
        kind: 'changed',
        fields: [{ path: 'internalLevelValue', before: 13.5, after: 13.7 }],
      },
    ])
    expect(filterByPath(diff.songs, 'sheets[]')[0]!.sheets.map((s) => s.kind)).toEqual(['added', 'removed'])
    expect(filterByPath(diff.songs, 'songs (added)').map((s) => s.songId)).toEqual(['new'])
  })

  it('compares the other lists as sets and reports updateTime apart', () => {
    expect(diff.lists).toEqual([
      { key: 'versions', beforeCount: 1, afterCount: 2, added: [{ version: 'CiRCLE' }], removed: [] },
    ])
    expect(diff.updateTime).toEqual({ before: '2026-11-01', after: '2026-11-02' })
  })

  it('finds nothing between a catalog and itself, including the real one, quickly', () => {
    const file = path.resolve(import.meta.dirname, '../../../../packages/dxdata/dxdata.json')
    const text = readFileSync(file, 'utf8')
    const started = performance.now()
    const real = diffCatalogs(JSON.parse(text), JSON.parse(text))
    const elapsed = performance.now() - started
    expect(real.songs).toEqual([])
    expect(real.lists).toEqual([])
    expect(elapsed).toBeLessThan(5000)
  })
})