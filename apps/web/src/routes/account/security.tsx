import { CircularProgress } from '@mui/material'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { LoginForm } from '@/components/auth/LoginForm'
import { SecuritySection } from '@/components/global/preferences/SecuritySection'
import { authClient } from '@/lib/auth-client'
import { resolveSeoLocale } from '@/utils/seo'
import { buildPageTitleMeta } from '@/utils/pageTitleSeo'
import IconMdiDevices from '~icons/mdi/devices'
import IconMdiLock from '~icons/mdi/lock-outline'
import IconPasskey from '~icons/material-symbols/passkey'

// The same icons SecuritySection uses for these sections once signed in
const SECURITY_FEATURES = [
  { key: 'password', Icon: IconMdiLock },
  { key: 'passkeys', Icon: IconPasskey },
  { key: 'devices', Icon: IconMdiDevices },
] as const

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
    <div className="mx-auto w-full max-w-3xl px-4 pb-12 sm:px-6 md:pt-10">
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
          // One column on phones; from md the page heading and what the page manages sit beside the form, which then
          // drops its own (duplicate) sign-in heading
          <div className="mx-auto max-w-sm md:mx-0 md:max-w-none md:grid md:grid-cols-[minmax(0,1fr)_24rem] md:gap-10 md:items-start">
            {/* Japanese wraps at phrase boundaries here, not mid-word, in the narrower desktop column */}
            <div className="md:[word-break:auto-phrase]">
              {pageHeading}
              <p className="m-0 mb-6 text-sm leading-normal text-fg-2 text-pretty">
                {t('auth:account-security.sign-in-description')}
              </p>
              <ul
                aria-label={t('auth:account-security.features-label')}
                className="m-0 hidden list-none flex-col gap-3 p-0 md:flex"
              >
                {SECURITY_FEATURES.map(({ key, Icon }) => (
                  <li key={key} className="flex items-start gap-3 text-sm leading-5 text-fg-1">
                    <span className="glass-inset flex size-8 shrink-0 items-center justify-center text-fg-2 -my-1.5">
                      <Icon aria-hidden="true" className="size-4" />
                    </span>
                    <span className="text-pretty">{t(`auth:account-security.feature-${key}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <LoginForm idPrefix="account-security" hideTitleFromMd />
          </div>
        )}
      </section>
    </div>
  )
}