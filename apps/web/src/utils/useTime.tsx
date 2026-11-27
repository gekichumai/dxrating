import { intlFormatDistance } from 'date-fns'
import { memo, useEffect, useMemo, useState } from 'react'
import { useRenderedAt } from './renderEnvironment'
import { useLocale } from '@/i18n/LocaleProvider'

/**
 * The current time for relative-time text: the render time first, so the server render and hydration agree, then the
 * browser clock, refreshed each minute. The server HTML can be a cached copy rendered hours or days earlier
 * (setup/html-cache.ts), so text that stayed on the render time would stay that far behind.
 */
export function useMinuteNow() {
  const renderedAt = useRenderedAt()
  const [now, setNow] = useState(renderedAt)

  useEffect(() => {
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  return now
}

export const useTime = (time?: string, length: 'short' | 'normal' = 'normal') => {
  const locale = useLocale()
  const now = useMinuteNow()
  return useMemo(() => {
    try {
      if (!time) throw new Error('useTime: time is undefined')

      const date = new Date(time)
      if (Number.isNaN(date.getTime())) {
        throw new Error('Invalid date')
      }

      const dateString = date.toLocaleString(locale)
      if (length === 'short') {
        // Abbreviated units ("59 min. ago") so the header's build line fits beside the action pill at 375px.
        return intlFormatDistance(date, new Date(now), { locale: locale, style: 'short' })
      }
      const relativeTime = intlFormatDistance(date, new Date(now), { locale: locale })
      return `${dateString} (${relativeTime})`
    } catch {
      return 'unknown'
    }
  }, [time, length, locale, now])
}

/** Self-refreshing relative time display. Rerenders only itself once per minute. */
export const RelativeTime = memo(({ time, length }: { time?: string; length?: 'short' | 'normal' }) => {
  const formatted = useTime(time, length)
  return <>{formatted}</>
})