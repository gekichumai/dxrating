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
        detection: ['cookie', 'header'],
        localeCookie: 'dxrating.locale',
        translations: {
          ja: {
            USER_NOT_FOUND: 'ユーザーが見つかりません',
            INVALID_EMAIL_OR_PASSWORD: 'メールアドレスまたはパスワードが正しくありません',
            INVALID_PASSWORD: 'パスワードが正しくありません',
            INVALID_EMAIL: 'メールアドレスの形式が正しくありません',
            USER_ALREADY_EXISTS: 'このメールアドレスは既に登録されています',
            SESSION_EXPIRED: 'セッションの有効期限が切れました。再度ログインしてください',
            FAILED_TO_CREATE_USER: 'ユーザーの作成に失敗しました',
            FAILED_TO_CREATE_SESSION: 'セッションの作成に失敗しました',
            FAILED_TO_UPDATE_USER: 'ユーザー情報の更新に失敗しました',
            FAILED_TO_GET_SESSION: 'セッション情報を取得できませんでした',
            SOCIAL_ACCOUNT_ALREADY_LINKED: 'この外部アカウントは既に連携されています',
            PROVIDER_NOT_FOUND: 'ログインプロバイダーが見つかりません',
            PASSWORD_TOO_SHORT: 'パスワードが短すぎます',
            PASSWORD_TOO_LONG: 'パスワードが長すぎます',
            PASSWORD_COMPROMISED:
              'このパスワードは過去のデータ漏洩で流出が確認されています。別のパスワードをお使いください',
            TOO_MANY_REQUESTS: 'リクエストが多すぎます。しばらく経ってから再度お試しください',
          },
          'zh-Hans': {
            USER_NOT_FOUND: '用户不存在',
            INVALID_EMAIL_OR_PASSWORD: '邮箱或密码错误',
            INVALID_PASSWORD: '密码错误',
            INVALID_EMAIL: '邮箱地址格式无效',
            USER_ALREADY_EXISTS: '该邮箱已被注册',
            SESSION_EXPIRED: '登录已过期，请重新登录',
            FAILED_TO_CREATE_USER: '用户创建失败',
            FAILED_TO_CREATE_SESSION: '会话创建失败',
            FAILED_TO_UPDATE_USER: '用户信息更新失败',
            FAILED_TO_GET_SESSION: '无法获取会话信息',
            SOCIAL_ACCOUNT_ALREADY_LINKED: '该社交账号已绑定到其他账户',
            PROVIDER_NOT_FOUND: '未找到该登录方式',
            PASSWORD_TOO_SHORT: '密码长度不足',
            PASSWORD_TOO_LONG: '密码长度超出限制',
            PASSWORD_COMPROMISED: '此密码已出现在已知的数据泄露中，请更换其他密码',
            TOO_MANY_REQUESTS: '请求过于频繁，请稍后再试',
          },
          'zh-Hant': {
            USER_NOT_FOUND: '找不到該使用者',
            INVALID_EMAIL_OR_PASSWORD: '電子信箱或密碼錯誤',
            INVALID_PASSWORD: '密碼錯誤',
            INVALID_EMAIL: '電子信箱格式無效',
            USER_ALREADY_EXISTS: '此電子信箱已被註冊',
            SESSION_EXPIRED: '登入已過期，請重新登入',
            FAILED_TO_CREATE_USER: '建立使用者失敗',
            FAILED_TO_CREATE_SESSION: '建立登入階段失敗',
            FAILED_TO_UPDATE_USER: '更新使用者資訊失敗',
            FAILED_TO_GET_SESSION: '無法取得登入資訊',
            SOCIAL_ACCOUNT_ALREADY_LINKED: '此社交帳號已綁定到其他帳戶',
            PROVIDER_NOT_FOUND: '找不到該登入方式',
            PASSWORD_TOO_SHORT: '密碼長度不足',
            PASSWORD_TOO_LONG: '密碼長度超出限制',
            PASSWORD_COMPROMISED: '此密碼已出現在已知的資料外洩中，請更換其他密碼',
            TOO_MANY_REQUESTS: '請求過於頻繁，請稍後再試',
          },
        },
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
    }
  }),
)