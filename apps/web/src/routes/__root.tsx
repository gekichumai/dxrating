import type { QueryClient } from '@tanstack/react-query'
import { QueryClientProvider } from '@tanstack/react-query'
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouterState,
} from '@tanstack/react-router'
import { Tab, Tabs, CircularProgress } from '@mui/material'
import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'
import { type FC, Suspense, useEffect, useTransition } from 'react'
import { useTranslation } from 'react-i18next'
import { OverscrollBackgroundFiller } from '@/components/global/OverscrollBackgroundFiller'
import { VersionRegionSwitcher } from '@/components/global/preferences/VersionRegionSwitcher'
import { WebpSupportedImage } from '@/components/global/WebpSupportedImage'
import { TopBar } from '@/components/layout/TopBar'
import { CustomizedToaster } from '@/components/global/CustomizedToaster'
import { SideEffector } from '@/components/global/SideEffector'
import { VersionCustomizedThemeProvider } from '@/components/layout/VersionCustomizedThemeProvider'
import { AppContextProvider } from '@/models/context/AppContext'
import { RatingCalculatorContextProvider } from '@/models/context/RatingCalculatorContext'
import { useVersionTheme } from '@/utils/useVersionTheme'
import { startViewTransition } from '@/utils/startViewTransition'

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { i18nResources } from '@/locales/locales'

import '@unocss/reset/tailwind-compat.css'
import 'virtual:uno.css'
import '@/index.css'

// Initialize i18n for SSR (client.tsx handles client-side init with LanguageDetector)
if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: i18nResources,
    fallbackLng: 'en',
    lng: 'en',
    interpolation: {
      escapeValue: false,
    },
  })
}

export interface RouterContext {
  queryClient: QueryClient
}

const APP_TABS_VALUES = ['search', 'rating'] as const
type AppTabsValuesType = (typeof APP_TABS_VALUES)[number]

const fallbackElement = (
  <div className="flex items-center justify-center h-50% w-full p-6">
    <CircularProgress size="2rem" disableShrink />
  </div>
)

const TabNavigation: FC = () => {
  const versionTheme = useVersionTheme()
  const { t } = useTranslation(['root'])
  const posthogClient = typeof window !== 'undefined' ? posthog : null
  const [, startTransition] = useTransition()
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname

  const tab: AppTabsValuesType = APP_TABS_VALUES.find((v) => currentPath.startsWith(`/${v}`)) ?? 'search'

  useEffect(() => {
    posthogClient?.capture('tab_switched', { tab })
  }, [posthogClient, tab])

  // Don't show tab navigation on non-tab routes
  if (currentPath === '/privacy-policy' || currentPath.startsWith('/sheet/')) return null

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
        <Tabs
          value={tab}
          onChange={(_, v: AppTabsValuesType) => {
            startTransition(() => {
              startViewTransition(() => {
                if (typeof window !== 'undefined') {
                  localStorage.setItem('tab-selection', JSON.stringify(v))
                }
              })
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
              component={Link}
              to={`/${v}`}
            />
          ))}
        </Tabs>
      </div>
    </>
  )
}

export const Route = createRootRouteWithContext<RouterContext>()({
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
        content: 'DXRating is a maimai DX Rating analyzer, along with other features like sheet details and more.',
      },
      {
        name: 'keywords',
        content:
          'maimai, maimai DX, maimai DX Rating, maimai DX Rating analyzer, gekichumai, maimaiでらっくす, 舞萌, 舞萌DX, 舞萌查分器, 舞萌算分器, maimai wiki',
      },
      { name: 'theme-color', content: '#c8a8f9' },
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'msapplication-TileColor', content: '#c8a8f9' },
    ],
    links: [
      { rel: 'canonical', href: 'https://dxrating.net' },
      { rel: 'alternate', hrefLang: 'en', href: 'https://dxrating.net/?locale=en' },
      { rel: 'alternate', hrefLang: 'ja', href: 'https://dxrating.net/?locale=ja' },
      { rel: 'alternate', hrefLang: 'zh-Hans', href: 'https://dxrating.net/?locale=zh-Hans' },
      { rel: 'alternate', hrefLang: 'zh-Hant', href: 'https://dxrating.net/?locale=zh-Hant' },
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
      { rel: 'shortcut icon', href: 'https://shama.dxrating.net/favicon/pack/v1/favicon.ico' },
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&display=swap',
      },
      { rel: 'preconnect', href: 'https://derrakuma.dxrating.net' },
      { rel: 'prefetch', href: 'https://shama.dxrating.net/images/version-logo/buddies.webp' },
    ],
  }),
  component: RootComponent,
  shellComponent: RootDocument,
})

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

function InnerApp() {
  const versionTheme = useVersionTheme()

  return (
    <>
      <SideEffector />
      <CustomizedToaster />
      <div className="h-full w-full relative">
        <WebpSupportedImage
          src={versionTheme.background}
          alt="background"
          className="fixed inset-0 h-full-lvh w-full z-[-1] object-cover object-center select-none touch-callout-none"
          draggable={false}
        />
        <div className="h-full w-full relative">
          <Suspense fallback={fallbackElement}>
            <TabNavigation />
            <Outlet />
          </Suspense>
        </div>
      </div>
    </>
  )
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext()

  return (
    <QueryClientProvider client={queryClient}>
      <AppContextProvider>
        <VersionCustomizedThemeProvider>
          <RatingCalculatorContextProvider>
            <PostHogProvider client={posthog}>
              <InnerApp />
            </PostHogProvider>
          </RatingCalculatorContextProvider>
        </VersionCustomizedThemeProvider>
      </AppContextProvider>
    </QueryClientProvider>
  )
}
