import { useNavigate } from '@tanstack/react-router'
import { Button } from '@mui/material'
import { type FC, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import IconCheck from '~icons/material-symbols/check-circle-outline'
import IconError from '~icons/material-symbols/error-outline'

type Outcome = { status: 'success' } | { status: 'error'; code: string }

/**
 * The backend redirects here with ?status=success, or ?status=error&error=<code> (access_denied, missing_params,
 * exchange_failed, or whatever LXNS sent). A missing or unknown status (a reload, a bookmark, a stripped query) is
 * treated as an error too, so the page never waits on something that will not arrive.
 */
function readOutcome(search: string): Outcome {
  const params = new URLSearchParams(search)
  if (params.get('status') === 'success') return { status: 'success' }
  return { status: 'error', code: params.get('error') || 'missing_params' }
}

const REDIRECT_DELAY_MS = 2000

export const LxnsOauthCallback: FC = () => {
  const { t } = useTranslation(['rating-calculator'])
  const navigate = useNavigate()
  // This route is client-only (ssr: false), so reading the URL in the first render cannot mismatch.
  const [outcome] = useState(() => readOutcome(window.location.search))

  useEffect(() => {
    if (outcome.status !== 'success') return
    const timer = setTimeout(() => {
      // The page itself is the feedback while it shows; the toast confirms the connection after the redirect.
      toast.success(t('rating-calculator:io.import.lxns.callback.success'), { id: 'lxns-connected' })
      navigate({ to: '/rating' })
    }, REDIRECT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [t, outcome, navigate])

  const backButton = (
    <Button variant={outcome.status === 'error' ? 'contained' : 'text'} onClick={() => navigate({ to: '/rating' })}>
      {t('rating-calculator:io.import.lxns.callback.back')}
    </Button>
  )

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4 py-8">
      <section
        aria-labelledby="lxns-callback-title"
        className="glass flex w-full max-w-md flex-col items-center gap-3 p-6 text-center sm:p-8"
      >
        {outcome.status === 'success' ? (
          <>
            <IconCheck aria-hidden="true" className="size-12 text-status-positive" />
            <h1 id="lxns-callback-title" className="m-0 text-xl font-semibold leading-snug text-fg-1 text-balance">
              {t('rating-calculator:io.import.lxns.callback.success-title')}
            </h1>
            <p className="m-0 text-base leading-normal text-fg-1 text-pretty">
              {t('rating-calculator:io.import.lxns.callback.success-body')}
            </p>
            <p className="m-0 text-sm leading-normal text-fg-2">
              {t('rating-calculator:io.import.lxns.callback.redirecting')}
            </p>
          </>
        ) : (
          <>
            <IconError aria-hidden="true" className="size-12 text-danger" />
            <h1 id="lxns-callback-title" className="m-0 text-xl font-semibold leading-snug text-fg-1 text-balance">
              {t('rating-calculator:io.import.lxns.callback.error-title')}
            </h1>
            <p className="m-0 text-base leading-normal text-fg-2 text-pretty">
              {outcome.code === 'access_denied'
                ? t('rating-calculator:io.import.lxns.callback.error-access-denied')
                : t('rating-calculator:io.import.lxns.callback.error')}
            </p>
          </>
        )}
        <div className="mt-2">{backButton}</div>
      </section>
    </div>
  )
}