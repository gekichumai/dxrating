import { createFileRoute, notFound } from '@tanstack/react-router'
import { getSongs } from '@/songs'
import { resolveSheetId } from '@/utils/sheet-id'
import { SongDetailPage } from '@/components/sheet/SongDetailPage'

export const Route = createFileRoute('/sheet/$id')({
  loader: ({ params }) => {
    const songs = getSongs()
    const song = resolveSheetId(params.id, songs)
    if (!song) throw notFound()
    return { song }
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData.song.title} - DXRating` },
      {
        name: 'description',
        content: `${loaderData.song.title} by ${loaderData.song.artist} — ${loaderData.song.category}. View charts, ratings, and details on DXRating.`,
      },
      { property: 'og:title', content: `${loaderData.song.title} - DXRating` },
      {
        property: 'og:description',
        content: `${loaderData.song.title} by ${loaderData.song.artist} — maimai DX chart details and rating calculator.`,
      },
      {
        property: 'og:image',
        content: `https://shama.dxrating.net/images/cover/v2/${loaderData.song.imageName}.jpg`,
      },
      { property: 'og:type', content: 'website' },
    ],
  }),
  component: SheetDetailRoute,
})

function SheetDetailRoute() {
  const { song } = Route.useLoaderData()
  return <SongDetailPage song={song} />
}
