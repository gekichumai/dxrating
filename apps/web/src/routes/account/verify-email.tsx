import { Button, CircularProgress } from '@mui/material'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'
import IconCheck from '~icons/material-symbols/check-circle-outline'
import IconError from '~icons/material-symbols/error-outline'
import IconInfo from '~icons/material-symbols/info-outline'
import IconLogin from '~icons/material-symbols/login'
import { readVerifyOutcome, type VerifyOutcome } from '@/components/auth/authLinks'
import { asyncHandler } from '@/lib/rejections'
import { useLocale } from '@/i18n/LocaleProvider'
import { authClient } from '@/lib/auth-client'
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
 * Where a mailed verification link lands, after the backend has checked it and verified the address
 * (apps/backend/src/lib/auth-mail.ts). A link works only while signed in to its account, so success is what that
 * session shows; a page opened without an outcome reports nothing. A failed link is replaced from the account page.
 */
function VerifyEmailPage() {
  const locale = useLocale()
  const navigate = useNavigate()
  // Client-only route (ssr: false): reading the URL in the first render cannot mismatch
  const [search] = useState(() => window.location.search)
  const { data, isPending } = authClient.useSession()
  const outcome = readVerifyOutcome(search, { isPending, emailVerified: data?.user.emailVerified })

  if (outcome.status === 'pending') {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4 py-8">
        <CircularProgress size="2rem" aria-label={m.auth_verifyEmail_title({}, { locale })} />
      </div>
    )
  }

  const { icon, title, body } = presentOutcome(outcome)
  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4 py-8">
      <section
        aria-labelledby="verify-email-title"
        className="glass flex w-full max-w-md flex-col items-center gap-3 p-6 text-center sm:p-8"
      >
        {icon}
        <h1 id="verify-email-title" className="m-0 text-xl font-semibold leading-snug text-fg-1 text-balance">
          {title({}, { locale })}
        </h1>
        <p className="m-0 text-base leading-normal text-fg-2 text-pretty">{body({}, { locale })}</p>
        <Button
          variant="contained"
          onClick={asyncHandler(() => navigate({ to: '/account/security' }))}
          className="!mt-2"
        >
          {m.auth_verifyEmail_toAccount({}, { locale })}
        </Button>
      </section>
    </div>
  )
}

type PlainMessage = typeof m.auth_verifyEmail_title

const presentOutcome = (
  outcome: Exclude<VerifyOutcome, { status: 'pending' }>,
): { icon: ReactNode; title: PlainMessage; body: PlainMessage } => {
  switch (outcome.status) {
    case 'verified':
      return {
        icon: <IconCheck aria-hidden="true" className="size-12 text-status-positive" />,
        title: m.auth_verifyEmail_successTitle,
        body: m.auth_verifyEmail_successBody,
      }
    case 'unknown':
      return {
        icon: <IconInfo aria-hidden="true" className="size-12 text-fg-2" />,
        title: m.auth_verifyEmail_unknownTitle,
        body: m.auth_verifyEmail_unknownBody,
      }
    case 'error':
      if (outcome.reason === 'signInRequired') {
        return {
          icon: <IconLogin aria-hidden="true" className="size-12 text-fg-2" />,
          title: m.auth_verifyEmail_signInRequiredTitle,
          body: m.auth_verifyEmail_signInRequired,
        }
      }
      return {
        icon: <IconError aria-hidden="true" className="size-12 text-danger" />,
        title: m.auth_verifyEmail_errorTitle,
        body: outcome.reason === 'expired' ? m.auth_verifyEmail_expired : m.auth_verifyEmail_invalid,
      }
  }
}