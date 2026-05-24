import { HeadContent, Outlet, Scripts, createRootRoute, useLocation } from '@tanstack/react-router'
import { CircularProgress } from '@mui/material'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'
import { Suspense, useEffect } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { CustomizedToaster } from '@/components/global/CustomizedToaster'
import { OverscrollBackgroundFiller } from '@/components/global/OverscrollBackgroundFiller'
import { SideEffector } from '@/components/global/SideEffector'
import { WebpSupportedImage } from '@/components/global/WebpSupportedImage'
import { VersionRegionSwitcher } from '@/components/global/preferences/VersionRegionSwitcher'
import { AppTabs } from '@/components/layout/AppTabs'
import { TopBar } from '@/components/layout/TopBar'
import { VersionCustomizedThemeProvider } from '@/components/layout/VersionCustomizedThemeProvider'
import { AppContextProvider } from '@/models/context/AppContext'
import { RatingCalculatorContextProvider } from '@/models/context/RatingCalculatorContext'
import { buildAlternateLinks } from '@/utils/alternateLinks'
import { buildRootSeoMeta, resolveSeoLocale } from '@/utils/seo'
import { useVersionTheme } from '@/utils/useVersionTheme'
import appCss from '@/index.css?url'
import 'virtual:uno.css'

const queryClient = new QueryClient()

const SONG_DETAIL_ROUTE_ID = '/songs/$songId/$type/$difficulty'

const fallbackElement = (
  <div className="flex items-center justify-center h-50% w-full p-6">
    <CircularProgress size="2rem" disableShrink />
  </div>
)

export const Route = createRootRoute({
  beforeLoad: (ctx) => ({
    locale: resolveSeoLocale([
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
      links: [
        { rel: 'preconnect', href: 'https://shama.dxrating.net' },
        { rel: 'stylesheet', href: appCss },
        {
          rel: 'preload',
          as: 'font',
          type: 'font/woff2',
          href: 'https://shama.dxrating.net/fonts/Torus-Regular.woff2',
          crossOrigin: 'anonymous',
        },
        {
          rel: 'preload',
          as: 'font',
          type: 'font/woff2',
          href: 'https://shama.dxrating.net/fonts/Torus-SemiBold.woff2',
          crossOrigin: 'anonymous',
        },
        {
          rel: 'preload',
          as: 'image',
          href: 'https://shama.dxrating.net/images/version-logo/circle-plus.webp',
          fetchPriority: 'high',
        },
        ...buildAlternateLinks({
          pathname: matches[matches.length - 1]?.pathname ?? '/',
          search: matches[matches.length - 1]?.search,
        }),
        {
          rel: 'prefetch',
          href: 'https://shama.dxrating.net/images/version-logo/buddies.webp',
        },
        { rel: 'preconnect', href: 'https://miruku.dxrating.net' },
        {
          rel: 'apple-touch-icon',
          sizes: '180x180',
          href: 'https://shama.dxrating.net/favicon/pack/v1/apple-touch-icon.png',
        },
        {
          rel: 'icon',
          type: 'image/png',
          sizes: '32x32',
          href: 'https://shama.dxrating.net/favicon/pack/v1/favicon-32x32.png',
        },
        {
          rel: 'icon',
          type: 'image/png',
          sizes: '16x16',
          href: 'https://shama.dxrating.net/favicon/pack/v1/favicon-16x16.png',
        },
        {
          rel: 'mask-icon',
          href: 'https://shama.dxrating.net/favicon/pack/v1/safari-pinned-tab.svg',
          color: '#c8a8f9',
        },
        {
          rel: 'shortcut icon',
          href: 'https://shama.dxrating.net/favicon/pack/v1/favicon.ico',
        },
        {
          rel: 'search',
          type: 'application/opensearchdescription+xml',
          title: 'DXRating Search',
          href: 'https://dxrating.net/opensearch.xml',
        },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        {
          rel: 'preconnect',
          href: 'https://fonts.gstatic.com',
          crossOrigin: 'anonymous',
        },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&display=swap',
        },
      ],
    }
  },
  component: RootComponent,
})

function RootLayout() {
  const versionTheme = useVersionTheme()
  const location = useLocation()

  const pathname = location.pathname

  const isPrivacyPolicy = pathname === '/privacy-policy'
  const isSongPage = pathname.startsWith('/songs/')
  const showTabs = !isSongPage && !isPrivacyPolicy

  if (isPrivacyPolicy) return null

  return (
    <>
      <OverscrollBackgroundFiller />
      <TopBar />
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
  return (
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
  const { locale } = Route.useRouteContext()

  return (
    <html lang={locale}>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}