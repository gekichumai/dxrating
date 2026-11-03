import { catalogSnapshot } from '@gekichumai/dxdata/snapshot'
import { buildSongCatalog } from '@gekichumai/maimai-domain'
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