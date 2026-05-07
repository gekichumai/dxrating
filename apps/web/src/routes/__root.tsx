import { HeadContent, Outlet, Scripts, createRootRoute, useLocation, useNavigate } from '@tanstack/react-router'
import { CircularProgress, Tab, Tabs } from '@mui/material'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { usePostHog } from 'posthog-js/react'
import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'
import { Suspense, useEffect, useTransition } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { CustomizedToaster } from '@/components/global/CustomizedToaster'
import { OverscrollBackgroundFiller } from '@/components/global/OverscrollBackgroundFiller'
import { SideEffector } from '@/components/global/SideEffector'
import { WebpSupportedImage } from '@/components/global/WebpSupportedImage'
import { VersionRegionSwitcher } from '@/components/global/preferences/VersionRegionSwitcher'
import { TopBar } from '@/components/layout/TopBar'
import { VersionCustomizedThemeProvider } from '@/components/layout/VersionCustomizedThemeProvider'
import { AppContextProvider } from '@/models/context/AppContext'
import { RatingCalculatorContextProvider } from '@/models/context/RatingCalculatorContext'
import { startViewTransition } from '@/utils/startViewTransition'
import { useVersionTheme } from '@/utils/useVersionTheme'
import appCss from '@/index.css?url'
import unoResetCss from '@unocss/reset/tailwind-compat.css?url'
import 'virtual:uno.css'

const queryClient = new QueryClient()

const APP_TABS_VALUES = ['search', 'rating'] as const
type AppTabsValuesType = (typeof APP_TABS_VALUES)[number]

const fallbackElement = (
  <div className="flex items-center justify-center h-50% w-full p-6">
    <CircularProgress size="2rem" disableShrink />
  </div>
)

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no',
      },
      { title: 'DXRating' },
      {
        name: 'description',
        content: 'DXRating is a maimai DX Rating analyzer, along with other features like chart details and more.',
      },
      {
        name: 'keywords',
        content:
          'maimai, maimai DX, maimai DX Rating, maimai DX Rating analyzer, gekichumai, maimaiでらっくす, 舞萌, 舞萌DX, 舞萌查分器, 舞萌算分器, maimai wiki',
      },
      { property: 'og:site_name', content: 'DXRating' },
      { property: 'og:type', content: 'website' },
      { property: 'og:title', content: 'DXRating' },
      {
        property: 'og:description',
        content: 'DXRating is a maimai DX Rating analyzer, along with other features like chart details and more.',
      },
      {
        property: 'og:image',
        content: 'https://shama.dxrating.net/favicon/pack/v1/apple-touch-icon.png',
      },
      { property: 'og:url', content: 'https://dxrating.net' },
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: 'DXRating' },
      {
        name: 'twitter:description',
        content: 'DXRating is a maimai DX Rating analyzer, along with other features like chart details and more.',
      },
      { name: 'theme-color', content: '#c8a8f9' },
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'msapplication-TileColor', content: '#c8a8f9' },
      {
        name: 'msapplication-config',
        content: 'https://shama.dxrating.net/favicon/pack/v1/browserconfig.xml',
      },
    ],
    links: [
      { rel: 'stylesheet', href: unoResetCss },
      { rel: 'stylesheet', href: appCss },
      { rel: 'canonical', href: 'https://dxrating.net' },
      { rel: 'alternate', hrefLang: 'en', href: 'https://dxrating.net/?locale=en' },
      { rel: 'alternate', hrefLang: 'ja', href: 'https://dxrating.net/?locale=ja' },
      { rel: 'alternate', hrefLang: 'zh-Hans', href: 'https://dxrating.net/?locale=zh-Hans' },
      { rel: 'alternate', hrefLang: 'zh-Hant', href: 'https://dxrating.net/?locale=zh-Hant' },
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
  }),
  component: RootComponent,
})

function RootLayout() {
  const versionTheme = useVersionTheme()
  const { t } = useTranslation(['root'])
  const location = useLocation()
  const navigate = useNavigate()
  const posthog = usePostHog()
  const [, startTransition] = useTransition()

  const pathname = location.pathname

  const isPrivacyPolicy = pathname === '/privacy-policy'
  const isSongPage = pathname.startsWith('/songs/')
  const showTabs = !isSongPage && !isPrivacyPolicy

  const tab: AppTabsValuesType = APP_TABS_VALUES.includes(pathname.slice(1) as AppTabsValuesType)
    ? (pathname.slice(1) as AppTabsValuesType)
    : 'search'

  useEffect(() => {
    posthog?.capture('tab_switched', { tab })
  }, [posthog, tab])

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
        {showTabs && (
          <Tabs
            value={tab}
            onChange={(_, v: AppTabsValuesType) => {
              startTransition(() => {
                startViewTransition(() => {
                  navigate({ to: `/${v}` })
                })
                localStorage.setItem('tab-selection', JSON.stringify(v))
              })
            }}
            classes={{
              root: 'rounded-xl bg-zinc-900/10 !min-h-2.5rem',
              indicator: '!h-full !rounded-lg z-0',
            }}
          >
            {APP_TABS_VALUES.map((v) => (
              <Tab
                key={v}
                label={t(`root:pages.${v}.title`)}
                classes={{
                  selected: '!text-white font-bold text-shadow-md',
                  root: '!rounded-lg transition-colors z-1 !py-0 !min-h-2.5rem !h-2.5rem',
                }}
                value={v}
              />
            ))}
          </Tabs>
        )}
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
        alt="background"
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
  return (
    <html lang="en">
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