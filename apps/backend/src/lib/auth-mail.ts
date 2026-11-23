import type { SupportedLocale } from '@gekichumai/api-contract'
import type { BetterAuthPlugin, GenericEndpointContext, User } from 'better-auth'
import { APIError, createAuthMiddleware, createEmailVerificationToken, getSessionFromCtx } from 'better-auth/api'
import { verifyJWT } from 'better-auth/crypto'
import { and, eq, ne, sql } from 'drizzle-orm'
import { Effect } from 'effect'
import type { Database } from '../db/index'
import { account, passkey, session, user as userTable } from '../db/auth-schema'
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
 *
 * Anyone can sign up with an address they don't own, and that account gets mailed a link. So that such an account
 * never becomes the owner's in name only (pre-account takeover):
 *
 * - a verification link works only in a browser signed in to the account it was made for
 *   ({@link requireSessionForEmailLink}); clicking it signs nobody in;
 * - a password reset on an unverified account hands the account to whoever holds the inbox: it removes the passkeys
 *   and social sign-ins added before, and the address counts as verified ({@link claimUnverifiedAccount}).
 */

/** How long a mailed verification link works */
export const VERIFICATION_LINK_TTL_SECONDS = 24 * 60 * 60
/** How long a password reset link works */
export const RESET_PASSWORD_LINK_TTL_SECONDS = 60 * 60

/**
 * The web's page that tells the visitor how verification went (`?error=` on failure); apps/web/src/routes/account. It
 * reads the outcome from the signed-in session, since a link only works with one.
 */
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

/** `?error=` on the verification page: the link was opened without a session of its account */
export const SESSION_REQUIRED_ERROR = 'SESSION_REQUIRED'

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

/**
 * `hooks.before` on `/verify-email`: a verification link works only for a visitor signed in to the account it was made
 * for. The mailed address may belong to someone other than the one who signed up with it; if a click verified it,
 * the sign-up's password and passkeys would hold an account that now looks like the inbox owner's (cloud save trusts
 * it, and Better Auth links that address's Google or Apple sign-in to it). Without such a session the link is refused
 * and the page asks the visitor to sign in first; the token stays usable until it expires.
 *
 * A token that doesn't verify is left to Better Auth, which tells an expired link from a broken one.
 */
export const requireSessionForEmailLink = async (ctx: GenericEndpointContext, frontendUrl: string) => {
  if (ctx.path !== '/verify-email') return
  const token: unknown = ctx.query?.token
  if (typeof token !== 'string') return
  const claims = await verifyJWT<{ email?: unknown; userId?: unknown }>(token, ctx.context.secret)
  if (!claims || typeof claims.email !== 'string') return
  const current = await getSessionFromCtx(ctx)
  const owner =
    typeof claims.userId === 'string'
      ? current?.user.id === claims.userId
      : current?.user.email.toLowerCase() === claims.email.toLowerCase()
  if (owner) return
  // Only to the web's own page: this runs before Better Auth checks the callback against the trusted origins
  const callbackURL: unknown = ctx.query?.callbackURL
  const page = typeof callbackURL === 'string' ? safeParseUrl(callbackURL) : undefined
  if (page && page.origin === new URL(frontendUrl).origin) {
    page.search = ''
    page.searchParams.set('error', SESSION_REQUIRED_ERROR)
    throw ctx.redirect(page.toString())
  }
  throw APIError.from('UNAUTHORIZED', { code: SESSION_REQUIRED_ERROR, message: 'Sign in to verify this email address' })
}

const safeParseUrl = (value: string) => {
  try {
    return new URL(value)
  } catch {
    return undefined
  }
}

/**
 * Better Auth's `emailAndPassword.onPasswordReset`. Using a mailed reset link proves control of the address. On an
 * account whose address was unverified, whoever set it up may not hold that inbox, so the reset makes the account the
 * inbox holder's: the passkeys and social sign-ins added before go (the reset already replaced the password and
 * signed every session out), and the address counts as verified by `email_link`. An account already verified keeps
 * everything. Returns whether it claimed the account.
 */
