import { createContext, useContext, useMemo, type ReactNode } from 'react'

export const englishCatalog = {
  'app.name': 'admin',
  'app.tagline': 'Operations control center',
  'actions.backToDashboard': 'Back to dashboard',
  'actions.cancel': 'Cancel',
  'actions.confirm': 'Confirm',
  'actions.refreshCurrentState': 'Refresh current state',
  'actions.refresh': 'Refresh',
  'actions.reloadAdmin': 'Reload admin',
  'actions.retry': 'Try again',
  'actions.signInAgain': 'Sign in again',
  'actions.signOut': 'Sign out',
  'actions.useAnotherAccount': 'Use another account',
  'actions.verifyIdentity': 'Verify identity',
  'breadcrumbs.label': 'Breadcrumbs',
  'auth.clearing.description': 'Cached administrator information is being removed before access changes.',
  'auth.clearing.title': 'Securing this workspace',
  'auth.forbidden.description':
    'This account is signed in but is not on the administrator allowlist. Choose another account to continue.',
  'auth.forbidden.title': 'Administrator access required',
  'auth.pending.description': 'Your session and current administrator authority are being checked.',
  'auth.pending.title': 'Checking administrator access',
  'auth.signingOut.description': 'Protected administrator information is being removed before the session closes.',
  'auth.signingOut.title': 'Signing out securely',
  'auth.signOutUnavailable.description':
    'Protected information was removed, but the backend could not confirm sign-out. Retry before leaving this device.',
  'auth.signOutUnavailable.title': 'Sign-out could not be confirmed',
  'auth.unavailable.description':
    'Administrator access could not be verified. Protected operations remain closed until the backend responds.',
  'auth.unavailable.title': 'Administrator service unavailable',
  'compatibility.blocking.description': 'Protected administrator data is being cleared before recovery options appear.',
  'compatibility.blocking.title': 'Stopping administrator operations',
  'compatibility.reloadAvailable.description':
    'This admin build no longer matches the backend. Reload once to request the currently deployed build.',
  'compatibility.reloadAvailable.title': 'Admin update available',
  'compatibility.reloading.description': 'The matching administrator build is being requested now.',
  'compatibility.reloading.title': 'Reloading admin',
  'compatibility.updateRequired.description':
    'Admin is still incompatible after the safe recovery attempt. Operations remain blocked; contact support before continuing.',
  'compatibility.updateRequired.title': 'Administrator update required',
  'environment.badge': '{environment} environment',
  'error.cancelled.description': 'The request was cancelled.',
  'error.cancelled.title': 'Request cancelled',
  'error.clientIncompatible.description': 'This administrator client cannot safely read the backend response.',
  'error.clientIncompatible.title': 'Administrator update required',
  'error.conflict.description':
    'Another administrator changed this information. Refresh its current state before deciding what to do next.',
  'error.conflict.title': 'Information changed',
  'error.forbidden.description': 'Your account does not have permission to perform this administrator operation.',
  'error.forbidden.title': 'Access denied',
  'error.freshLoginRequired.description':
    'Your authority changed after this session began. Complete a full sign-in before continuing.',
  'error.freshLoginRequired.title': 'New sign-in required',
  'error.network.description': 'The administrator backend could not be reached. Check the connection and try again.',
  'error.network.title': 'Connection failed',
  'error.notFound.description': 'This item is no longer available. Refresh its containing list to see current data.',
  'error.notFound.title': 'Item not found',
  'error.rateLimited.description': 'Too many requests were made. Wait before trying this operation again.',
  'error.rateLimited.title': 'Please wait',
  'error.recentAuthRequired.description':
    'Confirm your identity before continuing. The pending action will not run again automatically.',
  'error.recentAuthRequired.title': 'Identity confirmation required',
  'error.server.description':
    'The administrator request could not be completed. Existing information remains available where possible.',
  'error.server.title': 'Server error',
  'error.stepUpFailed.description': 'Identity confirmation failed. Review your credentials and try again explicitly.',
  'error.stepUpFailed.title': 'Identity not confirmed',
  'error.stepUpRateLimited.description': 'Identity confirmation is temporarily limited. Wait before trying again.',
  'error.stepUpRateLimited.title': 'Identity confirmation paused',
  'error.supportId': 'Support ID',
  'error.unauthenticated.description': 'Your administrator session is unavailable. Sign in again to continue.',
  'error.unauthenticated.title': 'Sign-in required',
  'error.unexpected.description': 'The administrator request failed in an unexpected way. Try again if it is safe.',
  'error.unexpected.title': 'Unexpected error',
  'error.validation.description':
    'Review the entered information and correct the highlighted fields before resubmitting.',
  'error.validation.title': 'Check the information',
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
  'operationalRefresh.failed': 'Refresh failed. Existing information is still shown.',
  'operationalRefresh.lastUpdated': 'Last updated {timestamp}',
  'operationalRefresh.neverUpdated': 'No successful update yet',
  'operationalRefresh.refreshed': 'Information refreshed.',
  'operationalRefresh.refreshing': 'Refreshing information',
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
  'primaryAuthResult.checking.description': 'The backend is confirming the new identity-verification window.',
  'primaryAuthResult.checking.title': 'Confirming identity verification',
  'primaryAuthResult.continue': 'Return to admin',
  'primaryAuthResult.failure.description':
    'Identity verification was not confirmed. Start it again before retrying the sensitive operation.',
  'primaryAuthResult.failure.title': 'Identity verification incomplete',
  'primaryAuthResult.retry': 'Check again',
  'primaryAuthResult.success.description':
    'Identity verification is active. Return to admin and explicitly retry the operation when ready.',
  'primaryAuthResult.success.title': 'Identity verified',
  'recentAuth.description':
    'Re-enter your password or continue with Google. The original operation will not run automatically.',
  'recentAuth.googleSubmit': 'Continue with Google',
  'recentAuth.or': 'or',
  'recentAuth.passwordSubmit': 'Verify with password',
  'recentAuth.title': 'Confirm your identity',
  'routeError.description': 'The page could not be rendered. Retry the route or return to the dashboard.',
  'routeError.title': 'Something went wrong',
  'shell.closeNavigation': 'Close navigation',
  'shell.collapseHint': 'Navigation collapses at supported tablet widths.',
  'shell.currentUser': 'Current administrator',
  'shell.currentUserMenu': 'Open current user menu',
  'shell.currentUserName': 'Administrator',
  'shell.currentUserRole': 'Session integration pending',
  'shell.openNavigation': 'Open navigation',
  'shell.role.admin': 'Administrator',
  'shell.role.superAdmin': 'Super administrator',
  'shell.sessionPending': 'Account and sign-out controls arrive with authentication.',
  'shell.skipToContent': 'Skip to main content',
  'shell.switchToDark': 'Use dark color scheme',
  'shell.switchToLight': 'Use light color scheme',
  'signIn.alternativeDivider': 'or sign in with email',
  'signIn.captcha.description': 'Complete the privacy-preserving challenge before using your password.',
  'signIn.captcha.error': 'The challenge failed. Complete the refreshed challenge to continue.',
  'signIn.captcha.expired': 'The challenge expired. Complete the refreshed challenge to continue.',
  'signIn.captcha.label': 'Security challenge',
  'signIn.captcha.ready': 'Security challenge complete.',
  'signIn.captcha.reload': 'Reload challenge',
  'signIn.captcha.unavailable': 'The security challenge could not load. Reload this page to try again.',
  'signIn.captcha.waiting': 'Complete the security challenge to enable password sign-in.',
  'signIn.description': 'Use an existing account that has been granted administrator access.',
  'signIn.email': 'Email',
  'signIn.emailPlaceholder': 'administrator@example.com',
  'signIn.failure.cancelled': 'The sign-in attempt was cancelled.',
  'signIn.failure.captchaRejected': 'The security challenge was not accepted. Complete it again.',
  'signIn.failure.captchaRequired': 'Complete the security challenge before trying again.',
  'signIn.failure.invalidCredentials': 'The email address or password was not accepted.',
  'signIn.failure.oauthCallback': 'The provider sign-in did not complete. Start it again when ready.',
  'signIn.failure.providerUnavailable': 'That sign-in provider could not be reached. Try again later.',
  'signIn.failure.rateLimited': 'Too many sign-in attempts were made. Wait before trying again.',
  'signIn.failure.sessionExpired': 'The sign-in session expired. Start again.',
  'signIn.failure.title': 'Sign-in unsuccessful',
  'signIn.failure.unavailable': 'The authentication service could not be reached. Try again.',
  'signIn.failure.unexpected': 'Sign-in could not be completed. Try again when it is safe.',
  'signIn.password': 'Password',
  'signIn.provider.github': 'Continue with GitHub',
  'signIn.provider.google': 'Continue with Google',
  'signIn.redirect.description': 'Your administrator session is ready. Opening the workspace now.',
  'signIn.redirect.title': 'Opening admin',
  'signIn.sessionExpired': 'Your session ended or administrator access changed. Sign in again to continue.',
  'signIn.signedOut': 'You have been signed out and protected administrator information was cleared.',
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