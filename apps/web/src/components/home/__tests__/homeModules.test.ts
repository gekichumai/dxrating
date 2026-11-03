import { describe, expect, it } from 'vitest'
import { getCatalogDocument } from '@/catalog/catalogSource'
import en from '@/locales/resources/en.json'
import { buildHomeRecentSongs, HOME_FEATURES, HOME_RECENT_SONG_LIMIT } from '../homeModules'

describe('home hub modules', () => {
  it('lists the newest songs once each, newest first', async () => {
    const songs = buildHomeRecentSongs(await getCatalogDocument())

    expect(songs).toHaveLength(HOME_RECENT_SONG_LIMIT)
    expect(new Set(songs.map((song) => song.songId)).size).toBe(songs.length)
    const dates = songs.flatMap((song) => (song.releaseDate ? [song.releaseDate] : []))
    expect(dates).toEqual([...dates].sort().reverse())
  })

  it('has a localized title and description for every feature card', () => {
    const home = en.home as Record<string, string>
    for (const feature of HOME_FEATURES) {
      expect(home[`features.${feature.id}.title`]).toBeTruthy()
      expect(home[`features.${feature.id}.description`]).toBeTruthy()
    }
  })
})