export const claimUnverifiedAccount = Effect.fn('claimUnverifiedAccount')(function* (
  database: typeof Database.Service,
  resetUser: Pick<User, 'id' | 'email' | 'emailVerified'>,
) {
  if (resetUser.emailVerified) return false
  return yield* database.transaction((db) =>
    Effect.gen(function* () {
      const claimed = yield* db
        .update(userTable)
        .set({ emailVerified: true, emailVerifiedAt: sql`now()`, emailVerificationMethod: 'email_link' })
        .where(
          and(
            eq(userTable.id, resetUser.id),
            eq(sql`lower(${userTable.email})`, resetUser.email.toLowerCase()),
            eq(userTable.emailVerified, false),
          ),
        )
        .returning({ id: userTable.id })
      // The address changed or was verified since the reset began: someone proved it, nothing to hand over
      if (claimed.length === 0) return false
      yield* db.delete(passkey).where(eq(passkey.userId, resetUser.id))
      yield* db.delete(account).where(and(eq(account.userId, resetUser.id), ne(account.providerId, 'credential')))
      // A passkey may have signed in between the reset's revocation and now
      yield* db.delete(session).where(eq(session.userId, resetUser.id))
      return true
    }),
  )
})

export const createAuthMail = ({
  mailer,
  database,
  frontendUrl,
}: {
  mailer: typeof Mailer.Service
  database: typeof Database.Service
  frontendUrl: string
}) => {
  const allow = createMailThrottle()

  const deliver = (
    kind: AuthMailKind,
    email: string,
    url: string,
    locale: SupportedLocale,
    expiresInHours: number,
  ): Promise<void> => {
    if (!allow(`${kind}:${email.toLowerCase()}`)) {
      // oxlint-disable-next-line no-restricted-properties -- Better Auth awaits this inside Authentication.handle, which runApp joins uninterruptibly
      return Effect.runPromise(Effect.logWarning('Too many account emails to one address; not sent', { kind }))
    }
    const rendered = renderAuthMail({ kind, locale, email, url, expiresInHours })
    // oxlint-disable-next-line no-restricted-properties -- Better Auth awaits this inside Authentication.handle, which runApp joins uninterruptibly
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

  /** Better Auth's `emailAndPassword.onPasswordReset` (see claimUnverifiedAccount) */
  const onPasswordReset = async ({ user }: { user: User }) => {
    // oxlint-disable-next-line no-restricted-properties -- Better Auth awaits this inside Authentication.handle, which runApp joins uninterruptibly
    await Effect.runPromise(claimUnverifiedAccount(database, user))
  }

  return {
    /** `emailVerification` for Better Auth, or nothing while mail is off */
    emailVerification: mailer.enabled
      ? {
          sendVerificationEmail,
          // Sent by `afterHook` instead (see sendSignUpVerification)
          sendOnSignUp: false,
          // The link needs a session of its account already (requireSessionForEmailLink): it never signs anyone in
          autoSignInAfterVerification: false,
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
          onPasswordReset,
        }
      : {},
    /**
     * Better Auth hooks: the ownership check on `/verify-email` before it runs, and the sign-up verification mail after
     * a sign-up succeeds
     */
    plugin: {
      id: 'dxrating-auth-mail',
      hooks: {
        before: [
          {
            matcher: (ctx) => ctx.path === '/verify-email',
            handler: createAuthMiddleware((ctx) => requireSessionForEmailLink(ctx, frontendUrl)),
          },
        ],
        after: [
          {
            matcher: (ctx) => mailer.enabled && (SIGN_UP_PATHS as readonly string[]).includes(ctx.path ?? ''),
            handler: createAuthMiddleware(async (ctx) => {
              try {
                await sendSignUpVerification(ctx)
              } catch (error) {
                // The account exists either way; the visitor can ask for another link from their account page
                // oxlint-disable-next-line no-restricted-properties -- Better Auth awaits this inside Authentication.handle, which runApp joins uninterruptibly
                await Effect.runPromise(Effect.logWarning('Could not send the sign-up verification email', error))
              }
            }),
          },
        ],
      },
    } satisfies BetterAuthPlugin,
  }
}