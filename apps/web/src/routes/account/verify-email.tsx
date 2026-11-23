import { Button } from '@mui/material'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import IconCheck from '~icons/material-symbols/check-circle-outline'
import IconError from '~icons/material-symbols/error-outline'
import { readVerifyOutcome } from '@/components/auth/authLinks'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'
import { buildPageTitleMeta } from '@/utils/pageTitleSeo'
import { resolveSeoLocale } from '@/utils/seo'

export const Route = createFileRoute('/account/verify-email')({
  // The outcome is in the URL; read it on the client only, and keep the page out of every cache and index
  ssr: false,
  head: ({ match, matches }) => ({
    meta: [
      ...buildPageTitleMeta(resolveSeoLocale([match, ...matches]), 'auth:verify-email.title'),
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: VerifyEmailPage,
})

/**
 * Where a mailed verification link lands, after the backend has checked it, verified the address and signed the
 * visitor in (apps/backend/src/lib/auth-mail.ts). It only reports the outcome; a failed link is replaced from the
 * account page.
 */
function VerifyEmailPage() {
  const locale = useLocale()
  const navigate = useNavigate()
  // Client-only route (ssr: false): reading the URL in the first render cannot mismatch
  const [outcome] = useState(() => readVerifyOutcome(window.location.search))

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4 py-8">
      <section
        aria-labelledby="verify-email-title"
        className="glass flex w-full max-w-md flex-col items-center gap-3 p-6 text-center sm:p-8"
      >
        {outcome.status === 'verified' ? (
          <IconCheck aria-hidden="true" className="size-12 text-status-positive" />
        ) : (
          <IconError aria-hidden="true" className="size-12 text-danger" />
        )}
        <h1 id="verify-email-title" className="m-0 text-xl font-semibold leading-snug text-fg-1 text-balance">
          {outcome.status === 'verified'
            ? m.auth_verifyEmail_successTitle({}, { locale })
            : m.auth_verifyEmail_errorTitle({}, { locale })}
        </h1>
        <p className="m-0 text-base leading-normal text-fg-2 text-pretty">
          {outcome.status === 'verified'
            ? m.auth_verifyEmail_successBody({}, { locale })
            : outcome.reason === 'expired'
              ? m.auth_verifyEmail_expired({}, { locale })
              : m.auth_verifyEmail_invalid({}, { locale })}
        </p>
        <Button variant="contained" onClick={() => navigate({ to: '/account/security' })} className="!mt-2">
          {m.auth_verifyEmail_toAccount({}, { locale })}
        </Button>
      </section>
    </div>
  )
}