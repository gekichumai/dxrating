import { catalogSnapshot } from '@gekichumai/dxdata/snapshot'
import { buildSongCatalog, calculateBest50, recommendRatingRaises } from '@gekichumai/maimai-domain'
import { act } from '@testing-library/react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { PlayEntry } from '@/components/rating/RatingCalculatorAddEntryForm'
import { RatingCalculatorContext } from '../context/RatingCalculatorContext'
import { useUserRecords } from '../useUserRecords'
import { groupUserRecords, toRatingEntries } from '../userRecords'

const catalog = buildSongCatalog(catalogSnapshot, 'MAGiCAL' as never)
vi.mock('@/catalog/CatalogContext', () => ({ useSongCatalog: () => catalog }))

const sheetId = 'dsht_8rsgpcbmn6'

function Count() {
  const { records } = useUserRecords()
  return <output>{records.length}</output>
}

const withEntries = (entries: PlayEntry[]) => (
  <RatingCalculatorContext.Provider value={{ entries, modifyEntries: {} as never }}>
    <Count />
  </RatingCalculatorContext.Provider>
)

describe('useUserRecords', () => {
  it('hydrates saved scores without a mismatch, then reveals them', async () => {
    const saved: PlayEntry[] = [{ sheetId, achievementRate: 100.1 }]
    const container = document.createElement('div')
    container.innerHTML = renderToString(withEntries([]))
    expect(container.textContent).toBe('0')
    const errors: unknown[] = []
    await act(async () => {
      hydrateRoot(container, withEntries(saved), { onRecoverableError: (error) => errors.push(error) })
    })
    expect(errors).toEqual([])
    expect(container.textContent).toBe('1')
  })
})

describe('groupUserRecords', () => {
  const group = (entries: PlayEntry[]) => groupUserRecords(entries, () => null).get(sheetId)!

  it('keeps flags earned in a lower-scoring duplicate', () => {
    const record = group([
      { sheetId, achievementRate: 100.1, comboFlag: 'fc', syncFlag: null },
      { sheetId, achievementRate: 99.9, comboFlag: 'ap', syncFlag: 'fsd' },
    ])
    expect(record.entry.achievementRate).toBe(100.1)
    expect(record.best).toEqual({ achievementRate: 100.1, comboFlag: 'ap', syncFlag: 'fsd' })
  })

  it('merges flags of equal-score duplicates', () => {
    const record = group([
      { sheetId, achievementRate: 100, comboFlag: 'fcp', syncFlag: 'fsdp' },
      { sheetId, achievementRate: 100, comboFlag: 'app', syncFlag: 'fs' },
    ])
    expect(record.best).toEqual({ achievementRate: 100, comboFlag: 'app', syncFlag: 'fsdp' })
  })

  it('keeps a bucket hint carried by a lower-scoring duplicate', () => {
    const record = group([
      { sheetId, achievementRate: 100.1 },
      { sheetId, achievementRate: 99, providerConfig: { divingFish: { ratingEligibility: 'b35' } } },
    ])
    expect(record.source).toEqual({ provider: 'diving-fish', best50Bucket: 'b35' })
  })
})

describe('toRatingEntries', () => {
  it('keeps duplicates and maps the persisted Diving Fish bucket to a source hint', () => {
    const entries = toRatingEntries(
      [
        { sheetId, achievementRate: 100.5, comboFlag: 'ap' },
        { sheetId, achievementRate: 100.6, providerConfig: { divingFish: { ratingEligibility: 'b15' } } },
      ],
      catalog,
    )
    expect(entries).toHaveLength(2)
    expect(entries[1]!.source).toEqual({ provider: 'diving-fish', best50Bucket: 'b15' })
    expect(entries[0]!.identity).toBeDefined()
  })
})
describe('grouped bucket hints agree with calculateBest50', () => {
  const version = 'PRiSM' as never
  const cnCatalog = buildSongCatalog(catalogSnapshot, version)
  const cnMasters = cnCatalog.sheets.filter(
    (s) => s.difficulty === 'master' && s.serverIds.includes('cn') && s.isRatingEligible,
  )
  const fillers = cnMasters.filter((s) => s.version === 'PRiSM' && s.internalLevelValue >= 13).slice(0, 15)
  // An old chart: B35 by version, B15 by the provider hint on its lower-scoring duplicate
  const target = cnMasters.find(
    (s) => s.version === 'FiNALE' && s.internalLevelValue >= 12 && s.internalLevelValue < 13,
  )!
  const hint = { divingFish: { ratingEligibility: 'b15' as const } }

  it.each([
    ['hinted duplicate last', false],
    ['hinted duplicate first', true],
  ])('prefers a Diving Fish hint over a non-hinted source (%s)', (_case, hintedFirst) => {
    const high: PlayEntry = { sheetId: target.id, achievementRate: 99, source: { provider: 'lxns' } as never }
    const low: PlayEntry = { sheetId: target.id, achievementRate: 98, providerConfig: hint }
    const entries: PlayEntry[] = [
      ...fillers.map((s) => ({ sheetId: s.id, achievementRate: 100.5, providerConfig: hint })),
      ...(hintedFirst ? [low, high] : [high, low]),
    ]
    const ratingEntries = toRatingEntries(entries, cnCatalog)
    const best50 = calculateBest50({ catalog: cnCatalog, version, region: 'cn', entries: ratingEntries })
    expect(best50.b15).toHaveLength(15)
    const grouped = groupUserRecords(entries, (id) => cnCatalog.getById(id))
    expect(grouped.get(target.id)!.source).toEqual({ provider: 'diving-fish', best50Bucket: 'b15' })
    const records = new Map([...grouped].map(([id, r]) => [id, { ...r.entry, source: r.source }]))
    const [rec] = recommendRatingRaises({ sheets: [target], best50, records, version, region: 'cn' })
    const recalculated = (rate: number) =>
      calculateBest50({
        catalog: cnCatalog,
        version,
        region: 'cn',
        entries: [...ratingEntries, { ...ratingEntries.at(-1)!, achievementRate: rate, source: undefined }],
      }).statistics.b50Sum - best50.statistics.b50Sum
    if (rec) expect(rec.gain).toBe(recalculated(rec.targetAchievement))
    else expect(recalculated(100.5)).toBe(0)
  })
})