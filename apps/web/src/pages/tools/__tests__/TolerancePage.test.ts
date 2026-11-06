import { catalogSnapshot } from '@gekichumai/dxdata/snapshot'
import { describe, expect, it } from 'vitest'
import { groupResultsBySong, limitResultsBySong } from '../TolerancePage'

describe('limitResultsBySong', () => {
  it('keeps every chart of a matched song, including the ninth one of POP TEAM EPIC', () => {
    const song = catalogSnapshot.songs.find((s) => s.title === 'POP TEAM EPIC')!
    const charts = song.sheets.map((sheet) => ({
      songId: song.id,
      id: sheet.id,
      type: sheet.type,
      difficulty: sheet.difficulty,
    }))
    expect(charts.length).toBeGreaterThanOrEqual(9)
    const others = Array.from({ length: 10 }, (_, i) => ({
      songId: `other${i}`,
      id: `o${i}`,
      type: 'dx',
      difficulty: 'master',
    }))
    const shown = limitResultsBySong([...charts, ...others], 4)
    expect(shown.filter((c) => c.songId === song.id)).toHaveLength(charts.length)
    expect(shown.some((c) => c.type === 'std' && c.difficulty === 'remaster')).toBe(true)
    expect(new Set(shown.map((c) => c.songId)).size).toBe(4)
  })
})

describe('groupResultsBySong', () => {
  it('shows each song once, in first-match order, with every chart kept in order', () => {
    const results = [
      { songId: 'a', id: 'a1' },
      { songId: 'b', id: 'b1' },
      { songId: 'a', id: 'a2' },
      { songId: 'c', id: 'c1' },
      { songId: 'b', id: 'b2' },
    ]
    expect(groupResultsBySong(results)).toEqual([
      { songId: 'a', sheets: [results[0], results[2]] },
      { songId: 'b', sheets: [results[1], results[4]] },
      { songId: 'c', sheets: [results[3]] },
    ])
  })
})