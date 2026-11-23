import * as bcrypt from 'bcrypt'
import { expo } from '@better-auth/expo'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { Database } from './db/index'
import { Context, Data, Effect, Layer } from 'effect'
import * as schema from './db/schema'
import * as authSchema from './db/auth-schema'
import { openAPI, oneTap, haveIBeenPwned, captcha, lastLoginMethod } from 'better-auth/plugins'
import { passkey } from '@better-auth/passkey'
import { i18n } from '@better-auth/i18n'
import { AppConfig } from './config'
import { createAppleClientSecretGenerator } from './lib/apple-client-secret'
import { revokeOAuthGrants } from './lib/oauth-revocation'
import { passkeySignUp, requireFreshSessionToAddPasskey } from './lib/passkey-sign-up'
import { AUTH_ERROR_TRANSLATIONS } from './lib/auth-error-translations'
import { detectAuthLocale } from './lib/auth-locale'
import { and, eq } from 'drizzle-orm'
class AuthenticationError extends Data.TaggedError('AuthenticationError')<{
  readonly operation: string
  readonly cause: unknown
}> {}

export const createAuth = (database: typeof Database.Service, config: typeof AppConfig.Service) => {
  const crossSubDomainCookies = config.auth.cookieDomain
    ? { enabled: true as const, domain: config.auth.cookieDomain }
    : undefined

  const appleProvider = (() => {
    const { clientId, teamId, keyId, privateKeyBase64, appBundleIdentifier } = config.auth.apple
    const values = [clientId, teamId, keyId, privateKeyBase64]
    if (values.every((value) => !value)) return undefined
    if (values.some((value) => !value)) {
      throw new Error(
        'APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, and APPLE_PRIVATE_KEY_B64 must be configured together',
      )
    }

    const generateClientSecret = createAppleClientSecretGenerator({
      clientId: clientId!,
      teamId: teamId!,
      keyId: keyId!,
      privateKeyBase64: privateKeyBase64!,
    })

    return {
      clientId: clientId!,
      appBundleIdentifier,
      get clientSecret() {
        return generateClientSecret()
      },
    }
  })()

  return betterAuth({
    database: drizzleAdapter(database.authDb, {
      provider: 'pg', // or "mysql", "sqlite"
      schema: {
        ...schema,
        ...authSchema,
      },
    }),
    secret: config.auth.secret,
    baseURL: config.auth.url,
    emailAndPassword: {
      enabled: true,
      password: {
        hash: (password) =>
          Effect.runPromise(
            Effect.tryPromise({
              try: () => bcrypt.hash(password, 10),
              catch: (cause) => new AuthenticationError({ operation: 'Hash password', cause }),
            }),
          ),
        verify: ({ hash, password }) =>
          Effect.runPromise(
            Effect.tryPromise({
              try: () => bcrypt.compare(password, hash),
              catch: (cause) => new AuthenticationError({ operation: 'Verify password', cause }),
            }),
          ),
      },
    },
    user: {
      deleteUser: {
        enabled: true,
        beforeDelete: (user) =>
          Effect.runPromise(
            Effect.gen(function* () {
              const accounts = yield* database.query('Read linked OAuth accounts', (db) =>
                db
                  .select({
                    providerId: authSchema.account.providerId,
                    accessToken: authSchema.account.accessToken,
                    refreshToken: authSchema.account.refreshToken,
                  })
                  .from(authSchema.account)
                  .where(eq(authSchema.account.userId, user.id)),
              )

              const revocationIssues = yield* revokeOAuthGrants(accounts, {
                ...(appleProvider
                  ? {
                      apple: {
                        clientId: appleProvider.clientId,
                        clientSecret: () => appleProvider.clientSecret,
                      },
                    }
                  : {}),
                ...(config.auth.github.clientId && config.auth.github.clientSecret
                  ? {
                      github: {
                        clientId: config.auth.github.clientId,
                        clientSecret: config.auth.github.clientSecret,
                      },
                    }
                  : {}),
              })

              for (const issue of revocationIssues) {
                console.warn('OAuth grant revocation issue during account deletion', issue)
              }

              yield* database.query('Delete account verification records', (db) =>
                db.delete(authSchema.verification).where(eq(authSchema.verification.value, user.id)),
              )
            }),
          ),
      },
    },
    advanced: {
      cookiePrefix: 'dxrating',
      ...(crossSubDomainCookies ? { crossSubDomainCookies } : {}),
      ipAddress: {
        ipAddressHeaders: ['cf-connecting-ip'],
      },
    },
    hooks: {
      before: requireFreshSessionToAddPasskey,
    },
    trustedOrigins: [
      'https://dxrating.net',
      'https://appleid.apple.com',
      'dxrating://',
      'http://localhost:5173',
      'http://localhost:5174',
    ],
    socialProviders: {
      google: {
        clientId: config.auth.google.clientId!,
        clientSecret: config.auth.google.clientSecret!,
        enabled: !!config.auth.google.clientId && !!config.auth.google.clientSecret,
      },
      github: {
        clientId: config.auth.github.clientId!,
        clientSecret: config.auth.github.clientSecret!,
        enabled: !!config.auth.github.clientId && !!config.auth.github.clientSecret,
      },
      ...(appleProvider ? { apple: appleProvider } : {}),
    },
    plugins: [
      expo(),
      openAPI(),
      passkey({
        rpID: config.auth.passkey.rpID,
        rpName: 'DXRating',
        origin: config.auth.passkey.origin,
        registration: passkeySignUp({ turnstileSecretKey: config.auth.turnstile.secretKey }),
      }),
      oneTap(),
      lastLoginMethod({
        cookieName: 'dxrating.last_used_login_method',
      }),
      ...(config.nodeEnv !== 'test' ? [haveIBeenPwned()] : []),
      ...(config.auth.turnstile.secretKey
        ? [
            captcha({
              provider: 'cloudflare-turnstile',
              secretKey: config.auth.turnstile.secretKey,
            }),
          ]
        : []),
      i18n({
        defaultLocale: 'en',
        // The page's language first (the web names it on every request), so a /ja/ page never shows an English error
        detection: ['callback'],
        getLocale: (ctx) => {
          const locale = detectAuthLocale(ctx.headers)
          return locale === 'en' ? null : locale
        },
        translations: AUTH_ERROR_TRANSLATIONS,
      }),
    ],
  })
}

