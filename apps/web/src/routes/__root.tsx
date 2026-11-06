import { HeadContent, Outlet, Scripts, createRootRoute, useLocation, useRouter } from '@tanstack/react-router'
import { CircularProgress } from '@mui/material'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from 'i18next'
import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'
import clsx from 'clsx'
import { type CSSProperties, Suspense, useEffect, useMemo, useRef } from 'react'
import toast from 'react-hot-toast'
import { I18nextProvider, useTranslation } from 'react-i18next'
import { NetImportSettingsProvider } from '@/components/rating/io/import/NetImportSettingsContext'
import { NetImportProgress } from '@/components/rating/io/import/NetImportProgress'
import { ImportReviewHost } from '@/components/rating/io/import/ImportReviewDialog'
import { CustomizedToaster } from '@/components/global/CustomizedToaster'
import { NotFoundContent } from '@/components/global/NotFoundContent'
import { SideEffector } from '@/components/global/SideEffector'
import { VersionBackground } from '@/components/global/backgrounds/VersionBackground'
import { VersionRegionSwitcher } from '@/components/global/preferences/VersionRegionSwitcher'
import { AppTabs } from '@/components/layout/AppTabs'
import { ThemedBody } from '@/components/layout/ThemedBody'
import { TopBar } from '@/components/layout/TopBar'
import { VersionCustomizedThemeProvider } from '@/components/layout/VersionCustomizedThemeProvider'
import { RegionVersionUpdatePrompt } from '@/components/global/preferences/RegionVersionUpdatePrompt'
import { AppContextProvider } from '@/models/context/AppContext'
import { RatingCalculatorContextProvider } from '@/models/context/RatingCalculatorContext'
import { CatalogProvider } from '@/catalog/CatalogContext'
import { loadCatalogMeta } from '@/catalog/catalogSource'
import { createServerI18n } from '@/setup/init-i18n'
import { buildRootSeoMeta, formatSeoTitle, resolveSeoLocale } from '@/utils/seo'
import { buildRootHeadLinks } from '@/utils/rootHeadLinks'
import { useVersionTheme } from '@/utils/useVersionTheme'
import { useThemeColorSync } from '@/utils/useThemeColorSync'
import { ZOD_JITLESS_INLINE_SCRIPT } from '@/setup/zod-jitless'
import { THEME_INLINE_SCRIPT } from '@/setup/theme-script'
import { RENDERED_AT_META_NAME, RenderEnvironmentProvider, resolveRenderedAt } from '@/utils/renderEnvironment'
import 'virtual:uno.css'

const queryClient = new QueryClient()

// Routes whose head sets the full page title themselves
const SELF_TITLED_ROUTE_IDS = new Set(['/songs/$songId/$type/$difficulty', '/songs_/$songId'])

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
  // The catalog fields every page renders with; the songs a page needs come from its own loader (see CatalogProvider)
  loader: async () => ({ catalogMeta: await loadCatalogMeta() }),
  shouldReload: false,
  head: ({ match, matches }) => {
    const locale = resolveSeoLocale([match, ...matches])
    const includeRootTitle = !matches.some((match) => SELF_TITLED_ROUTE_IDS.has(String(match.routeId)))
    // A 404 (no route matched, or a loader threw notFound) gets its own title and stays out of the index
    const isNotFound = matches.some((match) => match.status === 'notFound' || match.globalNotFound)
    const notFoundMeta =
      isNotFound && includeRootTitle
        ? [
            { title: formatSeoTitle(createServerI18n(locale).t('root:not-found.title')) },
            { name: 'robots', content: 'noindex' },
          ]
        : []

    return {
      meta: [
        { charSet: 'utf-8' },
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1.0, viewport-fit=cover',
        },
        ...buildRootSeoMeta(locale, { includeTitle: includeRootTitle && !isNotFound }),
        ...notFoundMeta,
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        {
          name: 'msapplication-config',
          content: 'https://shama.dxrating.net/favicon/pack/v1/browserconfig.xml',
        },
      ],
      links: buildRootHeadLinks({
        pathname: matches[matches.length - 1]?.pathname ?? '/',
        search: matches[matches.length - 1]?.search,
      }),
      // The theme script first: it sets <html data-theme> before the body paints (setup/theme-script.ts)
      scripts: [{ children: THEME_INLINE_SCRIPT }, { children: ZOD_JITLESS_INLINE_SCRIPT }],
    }
  },
  component: RootComponent,
})

const isLegalPath = (pathname: string) => pathname === '/privacy-policy' || pathname === '/terms-of-service'

/**
 * The site header: one tinted-glass band (accent solid only behind the status bar) holding the top row and, on app
 * pages, the version switcher and primary navigation. The switcher is full size on the home page only; inner pages get
 * the compact row so their content starts near the top.
 */
