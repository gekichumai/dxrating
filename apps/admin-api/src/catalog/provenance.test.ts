import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Json } from './diff'
import { annotate, type FieldRule, leaves, legacyPath, resolveSources, ruleMatches } from './provenance'

// The producer's rule table, extracted from dxdata-assembly-line `src/output/provenance.rs` (`field_rules`, master
// f8f5640). Real rules, so the matcher and leaf paths are checked against what the producer writes.
const rules = JSON.parse(
  readFileSync(path.join(import.meta.dirname, 'fixtures/producer-field-rules.json'), 'utf8'),
) as FieldRule[]

describe('rule-level provenance', () => {
  it('matches like the producer: exact, or a .* prefix', () => {
    expect(ruleMatches('songs[].title', 'songs[].title')).toBe(true)
    expect(ruleMatches('songs[].title', 'songs[].titles')).toBe(false)
    expect(ruleMatches('songs[].sheets[].regionOverrides.intl.*', 'songs[].sheets[].regionOverrides.intl.level')).toBe(
      true,
    )
    expect(ruleMatches('songs[].sheets[].regionOverrides.intl.*', 'songs[].sheets[].regionOverrides.intl')).toBe(true)
    expect(ruleMatches('songs[].sheets[].regionOverrides.intl.*', 'songs[].sheets[].regionOverrides.intlx')).toBe(false)
  })

  it('writes leaf paths in the producer form', () => {
    expect(
      leaves({ songId: 'x', searchAcronyms: ['a', 'b'], empty: [], o: { k: 1, e: {} }, sheets: [] }, 'songs[]', [
        'sheets',
      ]),
    ).toEqual([
      { path: 'songId', outputPath: 'songs[].songId', value: 'x' },
      { path: 'searchAcronyms', outputPath: 'songs[].searchAcronyms[]', value: ['a', 'b'] },
      { path: 'empty', outputPath: 'songs[].empty', value: [] },
      { path: 'o.k', outputPath: 'songs[].o.k', value: 1 },
      { path: 'o.e', outputPath: 'songs[].o.e', value: {} },
    ])
  })

  it('finds a producer rule for every field of the real catalog, as the producer’s coverage check requires', () => {
    const catalog = JSON.parse(
      readFileSync(path.resolve(import.meta.dirname, '../../../../packages/dxdata/dxdata.json'), 'utf8'),
    ) as { songs: Record<string, Json>[] }
    const unmatched = new Set<string>()
    for (const song of catalog.songs) {
      const fields = [
        ...leaves(song, 'songs[]', ['sheets']),
        ...(song.sheets as Record<string, Json>[]).flatMap((sheet) => leaves(sheet, 'songs[].sheets[]')),
      ]
      for (const field of fields)
        if (!rules.some((rule) => ruleMatches(rule.outputPath, field.outputPath))) unmatched.add(field.outputPath)
    }
    expect([...unmatched]).toEqual([])
  })

  it('covers every field of the real published catalog: a legacy rule, the reading’s own source, or a note', () => {
    const published = JSON.parse(
      readFileSync(path.resolve(import.meta.dirname, '../../../../packages/dxdata/snapshot.json'), 'utf8'),
    ) as { songs: Record<string, Json>[] }
    const uncovered = new Set<string>()
    for (const song of published.songs) {
      const fields = [
        ...annotate(leaves(song, 'songs[]', ['sheets']), rules, null, song),
        ...(song.sheets as Record<string, Json>[]).flatMap((sheet) =>
          annotate(leaves(sheet, 'songs[].sheets[]'), rules, null),
        ),
      ]
      for (const field of fields) if (!field.rule && !field.note) uncovered.add(field.outputPath)
    }
    expect([...uncovered]).toEqual([])
    expect(legacyPath('songs[].sheets[].serverIds[]')).toBe('songs[].sheets[].regions.jp')
  })

  it('resolves per-song lineage sources to the source this song came from', () => {
    const lineage = { catalog: 'sega_official_jp', enrichment: null, regions: ['sega_official_jp', 'maimai_cn'] }
    expect(
      resolveSources(
        ['assembly.songs.*.catalog', 'assembly.songs.*.enrichment', 'assembly.songs.*.regions', 'viscum_json'],
        lineage,
      ),
    ).toEqual([
      { source: 'assembly.songs.*.catalog', resolved: ['sega_official_jp'] },
      { source: 'assembly.songs.*.enrichment', resolved: [] },
      { source: 'assembly.songs.*.regions', resolved: ['sega_official_jp', 'maimai_cn'] },
      { source: 'viscum_json', resolved: null },
    ])
  })

  it('annotates each field with its rule, or null without a manifest', () => {
    const [title] = annotate([{ path: 'title', outputPath: 'songs[].title', value: 'T' }], rules, {
      catalog: 'otoge_db',
    })
    expect(title!.rule?.outputPath).toBe('songs[].title')
    expect(title!.rule?.sources[0]).toEqual({ source: 'assembly.songs.*.catalog', resolved: ['otoge_db'] })
    expect(title!.rule?.transforms.length).toBeGreaterThan(0)
    expect(annotate([{ path: 'title', outputPath: 'songs[].title', value: 'T' }], null, null)[0]!.rule).toBeNull()
  })
})