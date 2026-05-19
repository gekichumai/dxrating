import type { DifficultyEnum, TypeEnum } from '@gekichumai/dxdata'
import { getSheetTitleLabel } from '@/components/song/sheetDisplay'

const CHART_OG_IMAGE_ORIGIN = 'https://miruku.dxrating.net'

export function buildChartOgImageUrl({
  songId,
  type,
  difficulty,
}: {
  songId: string
  type: TypeEnum | string
  difficulty: DifficultyEnum | string
}) {
  return `${CHART_OG_IMAGE_ORIGIN}/api/v1/songs/${encodeURIComponent(songId)}/${encodeURIComponent(type)}/${encodeURIComponent(difficulty)}/og-image`
}

export function buildChartOgImageAlt({
  title,
  artist,
  type,
  difficulty,
}: {
  title: string
  artist: string
  type: TypeEnum
  difficulty: DifficultyEnum | string
}) {
  return `${title} by ${artist} - ${getSheetTitleLabel({ type, difficulty })} chart on DXRating`
}