import {
  EMAIL_VERIFICATION_NONCE_AUTH_PATH,
  EMAIL_VERIFICATION_NONCE_FIELD,
  EMAIL_VERIFICATION_TOKEN_FIELD,
  EMAIL_VERIFICATION_VERIFY_AUTH_PATH,
} from '@gekichumai/api-contract'
import type { BetterAuthPlugin, GenericEndpointContext } from 'better-auth'
import { createAuthEndpoint, createAuthMiddleware, sessionMiddleware } from 'better-auth/api'
import { Clock, Effect } from 'effect'
import { z } from 'zod'
import { failureTags } from '../functions/sentry'
import type { Database } from '../../db/index'
import { markEmailVerified, type MarkEmailVerifiedResult } from '../email-verification-record'
import { checkNonce, consumeNonce, issueNonce } from './nonce'
import { EvpRejected, type EvpRejectionReason, type EvpVerifier } from './verifier'

/**
 * Chrome's Email Verification Protocol in Better Auth (gekichumai/meta#80):
 *
 * - `GET /email-verification-protocol/nonce` gives a sign-up form its nonce (nonce.ts);
 * - after a successful `/sign-up/email` whose body carries `emailVerificationToken` and `emailVerificationNonce`, the
 *   token is verified (verifier.ts) and, if it holds, the new account's address is verified by
 *   `email_verification_protocol`. This plugin's after-hook runs before auth-mail.ts's (auth.ts lists it first), which
 *   then finds the address verified and mails nothing;
 * - `POST /email-verification-protocol/verify` does the same for a signed-in account: a passkey sign-up, whose
 *   request body the passkey client fixes, sends its token right after.
 *
 * The token is always optional. A missing, bad or unverifiable one changes nothing: the sign-up succeeds as before and
 * the verification mail goes out. Failures are logged by reason only.
 */

/** How long verifying may hold up a sign-up (DNS, then the issuer's metadata and keys, each cached) */
const VERIFY_TIMEOUT_MS = 10_000

export interface EmailVerificationProtocolOptions {
  readonly verifier: EvpVerifier
  readonly database: typeof Database.Service
  /**
   * Origins our sign-up form is served from: the `aud` a token must carry. The request's `Origin` must be one of them
   * and the token's `aud` must equal it.
   */
  readonly audiences: readonly string[]
}

export type EmailVerificationProtocolOutcome =
  | { readonly verified: true; readonly result: MarkEmailVerifiedResult }
  | { readonly verified: false; readonly reason: EvpRejectionReason | 'email_mismatch' }

const SIGN_UP_PATH = '/sign-up/email'

export const emailVerificationProtocol = ({ verifier, database, audiences }: EmailVerificationProtocolOptions) => {
  /** Verifies `token` for `user` and records it; never throws */
  const verifyFor = (
    ctx: GenericEndpointContext,
    user: { readonly id: string; readonly email: string },
    token: string,
    nonce: string,
  ): Promise<EmailVerificationProtocolOutcome> =>
    // oxlint-disable-next-line no-restricted-properties -- Better Auth awaits this inside Authentication.handle, which runApp joins uninterruptibly
    Effect.runPromise(
      Effect.gen(function* () {
        const origin = ctx.headers?.get('origin') ?? ''
        if (!audiences.includes(origin)) return yield* Effect.fail(new EvpRejected({ reason: 'audience_mismatch' }))
        const now = yield* Clock.currentTimeMillis
        const check = checkNonce(ctx.context.secret, nonce, now)
        if (!check.valid) return yield* Effect.fail(new EvpRejected({ reason: 'nonce_invalid' }))
        const verified = yield* verifier.verify({ token, email: user.email, audience: origin, nonce }).pipe(
          Effect.timeoutOrElse({
            duration: VERIFY_TIMEOUT_MS,
            orElse: () => Effect.fail(new EvpRejected({ reason: 'issuer_unreachable' })),
          }),
        )
        // Only now, so that a bad token doesn't use the form's nonce up
        if (!(yield* consumeNonce(database, nonce, check.expiresAt))) {
          return yield* Effect.fail(new EvpRejected({ reason: 'nonce_replayed' }))
        }
        const result = yield* markEmailVerified(database, user.id, verified.email, 'email_verification_protocol')
        if (result === 'email_mismatch') return yield* Effect.fail(new EvpRejected({ reason: 'email_mismatch' }))
        yield* Effect.logInfo('Email verified by the Email Verification Protocol', { issuer: verified.issuer, result })
        return { verified: true, result } as const
      }).pipe(
        Effect.catchTag('EvpRejected', ({ reason }) =>
          Effect.logInfo('Email Verification Protocol token not accepted', { reason }).pipe(
            Effect.as({ verified: false, reason } as const),
          ),
        ),
        // The database failed: the account stays unverified and gets the mail, as without a token. Logged by
        // operation and SQL error reason only: the query error's message carries its parameters, the address among them
        Effect.catch((error) =>
          Effect.logWarning('Could not verify an Email Verification Protocol token', failureTags(error)).pipe(
            Effect.as({ verified: false, reason: 'issuer_unreachable' } as const),
          ),
        ),
      ),
    )

  const stringField = (body: unknown, field: string) => {
    if (typeof body !== 'object' || body === null || !(field in body)) return undefined
    const value: unknown = (body as Record<string, unknown>)[field]
    return typeof value === 'string' && value.length > 0 ? value : undefined
  }

  return {
    id: 'dxrating-email-verification-protocol',
    endpoints: {
      emailVerificationNonce: createAuthEndpoint(EMAIL_VERIFICATION_NONCE_AUTH_PATH, { method: 'GET' }, async (ctx) => {
        const issued = issueNonce(ctx.context.secret, Date.now())
        ctx.setHeader('Cache-Control', 'no-store')
        return ctx.json({ nonce: issued.nonce, expiresAt: issued.expiresAt.toISOString() })
      }),
      verifyEmailWithBrowser: createAuthEndpoint(
        EMAIL_VERIFICATION_VERIFY_AUTH_PATH,
        {
          method: 'POST',
          body: z.object({ token: z.string().min(1), nonce: z.string().min(1) }),
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const { user } = ctx.context.session
          const outcome = await verifyFor(ctx, user, ctx.body.token, ctx.body.nonce)
          return ctx.json({ verified: outcome.verified })
        },
      ),
    },
    hooks: {
      after: [
        {
          matcher: (ctx) => ctx.path === SIGN_UP_PATH,
          handler: createAuthMiddleware(async (ctx) => {
            const created = ctx.context.newSession
            if (!created) return
            const token = stringField(ctx.body, EMAIL_VERIFICATION_TOKEN_FIELD)
            const nonce = stringField(ctx.body, EMAIL_VERIFICATION_NONCE_FIELD)
            if (!token || !nonce) return
            await verifyFor(ctx, created.user, token, nonce)
          }),
        },
      ],
    },
    rateLimit: [
      { pathMatcher: (path) => path === EMAIL_VERIFICATION_NONCE_AUTH_PATH, window: 60, max: 30 },
      { pathMatcher: (path) => path === EMAIL_VERIFICATION_VERIFY_AUTH_PATH, window: 60, max: 10 },
    ],
  } satisfies BetterAuthPlugin
}