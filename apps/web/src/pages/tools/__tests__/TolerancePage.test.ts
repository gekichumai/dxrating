import { catalogSnapshot } from '@gekichumai/dxdata/snapshot'
import { describe, expect, it } from 'vitest'
import { limitResultsBySong } from '../TolerancePage'

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