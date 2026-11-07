import { Button } from '@mui/material'
import type { FC } from 'react'
import { m } from '@/paraglide/messages'
import { useLocale } from '@/i18n/LocaleProvider'

/** A list that could not load, and a way to load it again without closing the dialog */
export const LoadError: FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => {
  const locale = useLocale()
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <p role="alert" className="m-0 text-sm text-danger">
        {message}
      </p>
      <Button size="small" onClick={onRetry}>
        {m.ratingCalculator_cloudSave_retry({}, { locale })}
      </Button>
    </div>
  )
}