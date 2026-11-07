import { HeadContent, Outlet, Scripts, createRootRoute, useRouter } from '@tanstack/react-router'
import { CircularProgress } from '@mui/material'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'
import clsx from 'clsx'
import { type CSSProperties, Suspense, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
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
import { useResolvedPathname } from '@/components/layout/useResolvedPathname'
import { NavigationProgress } from '@/components/layout/NavigationProgress'
import { SkipToContentLink } from '@/components/layout/SkipToContentLink'
import { NavigationOriginTracker } from '@/components/layout/navigationOrigins'
import { ScrollRestorationKeeper } from '@/components/layout/ScrollRestorationKeeper'
import { TopBar } from '@/components/layout/TopBar'
import { VersionCustomizedThemeProvider } from '@/components/layout/VersionCustomizedThemeProvider'
import { RegionVersionUpdatePrompt } from '@/components/global/preferences/RegionVersionUpdatePrompt'
import { AnnouncementBanners } from '@/components/global/announcements/AnnouncementBanner'
import { NoticeStack } from '@/components/global/NoticeStack'
import { AppContextProvider } from '@/models/context/AppContext'
import { RatingCalculatorContextProvider } from '@/models/context/RatingCalculatorContext'
import { CatalogProvider } from '@/catalog/CatalogContext'
import { loadCatalogMeta } from '@/catalog/catalogSource'
import { LocaleProvider, LocaleUrlSync, useLocale } from '@/i18n/LocaleProvider'
import { buildNotFoundSeoMeta, buildRootSeoMeta, resolveRootHeadState, resolveSeoLocale } from '@/utils/seo'
import { buildRootHeadLinks } from '@/utils/rootHeadLinks'
import { useVersionTheme } from '@/utils/useVersionTheme'
import { useThemeColorSync } from '@/utils/useThemeColorSync'
import { useRevealFocusInScrollFade } from '@/utils/useRevealFocusInScrollFade'
import { ZOD_JITLESS_INLINE_SCRIPT } from '@/setup/zod-jitless'
import { THEME_INLINE_SCRIPT } from '@/setup/theme-script'
import { splitLocalePath } from '@/setup/locale'
import { RENDERED_AT_META_NAME, RenderEnvironmentProvider, resolveRenderedAt } from '@/utils/renderEnvironment'
// All app CSS is global and ships as one stylesheet: the base styles first, then utilities, then page styles whose
// classes are scoped to their page (rating-table, legal-*)
import '@/index.css'
import 'virtual:uno.css'
import '@/components/layout/app-chrome.css'
import '@/components/layout/navigation-feedback.css'
import '@/pages/rating-table.css'
import '@/pages/legal.css'
import type { PlainMessage } from '@/i18n/message'
import { m } from '@/paraglide/messages'

const queryClient = new QueryClient()

const fallbackElement = (
  <div className="flex items-center justify-center h-50% w-full p-6">
    <CircularProgress size="2rem" disableShrink />
  </div>
)

export const Route = createRootRoute({
  notFoundComponent: NotFoundContent,
  // The page's language is the one its URL path names (`/ja/…`, meta#52), on the server and after every client
  // navigation, so <html lang> and the head follow Back and Forward between languages
  beforeLoad: (ctx) => ({
    locale: splitLocalePath(new URL(ctx.location.publicHref, 'https://dxrating.net').pathname).locale,
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
    const { isNotFound, includeRootTitle } = resolveRootHeadState(match, matches)

    return {
      meta: [
        { charSet: 'utf-8' },
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1.0, viewport-fit=cover',
        },
        ...buildRootSeoMeta(locale, { includeTitle: includeRootTitle }),
        ...(isNotFound ? buildNotFoundSeoMeta(locale) : []),
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
 * pages, the version switcher and primary navigation. Below 1024px the switcher is full size on the home page only;
 * inner pages get the compact row so their content starts near the top. From 1024px every page gets the same row, so
 * the navigation stays in place between pages. Keyed on the page on screen, not the pending destination, so the
 * header keeps its size until the next page renders (useResolvedPathname).
 */
function RootLayout() {
  const pathname = useResolvedPathname()
  useRevealFocusInScrollFade()

  const isLegalPage = isLegalPath(pathname)
  const isDevelopersPage = pathname === '/developers'
  const showAppChrome = !isDevelopersPage && !isLegalPage
  const compact = pathname !== '/'

  return (
    <header className="glass-bar pb-3 sm:pb-4">
      <TopBar />
      {showAppChrome && (
        <div
          className={clsx(
            // From 1024px one row on every page: the switcher on the left, the navigation on the right, under the site
            // name and the action pill. The home page's switcher takes the compact size there (layout/app-chrome.css)
            'page-gutter flex items-center justify-center pt-3 lg:flex-row lg:flex-nowrap lg:justify-between',
            compact ? 'flex-row flex-wrap gap-2 md:gap-3' : 'app-chrome--full flex-col gap-3 sm:pt-4 lg:pt-3',
          )}
        >
          <VersionRegionSwitcher compact={compact} />
          {showAppChrome && <AppTabs />}
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

// Better Auth's ?error= codes that have their own copy; any other code falls back to the default message
const OAUTH_ERRORS: Partial<Record<string, PlainMessage>> = {
  email_doesnt_match: m.auth_userProfile_oauthError_email_doesnt_match,
  unable_to_link_account: m.auth_userProfile_oauthError_unable_to_link_account,
  account_already_linked_to_different_user: m.auth_userProfile_oauthError_account_already_linked_to_different_user,
  default: m.auth_userProfile_oauthError_default,
  access_denied: m.auth_userProfile_oauthError_access_denied,
}

function OAuthErrorHandler() {
  const locale = useLocale()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const error = params.get('error')
    if (!error) return
    // The LXNS import callback carries its own ?status=error&error=… and explains it on the page
    if (window.location.pathname === '/io/import/lxns/oauth_callback') return

    // The raw provider code means nothing to people: keep it in the console for debugging, show plain copy
    console.warn('[oauth] sign-in returned an error', error, params.get('error_description') ?? '')
    if (error === 'access_denied') {
      // Cancelling at the provider is a choice, not a failure
      toast(m.auth_userProfile_oauthError_access_denied({}), { id: 'oauth-error' })
    } else {
      const message = Object.hasOwn(OAUTH_ERRORS, error) ? OAUTH_ERRORS[error]?.({}, { locale }) : undefined
      toast.error(message || m.auth_userProfile_oauthError_default({}), { id: 'oauth-error' })
    }

    params.delete('error')
    params.delete('error_description')
    const cleanURL = params.toString()
      ? `${window.location.pathname}?${params.toString()}${window.location.hash}`
      : `${window.location.pathname}${window.location.hash}`
    window.history.replaceState({}, '', cleanURL)
  }, [locale])

  return null
}

function RootComponent() {
  const { locale, renderedAt } = Route.useRouteContext()

  return (
    <RenderEnvironmentProvider renderedAt={renderedAt}>
      <LocaleProvider initialLocale={locale}>
        <AppContextProvider>
          <RootDocument>
            <CatalogProvider>
              <QueryClientProvider client={queryClient}>
                <VersionCustomizedThemeProvider>
                  <RatingCalculatorContextProvider>
                    <PostHogProvider client={posthog}>
                      <NetImportSettingsProvider>
                        <LocaleUrlSync />
                        <SideEffector />
                        <CustomizedToaster />
                        <NetImportProgress />
                        <ImportReviewHost />
                        <OAuthErrorHandler />
                        <NoticeStack>
                          <AnnouncementBanners />
                          <RegionVersionUpdatePrompt />
                        </NoticeStack>
                        <AppLayout />
                      </NetImportSettingsProvider>
                    </PostHogProvider>
                  </RatingCalculatorContextProvider>
                </VersionCustomizedThemeProvider>
              </QueryClientProvider>
            </CatalogProvider>
          </RootDocument>
        </AppContextProvider>
      </LocaleProvider>
    </RenderEnvironmentProvider>
  )
}

function AppLayout() {
  const locale = useLocale()
  const pathname = useResolvedPathname()
  const isLegalPage = isLegalPath(pathname)

  return (
    <div className="h-full w-full relative">
      <SkipToContentLink>{m.root_skipToContent({}, { locale })}</SkipToContentLink>
      <RouteChangeAnnouncer />
      <NavigationProgress />
      <NavigationOriginTracker />
      <ScrollRestorationKeeper />
      <VersionBackground />

      <div className="h-full w-full relative">
        <Suspense fallback={fallbackElement}>
          <RootLayout />
          <main id="main-content" tabIndex={-1}>
            {isLegalPage ? (
              // LegalLayout draws the one glass reading card (and, on desktop, the contents sidebar beside it)
              <div className="page-gutter pb-global">
                <Outlet />
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