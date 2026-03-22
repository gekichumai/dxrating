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