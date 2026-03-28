import compact from 'lodash-es/compact'
import { useMemo } from 'react'
import { useCombinedTags } from '../../../models/useCombinedTags'
import type { FlattenedSheet } from '../../../songs'

export const useSheetTags = (sheet: FlattenedSheet) => {
  const response = useCombinedTags()
  const { data: combinedTags, ...rest } = response
  const groupOrder = combinedTags?.tagGroups.map((g) => g.id) ?? []
  const sheetTags = compact(
    combinedTags?.tagSongs
      .filter(
        (tagSong) =>
          tagSong.song_id === sheet.songId &&
          tagSong.sheet_type === sheet.type &&
          tagSong.sheet_difficulty === sheet.difficulty,
      )
      .map(({ tag_id }) => combinedTags.tags.find((tag) => tag.id === tag_id))
      .map((tag) => ({
        ...tag,
        group: combinedTags.tagGroups.find((group) => group.id === tag?.group_id),
      })),
  ).sort((a, b) => {
    const aIdx = groupOrder.indexOf(a.group_id ?? -1)
    const bIdx = groupOrder.indexOf(b.group_id ?? -1)
    return aIdx - bIdx
  })

  return useMemo(() => {
    return {
      data: sheetTags,
      ...rest,
    }
  }, [response])
}