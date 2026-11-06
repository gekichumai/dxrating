import { CircularProgress } from '@mui/material'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { LoginForm } from '@/components/auth/LoginForm'
import { SecuritySection } from '@/components/global/preferences/SecuritySection'
import { authClient } from '@/lib/auth-client'
import { resolveSeoLocale } from '@/utils/seo'
import { buildPageTitleMeta } from '@/utils/pageTitleSeo'

export const Route = createFileRoute('/account/security')({
  head: ({ match, matches }) => ({
    meta: buildPageTitleMeta(resolveSeoLocale([match, ...matches]), 'auth:account-security.title'),
    links: [{ rel: 'canonical', href: 'https://dxrating.net/account/security' }],
  }),
  component: AccountSecurityPage,
})

function AccountSecurityPage() {
  const { t } = useTranslation(['auth'])
  const { data: sessionData, isPending } = authClient.useSession()

  // Signed in, SecuritySection brings its own page heading; otherwise this page names itself
  const pageHeading = (
    <h1 className="m-0 mb-6 text-xl font-semibold leading-tight text-fg-1 text-balance">
      {t('auth:account-security.title')}
    </h1>
  )

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-12 sm:px-6">
      <section className="glass min-h-80 p-4 sm:p-8">
        {isPending ? (
          <>
            {pageHeading}
            <div className="flex min-h-56 items-center justify-center" aria-busy="true">
              <CircularProgress size="2rem" aria-label={t('auth:account-security.loading')} />
            </div>
          </>
        ) : sessionData?.session ? (
          <SecuritySection currentSessionToken={sessionData.session.token} idPrefix="account-security" />
        ) : (
          <div className="mx-auto max-w-sm">
            {pageHeading}
            <p className="m-0 mb-6 text-sm leading-normal text-fg-2 text-pretty">
              {t('auth:account-security.sign-in-description')}
            </p>
            <LoginForm idPrefix="account-security" />
          </div>
        )}
      </section>
    </div>
  )
}