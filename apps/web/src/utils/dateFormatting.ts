const DAY_MS = 1000 * 60 * 60 * 24
const RELEASE_DATE_TIME_ZONE = 'UTC'

const dateFormatters = new Map<string, Intl.DateTimeFormat>()
const relativeTimeFormatters = new Map<string, Intl.RelativeTimeFormat>()

function getDateFormatter(locale: string) {
  const cached = dateFormatters.get(locale)
  if (cached) return cached

  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeZone: RELEASE_DATE_TIME_ZONE,
  })
  dateFormatters.set(locale, formatter)
  return formatter
}

function getRelativeTimeFormatter(locale: string) {
  const cached = relativeTimeFormatters.get(locale)
  if (cached) return cached

  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  relativeTimeFormatters.set(locale, formatter)
  return formatter
}

export function sheetReleaseDateTimestamp(releaseDate: string | undefined) {
  if (!releaseDate) return 0

  const timestamp = Date.parse(`${releaseDate}T00:00:00.000Z`)
  return Number.isFinite(timestamp) ? timestamp : 0
}

export function formatSheetReleaseDateParts(releaseDate: string, locale: string, referenceTime: number) {
  const timestamp = sheetReleaseDateTimestamp(releaseDate)
  const referenceTimestamp = Number.isFinite(referenceTime) ? referenceTime : Date.now()
  const releaseDay = Math.floor(timestamp / DAY_MS)
  const referenceDay = Math.floor(referenceTimestamp / DAY_MS)

  return {
    absoluteDate: getDateFormatter(locale).format(new Date(timestamp)),
    relativeDate: getRelativeTimeFormatter(locale).format(releaseDay - referenceDay, 'day'),
  }
}