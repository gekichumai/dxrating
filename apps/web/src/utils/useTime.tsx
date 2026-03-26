import { intlFormatDistance } from 'date-fns'
import { memo, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

function useMinuteTick() {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])
  return tick
}

export const useTime = (time?: string, length: 'short' | 'normal' = 'normal') => {
  const { i18n } = useTranslation()
  const tick = useMinuteTick()
  return useMemo(() => {
    try {
      if (!time) throw new Error('useTime: time is undefined')

      const date = new Date(time)
      if (Number.isNaN(date.getTime())) {
        throw new Error('Invalid date')
      }

      const dateString = date.toLocaleString(i18n.language)
      const relativeTime = intlFormatDistance(date, new Date())

      if (length === 'short') {
        return relativeTime
      }
      return `${dateString} (${relativeTime})`
    } catch {
      return 'unknown'
    }
  }, [time, i18n.language, tick])
}

/** Self-refreshing relative time display. Rerenders only itself once per minute. */
export const RelativeTime = memo(({ time, length }: { time?: string; length?: 'short' | 'normal' }) => {
  const formatted = useTime(time, length)
  return <>{formatted}</>
})