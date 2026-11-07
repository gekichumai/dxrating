import { useNavigate } from '@tanstack/react-router'
import { Button, CircularProgress } from '@mui/material'
import { ORPCError } from '@orpc/client'
import { type FC, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import IconCheck from '~icons/material-symbols/check-circle-outline'
import IconError from '~icons/material-symbols/error-outline'
import { apiClient } from '@/lib/orpc'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'

type Outcome =
  | { status: 'pending'; code: string; state: string }
  | { status: 'success' }
  | { status: 'error'; code: string }

/**
 * The backend forwards LXNS's ?code=…&state=… here, and this page finishes the connection with `lxns.complete`, which
 * only succeeds for the DXRating account that started it. Errors from LXNS arrive as ?status=error&error=<code>
 * (access_denied, missing_params, or whatever LXNS sent). ?status=success is still accepted from older redirects. A
 * missing or unknown status (a reload, a bookmark, a stripped query) is treated as an error too, so the page never
 * waits on something that will not arrive.
 */
function readOutcome(search: string): Outcome {
  const params = new URLSearchParams(search)
  const code = params.get('code')
  const state = params.get('state')
  if (code && state) return { status: 'pending', code, state }
  if (params.get('status') === 'success') return { status: 'success' }
  return { status: 'error', code: params.get('error') || 'missing_params' }
}

/** session_mismatch and not_signed_in come from lxns.complete; anything else is a failed exchange */
function completionErrorCode(error: unknown): string {
  if (error instanceof ORPCError) {
    const reason = (error.data as { reason?: unknown } | undefined)?.reason
    if (reason === 'session_mismatch' || reason === 'not_signed_in') return reason
  }
  return 'exchange_failed'
}

const REDIRECT_DELAY_MS = 2000

export const LxnsOauthCallback: FC = () => {
  const locale = useLocale()
  const navigate = useNavigate()
  // This route is client-only (ssr: false), so reading the URL in the first render cannot mismatch.
  const [outcome, setOutcome] = useState(() => readOutcome(window.location.search))
  const completion = useRef<string | null>(null)

  useEffect(() => {
    if (outcome.status !== 'pending' || completion.current === outcome.state) return
    // The state works once; StrictMode's second effect run must not spend it again
    completion.current = outcome.state
    // Keep the one-time code out of the address bar, history and anything that reads the URL later
    window.history.replaceState(window.history.state, '', window.location.pathname)
    apiClient.lxns
      .complete({ code: outcome.code, state: outcome.state })
      .then(() => setOutcome({ status: 'success' }))
      .catch((error: unknown) => setOutcome({ status: 'error', code: completionErrorCode(error) }))
  }, [outcome])

  useEffect(() => {
    if (outcome.status !== 'success') return
    const timer = setTimeout(() => {
      // The page itself is the feedback while it shows; the toast confirms the connection after the redirect.
      toast.success(m.ratingCalculator_io_import_lxns_callback_success({}), { id: 'lxns-connected' })
      navigate({ to: '/rating' })
    }, REDIRECT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [locale, outcome, navigate])

  const backButton = (
    <Button
      variant={outcome.status === 'error' ? 'contained' : 'text'}
      disabled={outcome.status === 'pending'}
      onClick={() => navigate({ to: '/rating' })}
    >
      {m.ratingCalculator_io_import_lxns_callback_back({}, { locale })}
    </Button>
  )

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4 py-8">
      <section
        aria-labelledby="lxns-callback-title"
        className="glass flex w-full max-w-md flex-col items-center gap-3 p-6 text-center sm:p-8"
      >
        {outcome.status === 'pending' ? (
          <>
            <CircularProgress aria-hidden="true" size={40} />
            <h1 id="lxns-callback-title" className="m-0 text-xl font-semibold leading-snug text-fg-1 text-balance">
              {m.ratingCalculator_io_import_lxns_callback_completing({}, { locale })}
            </h1>
          </>
        ) : outcome.status === 'success' ? (
          <>
            <IconCheck aria-hidden="true" className="size-12 text-status-positive" />
            <h1 id="lxns-callback-title" className="m-0 text-xl font-semibold leading-snug text-fg-1 text-balance">
              {m.ratingCalculator_io_import_lxns_callback_successTitle({}, { locale })}
            </h1>
            <p className="m-0 text-base leading-normal text-fg-1 text-pretty">
              {m.ratingCalculator_io_import_lxns_callback_successBody({}, { locale })}
            </p>
            <p className="m-0 text-sm leading-normal text-fg-2">
              {m.ratingCalculator_io_import_lxns_callback_redirecting({}, { locale })}
            </p>
          </>
        ) : (
          <>
            <IconError aria-hidden="true" className="size-12 text-danger" />
            <h1 id="lxns-callback-title" className="m-0 text-xl font-semibold leading-snug text-fg-1 text-balance">
              {m.ratingCalculator_io_import_lxns_callback_errorTitle({}, { locale })}
            </h1>
            <p className="m-0 text-base leading-normal text-fg-2 text-pretty">
              {outcome.code === 'access_denied'
                ? m.ratingCalculator_io_import_lxns_callback_errorAccessDenied({}, { locale })
                : outcome.code === 'session_mismatch'
                  ? m.ratingCalculator_io_import_lxns_callback_errorSessionMismatch({}, { locale })
                  : outcome.code === 'not_signed_in'
                    ? m.ratingCalculator_io_import_lxns_callback_errorNotSignedIn({}, { locale })
                    : m.ratingCalculator_io_import_lxns_callback_error({}, { locale })}
            </p>
          </>
        )}
        <div className="mt-2">{backButton}</div>
      </section>
    </div>
  )
}