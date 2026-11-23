import { AUTH_ERROR_TRANSLATIONS } from './auth-error-translations'
import { detectAuthLocale } from './auth-locale'

/** Better Auth's rate limiter answers 429 with a message and no code; this is the code its other errors use */
const RATE_LIMITED_CODE = 'TOO_MANY_REQUESTS'

/**
 * Better Auth's error response in the language the request asks for ({@link detectAuthLocale}): `message` becomes the
 * translation of its `code`, and `originalMessage` keeps the English. Anything else passes through untouched.
 *
 * This runs on the finished HTTP response rather than in a Better Auth after-hook (what `@better-auth/i18n` does),
 * because several errors on the sign-in and security forms never reach the after-hooks: a global before-hook's
 * (`SESSION_NOT_FRESH` when adding a passkey), and the captcha plugin's and the rate limiter's, which answer from
 * `onRequest` before any endpoint runs. The rate limiter's 429 also gets the code it lacks, so clients can match it.
 */
export const localizeAuthError = async (requestHeaders: Headers, response: Response): Promise<Response> => {
  if (response.status < 400 || !response.headers.get('content-type')?.includes('application/json')) return response
  const body: unknown = await response
    .clone()
    .json()
    .catch(() => undefined)
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return response
  const fields = body as Record<string, unknown>
  const code = typeof fields.code === 'string' ? fields.code : response.status === 429 ? RATE_LIMITED_CODE : undefined
  if (code === undefined) return response

  const locale = detectAuthLocale(requestHeaders)
  const translation = locale && locale !== 'en' ? AUTH_ERROR_TRANSLATIONS[locale][code] : undefined
  if (translation === undefined && fields.code === code) return response

  const headers = new Headers(response.headers)
  headers.delete('content-length')
  return new Response(
    JSON.stringify({
      ...fields,
      code,
      ...(translation === undefined ? {} : { message: translation, originalMessage: fields.message }),
    }),
    { status: response.status, statusText: response.statusText, headers },
  )
}