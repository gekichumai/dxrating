import { describe, expect, it } from 'vitest'
import { withAttachedTag, type CombinedTags } from '../useCombinedTags'

const tagSong = { song_id: 'dsng_a', sheet_id: 'dsht_a', sheet_type: 'dx', sheet_difficulty: 'master', tag_id: 3 }
const list: CombinedTags = { tags: [], tagGroups: [], tagSongs: [] }

describe('withAttachedTag', () => {
  it('adds the attached association to the shared list', () => {
    expect(withAttachedTag(list, tagSong)?.tagSongs).toEqual([tagSong])
  })

  it('keeps the list when the association is already there', () => {
    const current = { ...list, tagSongs: [tagSong] }
    expect(withAttachedTag(current, { ...tagSong })).toBe(current)
  })

  it('leaves a list that has not loaded yet alone', () => {
    expect(withAttachedTag(undefined, tagSong)).toBeUndefined()
  })
})