import { Button } from '@mui/material'
import type { FC } from 'react'
import { useTranslation } from 'react-i18next'

/** A list that could not load, and a way to load it again without closing the dialog */
export const LoadError: FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => {
  const { t } = useTranslation(['rating-calculator'])
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <p role="alert" className="m-0 text-sm text-red-700">
        {message}
      </p>
      <Button size="small" onClick={onRetry}>
        {t('rating-calculator:cloud-save.retry')}
      </Button>
    </div>
  )
}