function RootLayout() {
  const { pathname } = useLocation()

  const isLegalPage = isLegalPath(pathname)
  const isDevelopersPage = pathname === '/developers'
  const isSongPage = pathname.startsWith('/songs/')
  const showAppChrome = !isDevelopersPage && !isLegalPage
  const showTabs = showAppChrome && !isSongPage
  const compact = pathname !== '/'

  return (
    <header className="glass-bar pb-3 sm:pb-4">
      <TopBar />
      {showAppChrome && (
        <div
          className={clsx(
            'page-gutter flex items-center justify-center pt-3',
            compact ? 'flex-row flex-wrap gap-2 md:gap-3' : 'app-chrome--full flex-col gap-3 sm:pt-4',
          )}
        >
          <VersionRegionSwitcher compact={compact} />
          {showTabs && <AppTabs />}
        </div>
      )}
    </header>
  )
}

/** Moves focus to the new page's main landmark and announces its title after a client-side navigation */
function RouteChangeAnnouncer() {
  const router = useRouter()
  const announcerRef = useRef<HTMLOutputElement>(null)

  useEffect(
    () =>
      router.subscribe('onResolved', ({ fromLocation, toLocation }) => {
        // Query-only changes (typing in search, filters) keep focus where it is
        if (!fromLocation || fromLocation.pathname === toLocation.pathname) return
        // Two frames: the head (document.title) updates after the route resolves
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const main = document.getElementById('main-content')
            if (main && !main.contains(document.activeElement)) main.focus({ preventScroll: true })
            if (announcerRef.current) announcerRef.current.textContent = document.title
          }),
        )
      }),
    [router],
  )

  // <output> is an implicit polite status region; it is in the DOM from the first render, before any text is set
  return <output ref={announcerRef} aria-live="polite" aria-atomic="true" className="sr-only" />
}

function OAuthErrorHandler() {
  const { t } = useTranslation(['auth'])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const error = params.get('error')
    if (!error) return

    const key = `auth:user-profile.oauth-error.${error}` as const
    const message = t(key, { defaultValue: '' })
    toast.error(message || t('auth:user-profile.oauth-error.default', { error }), { id: 'oauth-error' })

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
        <AppContextProvider>
          <RootDocument>
            <CatalogProvider>
              <QueryClientProvider client={queryClient}>
                <VersionCustomizedThemeProvider>
                  <RatingCalculatorContextProvider>
                    <PostHogProvider client={posthog}>
                      <NetImportSettingsProvider>
                        <SideEffector />
                        <CustomizedToaster />
                        <NetImportProgress />
                        <ImportReviewHost />
                        <OAuthErrorHandler />
                        <RegionVersionUpdatePrompt />
                        <AppLayout />
                      </NetImportSettingsProvider>
                    </PostHogProvider>
                  </RatingCalculatorContextProvider>
                </VersionCustomizedThemeProvider>
              </QueryClientProvider>
            </CatalogProvider>
          </RootDocument>
        </AppContextProvider>
      </I18nextProvider>
    </RenderEnvironmentProvider>
  )
}

function AppLayout() {
  const { t } = useTranslation(['root'])
  const { pathname } = useLocation()
  const isLegalPage = isLegalPath(pathname)

  return (
    <div className="h-full w-full relative">
      <a href="#main-content" className="skip-to-content">
        {t('root:skip-to-content')}
      </a>
      <RouteChangeAnnouncer />
      <VersionBackground />

      <div className="h-full w-full relative">
        <Suspense fallback={fallbackElement}>
          <RootLayout />
          <main id="main-content" tabIndex={-1}>
            {isLegalPage ? (
              // Legal text reads on one glass sheet instead of a full-viewport white overlay
              <div className="page-gutter pb-global">
                <div className="glass mx-auto max-w-[808px]">
                  <Outlet />
                </div>
              </div>
            ) : (
              <Outlet />
            )}
          </main>
        </Suspense>
      </div>
    </div>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const theme = useVersionTheme()
  useThemeColorSync(theme.accentColor)
  const { locale, renderedAt } = Route.useRouteContext()

  return (
    <html
      lang={locale}
      // data-theme is set on this element by the pre-paint theme script before hydration and cannot be known on the
      // server (the HTML is cached per locale and path): the one attribute React may not compare. Applies to <html>
      // itself only, not to its children.
      suppressHydrationWarning
      style={
        {
          '--theme-accent': theme.accentColor,
          // Design tokens (src/styles/tokens.css) derive every surface tint and accent role from these two
          '--accent': theme.accentColor,
          '--accent-strong-light': theme.accentStrongColor,
          '--accent-strong-dark': theme.accentStrongDarkColor,
          '--theme-canvas': theme.canvasColor ?? theme.accentColor,
        } as CSSProperties
      }
    >
      <head>
        <HeadContent />
        <meta name="theme-color" content={theme.accentColor} />
        <meta name="msapplication-TileColor" content={theme.accentColor} />
        <meta name={RENDERED_AT_META_NAME} content={String(renderedAt)} />
      </head>
      <ThemedBody>
        {children}
        <Scripts />
      </ThemedBody>
    </html>
  )
}