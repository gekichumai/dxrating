import { PrivacyPolicy } from '@/pages/PrivacyPolicy'
import { CircularProgress, Tab, Tabs } from '@mui/material'
import { usePostHog } from 'posthog-js/react'
import { type FC, Suspense, useCallback, useEffect, useTransition } from 'react'
import { useTranslation } from 'react-i18next'
import { useEffectOnce } from 'react-use'
import { Route, Router, useLocation, useRoute } from 'wouter'
import { OverscrollBackgroundFiller } from './components/global/OverscrollBackgroundFiller'
import { VersionRegionSwitcher } from './components/global/preferences/VersionRegionSwitcher'
import { WebpSupportedImage } from './components/global/WebpSupportedImage'
import { TopBar } from './components/layout/TopBar'
import { RatingCalculator } from './pages/RatingCalculator'
import { SheetList } from './pages/SheetList'
import { startViewTransition } from './utils/startViewTransition'
import { useVersionTheme } from './utils/useVersionTheme'

const APP_TABS_VALUES = ['search', 'rating'] as const
type AppTabsValuesType = (typeof APP_TABS_VALUES)[number]

const fallbackElement = (
  <div className="flex items-center justify-center h-50% w-full p-6">
    <CircularProgress size="2rem" disableShrink />
  </div>
)

const useAppTab = () => {
  const posthog = usePostHog()
  const [, setLocation] = useLocation()
  const [, locationTabMatch] = useRoute('/*')
  const [, startTransition] = useTransition()

  const userInteractedSetTab = useCallback(
    (newTab: AppTabsValuesType) => {
      startTransition(() => {
        startViewTransition(() => {
          setLocation(`/${newTab}`)
        })

        localStorage.setItem('tab-selection', JSON.stringify(newTab))
      })
    },
    [setLocation],
  )

  useEffectOnce(() => {
    const tab = JSON.parse(localStorage.getItem('tab-selection') ?? `"${APP_TABS_VALUES[0]}"`)
    if (tab && location.pathname === '/') setLocation(`/${tab}${window.location.search}${window.location.hash}`)
  })

  const tab = APP_TABS_VALUES.includes(locationTabMatch?.['*'] as AppTabsValuesType)
    ? (locationTabMatch?.['*'] as AppTabsValuesType)
    : 'search'

  useEffect(() => {
    posthog?.capture('tab_switched', { tab })
  }, [posthog, tab])

  return [tab, userInteractedSetTab] as const
}

const RootLayout: FC = () => {
  const versionTheme = useVersionTheme()
  const [tab, setTab] = useAppTab()
  const { t } = useTranslation(['root'])
  const [location] = useLocation()

  if (location === '/privacy-policy') return null

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
          onChange={(_, v) => {
            setTab(v)
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
      </div>
    </>
  )
}

export const App = () => {
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
          <Router>
            <RootLayout />

            <Route path="/search">
              <SheetList />
            </Route>

            <Route path="/rating">
              <RatingCalculator />
            </Route>

            <Route path="/privacy-policy">
              <PrivacyPolicy />
            </Route>
          </Router>
        </Suspense>
      </div>
    </div>
  )
}
