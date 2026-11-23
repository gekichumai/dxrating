import type { SongCatalog } from './song-catalog'
import type { Best50Bucket, RatingEntry, RatingEntryFields, StoredPlay } from './types'

export function mintRatingEntry(fields: RatingEntryFields): RatingEntry {
  return fields as RatingEntry
}

/** The Diving-Fish best 50 hint of a stored play: its `providerConfig`, else a Diving-Fish `source`'s */
export function best50HintOf(play: Pick<StoredPlay, 'source' | 'providerConfig'>): Best50Bucket | null {
  return (
    play.providerConfig?.divingFish?.ratingEligibility ??
    (play.source?.provider === 'diving-fish' ? play.source.best50Bucket : undefined) ??
    null
  )
}

/** A stored play as `calculateBest50` input; null while the catalog does not know its chart */
export function toRatingEntry(play: StoredPlay, catalog: SongCatalog): RatingEntry | null {
  const identity = play.identity ?? catalog.getById(play.sheetId)?.identity
  if (!identity) return null
  const hint = best50HintOf(play)
  return mintRatingEntry({
    sheetId: play.sheetId,
    identity,
    achievementRate: play.achievementRate,
    comboFlag: play.comboFlag,
    syncFlag: play.syncFlag,
    source: hint ? { provider: 'diving-fish', best50Bucket: hint } : play.source,
  })
}

/** Every stored play, duplicates included (`calculateBest50` keeps each chart's best by rating) */
export function toRatingEntries(plays: readonly StoredPlay[], catalog: SongCatalog): RatingEntry[] {
  return plays.flatMap((play) => toRatingEntry(play, catalog) ?? [])
}