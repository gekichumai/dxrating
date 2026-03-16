import { createFileRoute } from '@tanstack/react-router'
import { VersionEnum } from '@gekichumai/dxdata'
import { getFlattenedSheets } from '@/songs'
import { SheetList } from '@/pages/SheetList'

export const Route = createFileRoute('/search')({
  loader: async ({ context }) => {
    const defaultVersion = VersionEnum.CiRCLE
    await context.queryClient.prefetchQuery({
      queryKey: ['dxdata', 'sheets', defaultVersion, false, false],
      queryFn: () =>
        getFlattenedSheets(defaultVersion).then((sheets) =>
          sheets.map((sheet) => ({
            ...sheet,
            tags: [],
          })),
        ),
    })
  },
  component: SheetList,
})
