import { dxdata } from '@gekichumai/dxdata'
import { createFileRoute, notFound, redirect } from '@tanstack/react-router'

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
  beforeLoad: ({ params }) => {
    const song = dxdata.songs.find((s) => s.songId === params.songId)
    if (!song) {
      throw notFound()
    }

    const sheet = song.sheets.find((s) => s.type === params.type && s.difficulty === params.difficulty)
    if (!sheet) {
      throw notFound()
    }

    throw redirect(resolveLegacySheetPathRedirect(params.songId, params.type, params.difficulty))
  },
})