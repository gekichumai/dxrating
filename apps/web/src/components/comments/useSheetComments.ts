import { useQuery, type QueryClient } from '@tanstack/react-query'
import { orpc, type RouterOutputs } from '@/lib/orpc'
import type { FlattenedSheet } from '@/songs'

type SheetComment = RouterOutputs['comments']['list'][number]

// ISO, so it is a valid <time dateTime> and parses the same everywhere
const withIsoDates = (comments: SheetComment[]) =>
  comments.map((comment) => ({ ...comment, created_at: new Date(comment.created_at).toISOString() }))

/** The comments of a sheet, as the signed-in account sees them (resetQueriesOnAccountChange drops another account's) */
export const useSheetComments = (sheet: FlattenedSheet) =>
  useQuery(
    orpc.comments.list.queryOptions({
      input: { songId: sheet.songId, sheetId: sheet.id, sheetType: sheet.type, sheetDifficulty: sheet.difficulty },
      select: withIsoDates,
    }),
  )

/** Keeps only the comments `keep` accepts in every sheet's list loaded, then reloads those lists */
export const filterLoadedComments = (queryClient: QueryClient, keep: (comment: SheetComment) => boolean) => {
  const lists = { queryKey: orpc.comments.list.key() }
  queryClient.setQueriesData<SheetComment[]>(lists, (comments) => comments?.filter(keep))
  return queryClient.invalidateQueries(lists)
}