import type { SupportedLocale } from '@gekichumai/api-contract'
import type { GenericEndpointContext, User } from 'better-auth'
import { createAuthMiddleware, createEmailVerificationToken } from 'better-auth/api'
import { Effect } from 'effect'
import type { Mailer } from '../services/mailer'
import { detectAuthLocale } from './auth-locale'
import { renderAuthMail, type AuthMailKind } from './auth-mail-templates'

/**
 * The account emails Better Auth sends (gekichumai/meta#80): a verification link after sign-up or on request, and
 * password reset links. Everything here is off while the Mailer is (no `RESEND_API_KEY`): Better Auth then answers
 * `/send-verification-email` and `/request-password-reset` with its "not enabled" errors, as before mail existed.
 *
 * Links go through Better Auth's own endpoints (`/verify-email`, `/reset-password/:token`), which check the token and
 * then redirect to the web's pages below, in the visitor's language. Whatever `callbackURL` or `redirectTo` a client
 * sends is replaced, so every mailed link lands on those pages.
 */

/** How long a mailed verification link works */
export const VERIFICATION_LINK_TTL_SECONDS = 24 * 60 * 60
/** How long a password reset link works */
export const RESET_PASSWORD_LINK_TTL_SECONDS = 60 * 60

/** The web's page that tells the visitor how verification went (`?error=` on failure); apps/web/src/routes/account */
export const WEB_VERIFY_EMAIL_PATH = '/account/verify-email'
/** The web's page that sets a new password with the reset token (`?token=`, or `?error=INVALID_TOKEN`) */
export const WEB_RESET_PASSWORD_PATH = '/account/reset-password'

/**
 * Better Auth routes whose new account is mailed a verification link: email sign-up, and passkey sign-up
 * (passkey-sign-up.ts), whose address is just as unproven
 */
export const SIGN_UP_PATHS = ['/sign-up/email', '/passkey/verify-registration'] as const

/** A user and the session made with it at most this far apart were made by the same sign-up request */
const SIGN_UP_WINDOW_MS = 30_000

/** At most this many account emails of one kind go to one address in {@link MAIL_THROTTLE_WINDOW_MS} */
export const MAIL_THROTTLE_MAX = 3
export const MAIL_THROTTLE_WINDOW_MS = 15 * 60 * 1000
const MAX_THROTTLED_ADDRESSES = 10_000

/**
 * Better Auth's rate limits count requests per IP address; this counts messages per recipient, so nobody can fill an
 * inbox by asking from many addresses. In memory, per instance.
 */
export const createMailThrottle = ({ max = MAIL_THROTTLE_MAX, windowMs = MAIL_THROTTLE_WINDOW_MS } = {}) => {
  const sent = new Map<string, number[]>()
  return (key: string, now = Date.now()) => {
    const recent = (sent.get(key) ?? []).filter((time) => now - time < windowMs)
    if (recent.length >= max) {
      sent.set(key, recent)
      return false
    }
    recent.push(now)
    sent.delete(key)
    sent.set(key, recent)
    // Oldest first: drop the addresses least recently mailed once the map is full
    if (sent.size > MAX_THROTTLED_ADDRESSES) sent.delete(sent.keys().next().value!)
    return true
  }
}

/** `path` on the web, in `locale`: English pages have no prefix, the others `/ja`, `/zh-hans`… (apps/web/src/setup/locale.ts) */
export const webPageUrl = (frontendUrl: string, locale: SupportedLocale, path: string) =>
  new URL(`${locale === 'en' ? '' : `/${locale.toLowerCase()}`}${path}`, frontendUrl).toString()

/** A Better Auth link with its `callbackURL` replaced */
export const withCallbackUrl = (link: string, callbackUrl: string) => {
  const url = new URL(link)
  url.searchParams.set('callbackURL', callbackUrl)
  return url.toString()
}

