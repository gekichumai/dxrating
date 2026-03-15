export const SCORE_COEFFICIENT_TABLE: [number, number, string][] = [
  [0, 0, 'd'],
  [10, 1.6, 'd'],
  [20, 3.2, 'd'],
  [30, 4.8, 'd'],
  [40, 6.4, 'd'],
  [50, 8, 'c'],
  [60, 9.6, 'b'],
  [70, 11.2, 'bb'],
  [75, 12.0, 'bbb'],
  [79.9999, 12.8, 'bbb'],
  [80, 13.6, 'a'],
  [90, 15.2, 'aa'],
  [94, 16.8, 'aaa'],
  [96.9999, 17.6, 'aaa'],
  [97, 20, 's'],
  [98, 20.3, 'sp'],
  [98.9999, 20.6, 'sp'],
  [99, 20.8, 'ss'],
  [99.5, 21.1, 'ssp'],
  [99.9999, 21.4, 'ssp'],
  [100, 21.6, 'sss'],
  [100.4999, 22.2, 'sss'],
  [100.5, 22.4, 'sssp'],
]

export interface Rating {
  ratingAwardValue: number
  coefficient: number
  rank: string | null
  index: number
}

export interface RatingEntry {
  id: string
  internalLevel: number
  achievementRate: number
  comboFlag?: ComboFlag
}

export interface RatedEntry extends RatingEntry {
  rating: Rating
}

export interface B50Result {
  b15: RatedEntry[]
  b35: RatedEntry[]
  b50Rating: number
}

/**
 * Calculate the B50 rating from a list of entries.
 * @param currentVersionIds - Set of song IDs belonging to the current version (for B15 eligibility)
 * @param entries - List of entries with minimal data needed for rating calculation
 */
export const calculateB50 = (currentVersionIds: Set<string>, entries: RatingEntry[]): B50Result => {
  const rated: RatedEntry[] = entries.map((entry) => ({
    ...entry,
    rating: calculateRating(entry.internalLevel, entry.achievementRate, entry.comboFlag),
  }))

  const byRatingDesc = (a: RatedEntry, b: RatedEntry) => b.rating.ratingAwardValue - a.rating.ratingAwardValue

  const b15 = rated
    .filter((e) => currentVersionIds.has(e.id))
    .sort(byRatingDesc)
    .slice(0, 15)

  const b35 = rated
    .filter((e) => !currentVersionIds.has(e.id))
    .sort(byRatingDesc)
    .slice(0, 35)

  const b50Rating =
    b15.reduce((sum, e) => sum + e.rating.ratingAwardValue, 0) +
    b35.reduce((sum, e) => sum + e.rating.ratingAwardValue, 0)

  return { b15, b35, b50Rating }
}

export type ComboFlag = 'fc' | 'fcp' | 'ap' | 'app' | null

export const calculateRating = (internalLevel: number, achievementRate: number, comboFlag?: ComboFlag): Rating => {
  for (let i = 0; i < SCORE_COEFFICIENT_TABLE.length; i++) {
    if (i === SCORE_COEFFICIENT_TABLE.length - 1 || achievementRate < SCORE_COEFFICIENT_TABLE[i + 1][0]) {
      const coefficient = SCORE_COEFFICIENT_TABLE[i][1]
      const apBonus = comboFlag === 'ap' || comboFlag === 'app' ? 1 : 0
      return {
        ratingAwardValue: Math.floor((coefficient * internalLevel * Math.min(100.5, achievementRate)) / 100) + apBonus,
        coefficient,
        rank: SCORE_COEFFICIENT_TABLE[i][2],
        index: i,
      }
    }
  }

  return {
    ratingAwardValue: 0,
    coefficient: 0,
    rank: 'd',
    index: 99,
  }
}