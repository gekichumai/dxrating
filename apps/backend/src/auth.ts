import * as bcrypt from 'bcrypt'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db } from './db/index.js'
import * as schema from './db/schema.js'
import * as authSchema from './db/auth-schema.js'
import { openAPI, oneTap, haveIBeenPwned, captcha, lastLoginMethod } from 'better-auth/plugins'
import { passkey } from '@better-auth/passkey'
import { i18n } from '@better-auth/i18n'
import { config } from './config.js'

export const auth = betterAuth({
  database: drizzleAdapter(db, {
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
      hash: async (password) => bcrypt.hash(password, 10),
      verify: async ({ hash, password }) => bcrypt.compare(password, hash),
    },
  },
  advanced: {
    cookiePrefix: 'dxrating',
    ipAddress: {
      ipAddressHeaders: ['cf-connecting-ip'],
    },
  },
  trustedOrigins: ['https://dxrating.net', 'http://localhost:5173', 'http://localhost:5174'],
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
  },
  // Add other providers if needed
  plugins: [
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
      detection: ['header'],
      translations: {
        ja: {
          USER_NOT_FOUND: 'ユーザーが見つかりません',
          INVALID_EMAIL_OR_PASSWORD: 'メールアドレスまたはパスワードが正しくありません',
          INVALID_PASSWORD: 'パスワードが正しくありません',
          INVALID_EMAIL: 'メールアドレスが無効です',
          USER_ALREADY_EXISTS: 'このメールアドレスは既に登録されています',
          SESSION_EXPIRED: 'セッションの有効期限が切れました',
          FAILED_TO_CREATE_USER: 'ユーザーの作成に失敗しました',
          FAILED_TO_CREATE_SESSION: 'セッションの作成に失敗しました',
          FAILED_TO_UPDATE_USER: 'ユーザー情報の更新に失敗しました',
          FAILED_TO_GET_SESSION: 'セッションの取得に失敗しました',
          SOCIAL_ACCOUNT_ALREADY_LINKED: 'このソーシャルアカウントは既にリンクされています',
          PROVIDER_NOT_FOUND: 'プロバイダーが見つかりません',
          PASSWORD_TOO_SHORT: 'パスワードが短すぎます',
          PASSWORD_TOO_LONG: 'パスワードが長すぎます',
          PASSWORD_COMPROMISED: 'このパスワードは情報漏洩で流出しています。別のパスワードを使用してください',
          TOO_MANY_REQUESTS: 'リクエストが多すぎます。しばらくしてからお試しください',
        },
        'zh-Hans': {
          USER_NOT_FOUND: '用户未找到',
          INVALID_EMAIL_OR_PASSWORD: '邮箱或密码错误',
          INVALID_PASSWORD: '密码错误',
          INVALID_EMAIL: '邮箱无效',
          USER_ALREADY_EXISTS: '该邮箱已被注册',
          SESSION_EXPIRED: '会话已过期',
          FAILED_TO_CREATE_USER: '创建用户失败',
          FAILED_TO_CREATE_SESSION: '创建会话失败',
          FAILED_TO_UPDATE_USER: '更新用户信息失败',
          FAILED_TO_GET_SESSION: '获取会话失败',
          SOCIAL_ACCOUNT_ALREADY_LINKED: '该社交账号已被关联',
          PROVIDER_NOT_FOUND: '未找到提供商',
          PASSWORD_TOO_SHORT: '密码太短',
          PASSWORD_TOO_LONG: '密码太长',
          PASSWORD_COMPROMISED: '此密码已在数据泄露中曝光，请使用其他密码',
          TOO_MANY_REQUESTS: '请求过多，请稍后再试',
        },
        'zh-Hant': {
          USER_NOT_FOUND: '找不到使用者',
          INVALID_EMAIL_OR_PASSWORD: '電子信箱或密碼錯誤',
          INVALID_PASSWORD: '密碼錯誤',
          INVALID_EMAIL: '電子信箱無效',
          USER_ALREADY_EXISTS: '此電子信箱已被註冊',
          SESSION_EXPIRED: '工作階段已過期',
          FAILED_TO_CREATE_USER: '建立使用者失敗',
          FAILED_TO_CREATE_SESSION: '建立工作階段失敗',
          FAILED_TO_UPDATE_USER: '更新使用者資訊失敗',
          FAILED_TO_GET_SESSION: '取得工作階段失敗',
          SOCIAL_ACCOUNT_ALREADY_LINKED: '此社群帳號已被連結',
          PROVIDER_NOT_FOUND: '找不到提供者',
          PASSWORD_TOO_SHORT: '密碼太短',
          PASSWORD_TOO_LONG: '密碼太長',
          PASSWORD_COMPROMISED: '此密碼已在資料外洩中曝光，請使用其他密碼',
          TOO_MANY_REQUESTS: '請求過多，請稍後再試',
        },
      },
    }),
  ],
})