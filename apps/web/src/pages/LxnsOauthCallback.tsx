import { Button, CircularProgress } from '@mui/material'
import { type FC, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import IconCheck from '~icons/material-symbols/check-circle-outline'
import IconError from '~icons/material-symbols/error-outline'

export const LxnsOauthCallback: FC = () => {
  const { t } = useTranslation(['rating-calculator'])
  const params = new URLSearchParams(window.location.search)
  const initialStatus =
    params.get('status') === 'success' ? 'success' : params.get('status') === 'error' ? 'error' : 'loading'
  const initialError = params.get('error') || 'unknown'

  const [status] = useState<'loading' | 'success' | 'error'>(initialStatus)
  const [error] = useState<string | null>(initialStatus === 'error' ? initialError : null)

  useEffect(() => {
    if (status === 'success') {
      toast.success(t('rating-calculator:io.import.lxns.callback.success'))
      const timer = setTimeout(() => {
        window.location.href = '/rating'
      }, 2000)
      return () => clearTimeout(timer)
    }

    if (status === 'error') {
      toast.error(t('rating-calculator:io.import.lxns.callback.error', { error: error || 'unknown' }))
    }
  }, [t, status, error])

  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8 min-h-[50vh]">
      {status === 'loading' && <CircularProgress size="2rem" />}

      {status === 'success' && (
        <>
          <IconCheck className="text-green-500 text-5xl" />
          <p className="text-lg font-medium">{t('rating-calculator:io.import.lxns.callback.success')}</p>
          <p className="text-sm text-zinc-500">{t('rating-calculator:io.import.lxns.callback.redirecting')}</p>
        </>
      )}

      {status === 'error' && (
        <>
          <IconError className="text-red-500 text-5xl" />
          <p className="text-lg font-medium">{t('rating-calculator:io.import.lxns.callback.error', { error })}</p>
          <Button variant="contained" onClick={() => (window.location.href = '/rating')}>
            {t('rating-calculator:io.import.lxns.close')}
          </Button>
        </>
      )}
    </div>
  )
}