import { describe, expect, it } from 'vitest'
import { getCatalogDocument } from '@/catalog/catalogSource'
import en from '../../../../messages/en.json'
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
    const messages = en as Record<string, unknown>
    // Message ids camel-case the kebab-case feature id: `tap-hold` → `tapHold`
    const id = (featureId: string) => featureId.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase())
    for (const feature of HOME_FEATURES) {
      expect(messages[`home_features_${id(feature.id)}_title`]).toBeTruthy()
      expect(messages[`home_features_${id(feature.id)}_description`]).toBeTruthy()
    }
  })
})