import { describe, expect, it } from 'vitest'
import { RANK_COEFFICIENT_ROWS } from '../RatingExplainer'

describe('RANK_COEFFICIENT_ROWS', () => {
  it('lists one row per rank from SSS+ down to A with its lowest achievement', () => {
    expect(RANK_COEFFICIENT_ROWS.map((row) => row.label)).toEqual([
      'SSS+',
      'SSS',
      'SS+',
      'SS',
      'S+',
      'S',
      'AAA',
      'AA',
      'A',
    ])
    expect(RANK_COEFFICIENT_ROWS[0]).toEqual({ label: 'SSS+', achievement: 100.5, coefficient: 22.4, rating: 330 })
    expect(RANK_COEFFICIENT_ROWS[1]).toMatchObject({ label: 'SSS', achievement: 100, coefficient: 21.6 })
  })
})