import { HeadContent, Outlet, Scripts, createRootRoute, useLocation } from '@tanstack/react-router'
import { CircularProgress } from '@mui/material'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from 'i18next'
import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'
import { Suspense, useEffect, useMemo } from 'react'
import toast from 'react-hot-toast'
import { I18nextProvider, useTranslation } from 'react-i18next'
import { CustomizedToaster } from '@/components/global/CustomizedToaster'
import { NotFoundContent } from '@/components/global/NotFoundContent'
import { OverscrollBackgroundFiller } from '@/components/global/OverscrollBackgroundFiller'
import { SideEffector } from '@/components/global/SideEffector'
import { WebpSupportedImage } from '@/components/global/WebpSupportedImage'
import { VersionRegionSwitcher } from '@/components/global/preferences/VersionRegionSwitcher'
import { AppTabs } from '@/components/layout/AppTabs'
import { TopBar } from '@/components/layout/TopBar'
import { VersionCustomizedThemeProvider } from '@/components/layout/VersionCustomizedThemeProvider'
import { AppContextProvider } from '@/models/context/AppContext'
import { RatingCalculatorContextProvider } from '@/models/context/RatingCalculatorContext'
import { createServerI18n } from '@/setup/init-i18n'
import { buildRootSeoMeta, resolveSeoLocale } from '@/utils/seo'
import { buildRootHeadLinks } from '@/utils/rootHeadLinks'
import { useVersionTheme } from '@/utils/useVersionTheme'
import { RENDERED_AT_META_NAME, RenderEnvironmentProvider, resolveRenderedAt } from '@/utils/renderEnvironment'
import 'virtual:uno.css'

const queryClient = new QueryClient()

const SONG_DETAIL_ROUTE_ID = '/songs/$songId/$type/$difficulty'

const fallbackElement = (
  <div className="flex items-center justify-center h-50% w-full p-6">
    <CircularProgress size="2rem" disableShrink />
  </div>
)

export const Route = createRootRoute({
  notFoundComponent: NotFoundContent,
  beforeLoad: (ctx) => ({
    locale: resolveSeoLocale([
      { context: (ctx as { serverContext?: unknown }).serverContext },
      { context: ctx.context },
    ]),
    renderedAt: resolveRenderedAt([
      { context: (ctx as { serverContext?: unknown }).serverContext },
      { context: ctx.context },
    ]),
  }),
  head: ({ match, matches }) => {
    const locale = resolveSeoLocale([match, ...matches])
    const includeRootTitle = !matches.some((match) => String(match.routeId) === SONG_DETAIL_ROUTE_ID)

    return {
      meta: [
        { charSet: 'utf-8' },
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1.0, viewport-fit=cover',
        },
        ...buildRootSeoMeta(locale, { includeTitle: includeRootTitle }),
        { name: 'theme-color', content: '#c8a8f9' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'msapplication-TileColor', content: '#c8a8f9' },
        {
          name: 'msapplication-config',
          content: 'https://shama.dxrating.net/favicon/pack/v1/browserconfig.xml',
        },
      ],
      links: buildRootHeadLinks({
        pathname: matches[matches.length - 1]?.pathname ?? '/',
        search: matches[matches.length - 1]?.search,
      }),
    }
  },
  component: RootComponent,
})

function RootLayout() {
  const versionTheme = useVersionTheme()
  const location = useLocation()

  const pathname = location.pathname

  const isPrivacyPolicy = pathname === '/privacy-policy'
  const isDevelopersPage = pathname === '/developers'
  const isSongPage = pathname.startsWith('/songs/')
  const showTabs = !isSongPage && !isPrivacyPolicy && !isDevelopersPage

  if (isPrivacyPolicy) return null

  return (
    <>
      <OverscrollBackgroundFiller />
      <TopBar />
      {!isDevelopersPage && (
        <div
          className="w-full flex flex-col items-center justify-center text-white text-2xl font-bold gap-4 pt-4 pb-4"
          style={{
            backgroundImage: `linear-gradient(
    to bottom,
    ${versionTheme.accentColor},
    ${versionTheme.accentColor} env(safe-area-inset-top),
    ${versionTheme.accentColor}00
  )
`,
          }}
        >
          <VersionRegionSwitcher />
          {showTabs && <AppTabs />}
        </div>
      )}
    </>
  )
}

function OAuthErrorHandler() {
  const { t } = useTranslation(['auth'])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const error = params.get('error')
    if (!error) return

    const key = `auth:oauth-error.${error}` as const
    const message = t(key, { defaultValue: '' })
    toast.error(message || t('auth:oauth-error.default', { error }), { id: 'oauth-error' })

    params.delete('error')
    params.delete('error_description')
    const cleanURL = params.toString()
      ? `${window.location.pathname}?${params.toString()}${window.location.hash}`
      : `${window.location.pathname}${window.location.hash}`
    window.history.replaceState({}, '', cleanURL)
  }, [t])

  return null
}

function RootComponent() {
  const { locale, renderedAt } = Route.useRouteContext()
  const routeI18n = useMemo(() => (import.meta.env.SSR ? createServerI18n(locale) : i18n), [locale])

  return (
    <RenderEnvironmentProvider renderedAt={renderedAt}>
      <I18nextProvider i18n={routeI18n}>
        <RootDocument>
          <QueryClientProvider client={queryClient}>
            <AppContextProvider>
              <VersionCustomizedThemeProvider>
                <RatingCalculatorContextProvider>
                  <PostHogProvider client={posthog}>
                    <SideEffector />
                    <CustomizedToaster />
                    <OAuthErrorHandler />
                    <AppLayout />
                  </PostHogProvider>
                </RatingCalculatorContextProvider>
              </VersionCustomizedThemeProvider>
            </AppContextProvider>
          </QueryClientProvider>
        </RootDocument>
      </I18nextProvider>
    </RenderEnvironmentProvider>
  )
}

function AppLayout() {
  const versionTheme = useVersionTheme()

  return (
    <div className="h-full w-full relative">
      <WebpSupportedImage
        src={versionTheme.background}
        alt=""
        aria-hidden={true}
        className="fixed inset-0 h-full-lvh w-full z-[-1] object-cover object-center select-none touch-callout-none"
        draggable={false}
      />

      <div className="h-full w-full relative">
        <Suspense fallback={fallbackElement}>
          <RootLayout />
          <Outlet />
        </Suspense>
      </div>
    </div>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const { locale, renderedAt } = Route.useRouteContext()

  return (
    <html lang={locale}>
      <head>
        <HeadContent />
        <meta name={RENDERED_AT_META_NAME} content={String(renderedAt)} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}