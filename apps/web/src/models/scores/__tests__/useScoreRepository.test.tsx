import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { RatingCalculatorContextProvider, useRatingCalculatorContext } from '../../context/RatingCalculatorContext'
import { useScoreRecords, useScoreRepository } from '../useScoreRepository'

const renderRepository = () =>
  renderHook(
    () => ({
      repository: useScoreRepository(),
      records: useScoreRecords(),
      context: useRatingCalculatorContext(),
    }),
    { wrapper: RatingCalculatorContextProvider },
  )

describe('useScoreRepository', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('is the local save behind the rating calculator context', () => {
    window.localStorage.setItem(
      'rating-calculator-entries',
      JSON.stringify([{ sheetId: 'dsht_5mk3yr8gme', achievementRate: 99.1 }]),
    )
    const { result } = renderRepository()

    expect(result.current.repository.kind).toBe('local')
    expect(result.current.context.entries).toEqual([{ sheetId: 'dsht_5mk3yr8gme', achievementRate: 99.1 }])
  })

  it('fills in identities from the catalog for the records', async () => {
    window.localStorage.setItem(
      'rating-calculator-entries',
      JSON.stringify([{ sheetId: 'dsht_e5nsvt8k2a', achievementRate: 100.5 }]),
    )
    const { result } = renderRepository()

    await waitFor(() =>
      expect(result.current.records).toEqual([
        expect.objectContaining({
          sheetId: 'dsht_e5nsvt8k2a',
          identity: { songId: 'dsng_kkx38yfx4t', type: 'dx', difficulty: 'master' },
          achievement: 1005000,
        }),
      ]),
    )
  })

  it('shows repository writes to readers of either view', async () => {
    const { result } = renderRepository()

    act(() => {
      result.current.repository.setManual({ sheetId: 'dsht_e5nsvt8k2a', achievementRate: 99 }, 'typed')
    })
    expect(result.current.context.entries).toEqual([{ sheetId: 'dsht_e5nsvt8k2a', achievementRate: 99 }])
    expect(result.current.records.map((record) => record.achievement)).toEqual([990000])

    act(() => {
      result.current.context.modifyEntries.push({ sheetId: 'dsht_5mk3yr8gme', achievementRate: 98 })
    })
    expect(result.current.repository.entries()).toHaveLength(2)

    act(() => {
      result.current.repository.delete(['dsht_e5nsvt8k2a'])
    })
    expect(result.current.context.entries).toEqual([{ sheetId: 'dsht_5mk3yr8gme', achievementRate: 98 }])

    act(() => {
      result.current.repository.clear()
    })
    expect(result.current.records).toEqual([])
    expect(window.localStorage.getItem('rating-calculator-entries')).toBe('[]')
  })
})