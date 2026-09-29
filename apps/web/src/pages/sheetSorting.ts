import { dxdata } from '@gekichumai/dxdata'
import type { SortPredicate } from '../components/sheet/SheetSortFilter'
import type { FlattenedSheet } from '../songs'

const SORT_DESCRIPTOR_MAPPING = {
  releaseDate: 'releaseDateTimestamp' as const,
}

const SONG_CATALOG_POSITION_BY_ID = new Map(dxdata.songs.map((song, index) => [song.songId, index]))

/**
 * Compare sheets using the selected sort predicates.
 *
 * Release dates are only precise to the day, so songs released together need
 * a deterministic final tie-break. Catalog order reflects when songs were
 * appended; following the release-date direction keeps the later-added song
 * first for the default descending sort without disturbing a song's sheet
 * order or any explicit secondary predicate.
 */
export const compareSheetsBySorts = (
  a: FlattenedSheet,
  b: FlattenedSheet,
  sorts: readonly SortPredicate[],
  songCatalogPositionById: ReadonlyMap<string, number> = SONG_CATALOG_POSITION_BY_ID,
): number => {
  const comparison = sorts.reduce((result, sort) => {
    if (result !== 0) {
      return result
    }
    const descriptor = sort.descriptor === 'releaseDate' ? SORT_DESCRIPTOR_MAPPING.releaseDate : sort.descriptor
    const aValue = a[descriptor]
    const bValue = b[descriptor]

    // null / undefined always sort last (both asc and desc)
    if ((aValue === null || aValue === undefined) && (bValue === null || bValue === undefined)) {
      return 0
    }
    if (aValue === null || aValue === undefined) {
      return 1
    }
    if (bValue === null || bValue === undefined) {
      return -1
    }

    if (aValue < bValue) {
      return sort.direction === 'asc' ? -1 : 1
    }
    if (aValue > bValue) {
      return sort.direction === 'asc' ? 1 : -1
    }
    return 0
  }, 0)

  if (comparison !== 0 || a.songId === b.songId) {
    return comparison
  }

  const releaseDateSort = sorts.find((sort) => sort.descriptor === 'releaseDate')
  if (releaseDateSort === null || releaseDateSort === undefined) {
    return 0
  }

  const aPosition = songCatalogPositionById.get(a.songId)
  const bPosition = songCatalogPositionById.get(b.songId)
  if ((aPosition === null || aPosition === undefined) && (bPosition === null || bPosition === undefined)) {
    return 0
  }
  if (aPosition === null || aPosition === undefined) {
    return 1
  }
  if (bPosition === null || bPosition === undefined) {
    return -1
  }

  return releaseDateSort.direction === 'asc' ? aPosition - bPosition : bPosition - aPosition
}