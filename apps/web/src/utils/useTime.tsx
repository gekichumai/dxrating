import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

function formatRelativeTime(date: Date, locale?: string): string {
  const diffMs = date.getTime() - Date.now()
  const diffSec = Math.round(diffMs / 1000)
  const absSec = Math.abs(diffSec)

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })

  if (absSec < 60) return rtf.format(diffSec, 'second')
  const diffMin = Math.round(diffSec / 60)
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute')
  const diffHour = Math.round(diffSec / 3600)
  if (Math.abs(diffHour) < 24) return rtf.format(diffHour, 'hour')
  const diffDay = Math.round(diffSec / 86400)
  if (Math.abs(diffDay) < 30) return rtf.format(diffDay, 'day')
  const diffMonth = Math.round(diffDay / 30.44)
  if (Math.abs(diffMonth) < 12) return rtf.format(diffMonth, 'month')
  const diffYear = Math.round(diffDay / 365.25)
  return rtf.format(diffYear, 'year')
}

export const useTime = (time?: string, length: 'short' | 'normal' = 'normal') => {
  const { i18n } = useTranslation()
  return useMemo(() => {
    try {
      if (!time) throw new Error('useTime: time is undefined')

      const date = new Date(time)
      if (Number.isNaN(date.getTime())) {
        throw new Error('Invalid date')
      }

      const dateString = date.toLocaleString(i18n.language)
      const relativeTime = formatRelativeTime(date, i18n.language)

      if (length === 'short') {
        return relativeTime
      }
      return `${dateString} (${relativeTime})`
    } catch {
      return 'unknown'
    }
  }, [time, i18n.language])
}
