import type { DifficultyEnum, TypeEnum } from '@gekichumai/dxdata'
import { getSheetTitleLabel } from '@/components/song/sheetDisplay'
import type { SupportedLocale } from '@/setup/locale'

const CHART_OG_IMAGE_ORIGIN = 'https://miruku.dxrating.net'

/**
 * The languages the OG card is drawn in (the backend's `OG_LOCALES`). The edge keeps `locale` in the image's cache key
 * only for these values and drops anything else, so the web never sends another one.
 */
export const OG_IMAGE_LOCALES = ['en', 'ja', 'ko', 'zh-Hans', 'zh-Hant'] as const satisfies readonly SupportedLocale[]
export type OgImageLocale = (typeof OG_IMAGE_LOCALES)[number]

/** The card language for a page language: the page's own when the card has it, English otherwise */
export function toOgImageLocale(locale: SupportedLocale): OgImageLocale {
  return (OG_IMAGE_LOCALES as readonly string[]).includes(locale) ? (locale as OgImageLocale) : 'en'
}

/** The card's labels follow the page's language; every page names one of the five card languages */
const localeQuery = (locale: SupportedLocale | undefined) => (locale ? `?locale=${toOgImageLocale(locale)}` : '')

export function buildChartOgImageUrl({
  songId,
  type,
  difficulty,
  locale,
}: {
  songId: string
  type: TypeEnum | string
  difficulty: DifficultyEnum | string
  locale?: SupportedLocale
}) {
  return `${CHART_OG_IMAGE_ORIGIN}/api/v1/songs/${encodeURIComponent(songId)}/${encodeURIComponent(type)}/${encodeURIComponent(difficulty)}/og-image${localeQuery(locale)}`
}

/** The song page's card: every chart's internal level (or the chart's own card for a one-chart song) */
export function buildSongOgImageUrl({ songId, locale }: { songId: string; locale?: SupportedLocale }) {
  return `${CHART_OG_IMAGE_ORIGIN}/api/v1/songs/${encodeURIComponent(songId)}/og-image${localeQuery(locale)}`
}

export function buildSongOgImageAlt({ title, artist }: { title: string; artist: string }) {
  return `${title} by ${artist} - every chart's level on DXRating`
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