export type BackendAuth = ReturnType<typeof createAuth>

export class Authentication extends Context.Service<
  Authentication,
  {
    readonly handle: (request: Request) => Effect.Effect<Response, AuthenticationError>
    readonly session: (
      headers: Headers,
    ) => Effect.Effect<Awaited<ReturnType<BackendAuth['api']['getSession']>>, AuthenticationError>
    /**
     * Better Auth's `session.freshAge` in seconds (0 turns the check off): a session created longer ago than this is
     * not fresh, and Better Auth answers its sensitive routes with `SESSION_NOT_FRESH`.
     */
    readonly freshAge: Effect.Effect<number, AuthenticationError>
  }
>()('dxrating/Authentication') {}

export const AuthenticationLive = Layer.effect(
  Authentication,
  Effect.gen(function* () {
    const database = yield* Database
    const config = yield* AppConfig
    const auth = yield* Effect.sync(() => createAuth(database, config))
    const normalizeUnlinkRequest = Effect.fn('Authentication.normalizeUnlinkRequest')(function* (request: Request) {
      if (request.method !== 'POST' || new URL(request.url).pathname !== '/api/auth/unlink-account') return request

      const body: unknown = yield* Effect.tryPromise({
        try: () => request.clone().json(),
        catch: () => undefined,
      }).pipe(Effect.catch(() => Effect.void))
      if (
        typeof body !== 'object' ||
        body === null ||
        !('providerId' in body) ||
        typeof body.providerId !== 'string' ||
        ('accountId' in body && typeof body.accountId !== 'string')
      ) {
        return request
      }
      const providerId = body.providerId
      const remoteAccountId = 'accountId' in body && typeof body.accountId === 'string' ? body.accountId : undefined

      // Better Auth 1.7 accepts its local account row ID. Older clients send a
      // provider and optional remote account ID; resolve only the caller's rows.
      const session = yield* Effect.tryPromise({
        try: () =>
          auth.api.getSession({
            headers: request.headers,
            query: { disableCookieCache: true, disableRefresh: true },
          }),
        catch: (cause) => new AuthenticationError({ operation: 'Read unlink account session', cause }),
      })
      const accounts = session
        ? yield* database.query('Resolve legacy linked account', (db) =>
            db
              .select({ id: authSchema.account.id })
              .from(authSchema.account)
              .where(
                and(
                  eq(authSchema.account.userId, session.user.id),
                  eq(authSchema.account.providerId, providerId),
                  remoteAccountId === undefined ? undefined : eq(authSchema.account.accountId, remoteAccountId),
                ),
              )
              .limit(1),
          )
        : []
      const headers = new Headers(request.headers)
      headers.delete('content-length')
      // A missing match still goes through Better Auth's session, origin,
      // account ownership, and last-account checks before it can mutate data.
      return new Request(request, { headers, body: JSON.stringify({ accountId: accounts[0]?.id ?? '' }) })
    })
    return {
      // Better Auth cannot cancel its database/hashing work. Keep it tracked until
      // it settles so shutdown never closes the pool under an active SDK call.
      handle: (request: Request) =>
        normalizeUnlinkRequest(request).pipe(
          Effect.flatMap((normalized) =>
            Effect.tryPromise({
              try: () => auth.handler(normalized),
              catch: (cause) => new AuthenticationError({ operation: 'Handle authentication request', cause }),
            }),
          ),
          Effect.mapError((cause) =>
            cause instanceof AuthenticationError
              ? cause
              : new AuthenticationError({ operation: 'Normalize authentication request', cause }),
          ),
          Effect.uninterruptible,
        ),
      session: (headers: Headers) =>
        Effect.tryPromise({
          try: () => auth.api.getSession({ headers }),
          catch: (cause) => new AuthenticationError({ operation: 'Read authentication session', cause }),
        }).pipe(Effect.uninterruptible),
      freshAge: Effect.tryPromise({
        try: () => auth.$context,
        catch: (cause) => new AuthenticationError({ operation: 'Read authentication context', cause }),
      }).pipe(Effect.map((context) => context.sessionConfig.freshAge)),
    }
  }),
)