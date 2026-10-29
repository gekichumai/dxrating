import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { getBundledCatalogDocument } from '@/catalog/bundledCatalog'
import { findSongById, resolveSongRouteParam } from '@/catalog/songLookup'

export const LEGACY_SHEET_PATH_REDIRECT_STATUS_CODE = 308

export const resolveLegacySheetPathRedirect = (songId: string, type: string, difficulty: string) => ({
  to: '/songs/$songId/$type/$difficulty' as const,
  params: {
    songId,
    type,
    difficulty,
  },
  statusCode: LEGACY_SHEET_PATH_REDIRECT_STATUS_CODE,
  replace: true,
})

export const Route = createFileRoute('/$songId/$type/$difficulty')({
  ssr: true,
  beforeLoad: async ({ params }) => {
    const catalogDocument = getBundledCatalogDocument()
    const resolution = await resolveSongRouteParam(catalogDocument, params.songId)
    const song =
      resolution && ('song' in resolution ? resolution.song : findSongById(catalogDocument, resolution.redirectSongId))
    if (!song) {
      throw notFound()
    }

    const sheet = song.sheets.find((s) => s.type === params.type && s.difficulty === params.difficulty)
    if (!sheet) {
      throw notFound()
    }

    throw redirect(resolveLegacySheetPathRedirect(song.id, params.type, params.difficulty))
  },
})