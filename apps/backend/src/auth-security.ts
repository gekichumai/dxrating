import type { BetterAuthAdvancedOptions } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'

const RETURN_URL_ERROR_CODES = {
  callbackURL: 'INVALID_CALLBACK_URL',
  redirectTo: 'INVALID_REDIRECT_URL',
  errorCallbackURL: 'INVALID_ERROR_CALLBACK_URL',
  newUserCallbackURL: 'INVALID_NEW_USER_CALLBACK_URL',
} as const

type AuthReturnUrlField = keyof typeof RETURN_URL_ERROR_CODES

export const requireExistingOauthAccount = <TOptions extends object>(
  options: TOptions,
): TOptions & { readonly disableImplicitSignUp: true } => ({
  ...options,
  disableImplicitSignUp: true,
})

const getStringField = (source: unknown, field: AuthReturnUrlField): string | undefined => {
  if (!source || typeof source !== 'object') return undefined
  const value = Reflect.get(source, field)
  return typeof value === 'string' ? value : undefined
}

export const hasUrlUserInfo = (value: string): boolean => {
  if (value.startsWith('/')) return false

  try {
    const parsed = new URL(value)
    return parsed.username.length > 0 || parsed.password.length > 0
  } catch {
    return false
  }
}

export const findAuthReturnUrlUserInfoField = (...sources: unknown[]): AuthReturnUrlField | undefined => {
  for (const field of Object.keys(RETURN_URL_ERROR_CODES) as AuthReturnUrlField[]) {
    for (const source of sources) {
      const value = getStringField(source, field)
      if (value && hasUrlUserInfo(value)) return field
    }
  }

  return undefined
}

export const rejectAuthReturnUrlUserInfo = createAuthMiddleware(async (context) => {
  const field = findAuthReturnUrlUserInfoField(context.body, context.query)
  if (!field) return

  throw APIError.from('FORBIDDEN', {
    code: RETURN_URL_ERROR_CODES[field],
    message: 'Invalid authentication return URL',
  })
})

export const buildAuthSecurityOptions = ({
  production,
  trustedOrigins,
}: {
  production: boolean
  trustedOrigins: readonly string[]
}): {
  trustedOrigins: string[]
  advanced: Pick<
    BetterAuthAdvancedOptions,
    'useSecureCookies' | 'disableCSRFCheck' | 'disableOriginCheck' | 'defaultCookieAttributes'
  >
} => ({
  trustedOrigins: [...trustedOrigins],
  advanced: {
    useSecureCookies: production,
    disableCSRFCheck: false,
    disableOriginCheck: false,
    defaultCookieAttributes: {
      httpOnly: true,
      secure: production,
      sameSite: 'lax',
      path: '/',
    },
  },
})

const LEGACY_DOMAIN_COOKIE_NAMES = [
  '__Secure-dxrating.session_token',
  '__Secure-dxrating.session_data',
  '__Secure-dxrating.account_data',
  '__Secure-dxrating.dont_remember',
  '__Secure-dxrating.state',
  '__Secure-dxrating.oauth_state',
  '__Secure-dxrating.better-auth-passkey',
  'dxrating.last_used_login_method',
] as const

const responseChangesSessionCookie = (response: Response): boolean =>
  response.headers
    .getSetCookie()
    .some(
      (cookie) => cookie.startsWith('__Secure-dxrating.session_token=') || cookie.startsWith('dxrating.session_token='),
    )

export const expireLegacyDomainAuthCookies = (response: Response, legacyCookieDomain?: string): Response => {
  if (!legacyCookieDomain || !responseChangesSessionCookie(response)) return response

  const headers = new Headers(response.headers)
  for (const name of LEGACY_DOMAIN_COOKIE_NAMES) {
    headers.append(
      'Set-Cookie',
      `${name}=; Path=/; Domain=${legacyCookieDomain}; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`,
    )
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}