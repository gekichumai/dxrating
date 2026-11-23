import type { GenericEndpointContext } from 'better-auth'
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api'
import { Data, Effect } from 'effect'
import { z } from 'zod'

/**
 * Passkey-first sign-up. A visitor with no session gives an email address, creates a passkey, and gets a new account
 * and a session in the same step, with no password.
 *
 * The plugin calls `resolveUser` when it builds the registration challenge and `afterVerification` once the
 * authenticator's response checks out. The account is created only in the second, inside the plugin's transaction
 * that stores the passkey and the session, so an abandoned ceremony leaves nothing behind. The user ID chosen in the
 * first step goes into the passkey as its user handle and becomes the account's ID, so the two always match.
 *
 * Turnstile is checked in the first step, before anything is said about the address: otherwise this route would tell
 * anyone, without a check, whether an address has an account. The challenge it hands out is single-use and bound to
 * this resolver, so finishing the ceremony needs no second check, and a failed check never leaves the visitor's
 * password manager holding a passkey the server refused.
 */

const emailSchema = z.string().trim().toLowerCase().pipe(z.email())

const USER_ALREADY_EXISTS = {
  code: 'USER_ALREADY_EXISTS',
  message: 'User already exists. Use another email.',
} as const

const INVALID_EMAIL = { code: 'INVALID_EMAIL', message: 'Invalid email' } as const

const CAPTCHA_FAILED = { code: 'VERIFICATION_FAILED', message: 'Captcha verification failed' } as const

/**
 * The plugin's `context`, a string the client sends with the challenge request and the plugin stores with the
 * challenge: JSON with the email address and, when Turnstile is on, its token. The plugin's client sends no custom
 * headers on that request, so the token can't travel the way it does for email sign-up.
 */
export const passkeySignUpContext = z.object({ email: emailSchema, captcha: z.string().min(1).optional() })

const parseContext = (context: string | null | undefined) => {
  let json: unknown
  try {
    json = JSON.parse(context ?? '')
  } catch {
    throw APIError.from('BAD_REQUEST', INVALID_EMAIL)
  }
  const parsed = passkeySignUpContext.safeParse(json)
  if (!parsed.success) throw APIError.from('BAD_REQUEST', INVALID_EMAIL)
  return parsed.data
}

const assertEmailFree = async (ctx: GenericEndpointContext, email: string) => {
  if (await ctx.context.internalAdapter.findUserByEmail(email)) {
    throw APIError.from('UNPROCESSABLE_ENTITY', USER_ALREADY_EXISTS)
  }
}

/** Default display name, the same one email sign-up picks: the part of the address before the @ */
const nameFromEmail = (email: string) => email.slice(0, email.indexOf('@'))

class TurnstileUnavailable extends Data.TaggedError('TurnstileUnavailable')<{ readonly cause: unknown }> {}

/**
 * The same Turnstile check the captcha plugin runs on email sign-up. That plugin can't guard this route: it matches
 * on the path alone and reads a header, while signed-in visitors adding a passkey in their settings use the same path
 * without a Turnstile widget.
 */
const verifyTurnstile = (ctx: GenericEndpointContext, secretKey: string, token: string | undefined) =>
  // oxlint-disable-next-line no-restricted-properties -- Better Auth awaits this inside Authentication.handle, which runApp joins uninterruptibly
  Effect.runPromise(
    Effect.gen(function* () {
      if (!token) {
        return yield* Effect.fail(
          APIError.from('BAD_REQUEST', { code: 'MISSING_RESPONSE', message: 'Missing CAPTCHA response' }),
        )
      }
      const body = new URLSearchParams({ secret: secretKey, response: token })
      const ip = ctx.headers?.get('cf-connecting-ip')
      if (ip) body.set('remoteip', ip)
      const result = yield* Effect.tryPromise({
        try: async (signal) => {
          const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            body,
            signal: AbortSignal.any([signal, AbortSignal.timeout(5_000)]),
          })
          if (!response.ok) throw new Error(`Turnstile answered ${response.status}`)
          return (await response.json()) as { success?: unknown }
        },
        catch: (cause) => new TurnstileUnavailable({ cause }),
      }).pipe(Effect.mapError(() => APIError.from('SERVICE_UNAVAILABLE', CAPTCHA_FAILED)))
      if (result.success !== true) return yield* Effect.fail(APIError.from('FORBIDDEN', CAPTCHA_FAILED))
    }),
  )

export const passkeySignUp = ({ turnstileSecretKey }: { turnstileSecretKey: string | undefined }) => ({
  // A signed-in visitor registers a passkey for their own account (the plugin resolves them from the session and
  // never calls resolveUser), so dropping the plugin's session requirement only opens the path for new accounts.
  requireSession: false,
  resolveUser: async ({ ctx, context }: { ctx: GenericEndpointContext; context?: string | null }) => {
    const { email, captcha } = parseContext(context)
    if (turnstileSecretKey) await verifyTurnstile(ctx, turnstileSecretKey, captcha)
    // Checked again when the account is created; this answer only spares the visitor a ceremony that can't finish
    await assertEmailFree(ctx, email)
    return { id: ctx.context.generateId({ model: 'user' }) || crypto.randomUUID(), name: email, displayName: email }
  },
  afterVerification: async ({
    ctx,
    user,
    context,
  }: {
    ctx: GenericEndpointContext
    user: { id: string }
    context?: string | null
  }) => {
    // The challenge was for an existing account (the visitor was signed in when it was made): nothing to create
    if (await ctx.context.internalAdapter.findUserById(user.id)) return
    // The challenge stored the email it was made for; a signed-in visitor can't attach a new account to their session
    if ((await getSessionFromCtx(ctx))?.user) {
      throw APIError.from('UNAUTHORIZED', { code: 'UNAUTHORIZED', message: 'Sign out to create a new account' })
    }
    const { email } = parseContext(context)
    await assertEmailFree(ctx, email)
    await ctx.context.internalAdapter.createUser(
      {
        id: user.id,
        email,
        name: nameFromEmail(email),
        emailVerified: false,
      },
      { method: 'passkey' },
    )
    return { userId: user.id }
  },
})

/**
 * The passkey plugin checks session freshness only while it requires a session for every registration. With
 * passkey-first sign-up turned on, keep that check for signed-in visitors: someone holding an old session cookie must
 * not be able to add a passkey of their own to the account.
 */
export const requireFreshSessionToAddPasskey = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== '/passkey/generate-register-options' && ctx.path !== '/passkey/verify-registration') return
  const session = await getSessionFromCtx(ctx)
  if (!session) return
  const freshAge = ctx.context.sessionConfig.freshAge
  if (freshAge === 0) return
  if (Date.now() - new Date(session.session.createdAt).getTime() >= freshAge * 1000) {
    throw APIError.from('FORBIDDEN', { code: 'SESSION_NOT_FRESH', message: 'Session is not fresh' })
  }
})