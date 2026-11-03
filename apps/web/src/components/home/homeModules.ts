import type { SongCatalogDocument } from '@gekichumai/dxdata'
import type { LinkProps } from '@tanstack/react-router'
import { buildRecentChartLinks } from '@/components/chartDiscovery/recentCharts'

export const HOME_RECENT_SONG_LIMIT = 8

export type HomeRecentSong = {
  songId: string
  title: string
  imageName: string
  href: string
  releaseDate?: string
}

/** The newest songs of the catalog, one card per song (linking its newest chart). User-agnostic: safe in cached HTML */
export const buildHomeRecentSongs = (
  document: SongCatalogDocument,
  limit = HOME_RECENT_SONG_LIMIT,
): HomeRecentSong[] => {
  const songs: HomeRecentSong[] = []
  const seen = new Set<string>()
  for (const chart of buildRecentChartLinks(document)) {
    if (chart.isTypeUtage || seen.has(chart.songId)) continue
    seen.add(chart.songId)
    songs.push({
      songId: chart.songId,
      title: chart.title,
      imageName: chart.imageName,
      href: `/songs/${encodeURIComponent(chart.songId)}`,
      releaseDate: chart.releaseDate,
    })
    if (songs.length >= limit) break
  }
  return songs
}

export type HomeFeatureId =
  | 'rating'
  | 'plates'
  | 'constants'
  | 'level_progress'
  | 'toplists'
  | 'tolerance'
  | 'rating_tools'
  | 'recommend'
  | 'random'
  | 'recent'
  | 'trending'
  | 'versions'

/** `to` is checked against the generated route tree, so a card can only point at a route that exists */
export type HomeFeature = { id: HomeFeatureId; to: NonNullable<LinkProps['to']> }

export const HOME_FEATURES: readonly HomeFeature[] = [
  { id: 'rating', to: '/rating' },
  { id: 'plates', to: '/plates' },
  { id: 'constants', to: '/constants' },
  { id: 'level_progress', to: '/me/progress' },
  { id: 'toplists', to: '/me/records' },
  { id: 'recent', to: '/charts/recent' },
  { id: 'trending', to: '/charts/trending' },
  { id: 'versions', to: '/versions' },
]