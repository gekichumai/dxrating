import { describe, expect, it } from 'vitest'
import { type CombinedTags, withSheetTagSongs } from '../useCombinedTags'

const sheet = { song_id: 'dsng_a', sheet_type: 'dx', sheet_difficulty: 'master' }
const other = { song_id: 'dsng_b', sheet_type: 'dx', sheet_difficulty: 'master', tag_id: 1, score: 1 }
const list: CombinedTags = { tags: [], tagGroups: [], tagSongs: [other, { ...sheet, tag_id: 1, score: 1 }] }

describe('withSheetTagSongs', () => {
  it("replaces only this sheet's associations and leaves out buried ones", () => {
    const fresh = [
      { ...sheet, sheet_id: 'dsht_a', tag_id: 2, score: 1 },
      { ...sheet, tag_id: 3, score: -3 },
    ]
    expect(withSheetTagSongs(list, sheet, fresh, -3)?.tagSongs).toEqual([
      other,
      { ...sheet, sheet_id: 'dsht_a', tag_id: 2, score: 1 },
    ])
  })

  it('leaves a list that has not loaded yet alone', () => {
    expect(withSheetTagSongs(undefined, sheet, [], -3)).toBeUndefined()
  })
})