export const createAuthMail = ({ mailer, frontendUrl }: { mailer: typeof Mailer.Service; frontendUrl: string }) => {
  const allow = createMailThrottle()

  const deliver = (
    kind: AuthMailKind,
    email: string,
    url: string,
    locale: SupportedLocale,
    expiresInHours: number,
  ): Promise<void> => {
    if (!allow(`${kind}:${email.toLowerCase()}`)) {
      return Effect.runPromise(Effect.logWarning('Too many account emails to one address; not sent', { kind }))
    }
    const rendered = renderAuthMail({ kind, locale, email, url, expiresInHours })
    return Effect.runPromise(mailer.deliver({ to: email, kind, ...rendered }))
  }

  const localeOf = (request: Request | undefined) => detectAuthLocale(request?.headers) ?? 'en'

  /** Better Auth's `emailVerification.sendVerificationEmail` */
  const sendVerificationEmail = async ({ user, url }: { user: User; url: string }, request?: Request) => {
    const locale = localeOf(request)
    const link = withCallbackUrl(url, webPageUrl(frontendUrl, locale, WEB_VERIFY_EMAIL_PATH))
    await deliver('verify_email', user.email, link, locale, VERIFICATION_LINK_TTL_SECONDS / 3600)
  }

  /** Better Auth's `emailAndPassword.sendResetPassword` */
  const sendResetPassword = async ({ user, url }: { user: User; url: string }, request?: Request) => {
    const locale = localeOf(request)
    const link = withCallbackUrl(url, webPageUrl(frontendUrl, locale, WEB_RESET_PASSWORD_PATH))
    await deliver('reset_password', user.email, link, locale, RESET_PASSWORD_LINK_TTL_SECONDS / 3600)
  }

  /**
   * Mails a verification link to an account a sign-up request just made, once that request has succeeded. This is
   * Better Auth's `sendOnSignUp`, moved to an after-hook so that it runs after everything else the request did and
   * reads the account as it is then: an address the request already proved (the Email Verification Protocol) gets no
   * mail. Passkey sign-ups, which `sendOnSignUp` doesn't cover, are mailed too.
   */
  const sendSignUpVerification = async (ctx: GenericEndpointContext) => {
    if (!(SIGN_UP_PATHS as readonly string[]).includes(ctx.path)) return
    const created = ctx.context.newSession
    if (!created) return
    // A signed-in visitor's new passkey session is not a new account
    const userAge = Math.abs(new Date(created.session.createdAt).getTime() - new Date(created.user.createdAt).getTime())
    if (userAge > SIGN_UP_WINDOW_MS) return
    const user = await ctx.context.internalAdapter.findUserById(created.user.id)
    if (!user || user.emailVerified) return
    const token = await createEmailVerificationToken(
      ctx.context.secret,
      user.email,
      undefined,
      VERIFICATION_LINK_TTL_SECONDS,
      {
        userId: user.id,
      },
    )
    const url = `${ctx.context.baseURL}/verify-email?token=${token}`
    await sendVerificationEmail({ user, url }, ctx.request)
  }

  return {
    enabled: mailer.enabled,
    /** `emailVerification` for Better Auth, or nothing while mail is off */
    emailVerification: mailer.enabled
      ? {
          sendVerificationEmail,
          // Sent by `afterHook` instead (see sendSignUpVerification)
          sendOnSignUp: false,
          autoSignInAfterVerification: true,
          expiresIn: VERIFICATION_LINK_TTL_SECONDS,
        }
      : undefined,
    /** The password reset part of `emailAndPassword`, or nothing while mail is off */
    passwordReset: mailer.enabled
      ? {
          sendResetPassword,
          resetPasswordTokenExpiresIn: RESET_PASSWORD_LINK_TTL_SECONDS,
          // A reset is for an account someone else may be in: sign every device out
          revokeSessionsOnPasswordReset: true,
        }
      : {},
    afterHook: createAuthMiddleware(async (ctx) => {
      if (!mailer.enabled) return
      try {
        await sendSignUpVerification(ctx)
      } catch (error) {
        // The account exists either way; the visitor can ask for another link from their account page
        await Effect.runPromise(Effect.logWarning('Could not send the sign-up verification email', error))
      }
    }),
  }
}