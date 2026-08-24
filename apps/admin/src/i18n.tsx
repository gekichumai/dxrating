import { createContext, useContext, useMemo, type ReactNode } from 'react'

export const englishCatalog = {
  'app.name': 'admin',
  'app.tagline': 'Operations control center',
  'actions.backToDashboard': 'Back to dashboard',
  'actions.cancel': 'Cancel',
  'actions.confirm': 'Confirm',
  'actions.retry': 'Try again',
  'breadcrumbs.label': 'Breadcrumbs',
  'environment.badge': '{environment} environment',
  'loading.label': 'Loading administrator workspace',
  'nav.administrators': 'Administrators',
  'nav.chartReports': 'Chart reports',
  'nav.charts': 'Charts',
  'nav.comments': 'Comments',
  'nav.dashboard': 'Dashboard',
  'nav.primary': 'Administrator destinations',
  'nav.users': 'Users',
  'notFound.description': 'The requested administrator page does not exist.',
  'notFound.title': 'Page not found',
  'page.administrators.description': 'Administrator role management will be connected in a later implementation step.',
  'page.administrators.title': 'Administrators',
  'page.chartReports.description':
    'Reported chart issues will be triaged here once the reporting workflow is connected.',
  'page.chartReports.title': 'Chart reports',
  'page.charts.description':
    'Chart provenance, revisions, and maintenance tools will be available from this workspace.',
  'page.charts.title': 'Charts',
  'page.comments.description': 'Recent comments and moderation actions will be available from this workspace.',
  'page.comments.title': 'Comments',
  'page.dashboard.description':
    'Operational health and maintenance summaries will appear here as data sources are connected.',
  'page.dashboard.title': 'Dashboard',
  'page.placeholder.badge': 'Foundation ready',
  'page.placeholder.next': 'This route is ready for its feature implementation.',
  'page.users.description': 'User lookup, status, and moderation controls will be available from this workspace.',
  'page.users.title': 'Users',
  'routeError.description': 'The page could not be rendered. Retry the route or return to the dashboard.',
  'routeError.title': 'Something went wrong',
  'shell.closeNavigation': 'Close navigation',
  'shell.collapseHint': 'Navigation collapses at supported tablet widths.',
  'shell.currentUser': 'Current administrator',
  'shell.currentUserMenu': 'Open current user menu',
  'shell.currentUserName': 'Administrator',
  'shell.currentUserRole': 'Session integration pending',
  'shell.openNavigation': 'Open navigation',
  'shell.sessionPending': 'Account and sign-out controls arrive with authentication.',
  'shell.skipToContent': 'Skip to main content',
  'shell.switchToDark': 'Use dark color scheme',
  'shell.switchToLight': 'Use light color scheme',
  'signIn.description': 'Authentication is intentionally disconnected until the dedicated sign-in step is implemented.',
  'signIn.email': 'Email',
  'signIn.emailPlaceholder': 'administrator@example.com',
  'signIn.password': 'Password',
  'signIn.submit': 'Continue',
  'signIn.title': 'Administrator sign in',
} as const

export type MessageKey = keyof typeof englishCatalog
export type TranslationValues = Readonly<Record<string, string | number>>

export const translate = (key: MessageKey, values: TranslationValues = {}): string => {
  let message: string = englishCatalog[key]
  for (const [name, value] of Object.entries(values)) {
    message = message.replaceAll(`{${name}}`, String(value))
  }
  return message
}

type TranslationContextValue = {
  readonly locale: 'en'
  readonly t: typeof translate
}

const TranslationContext = createContext<TranslationContextValue | undefined>(undefined)

export const TranslationProvider = ({ children }: { children: ReactNode }) => {
  const value = useMemo<TranslationContextValue>(() => ({ locale: 'en', t: translate }), [])
  return <TranslationContext.Provider value={value}>{children}</TranslationContext.Provider>
}

export const useAdminTranslation = (): TranslationContextValue => {
  const value = useContext(TranslationContext)
  if (!value) throw new Error('useAdminTranslation must be used inside TranslationProvider')
  return value
}