import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db } from './db'
import * as schema from './db/schema'
import * as authSchema from './db/auth-schema'
import { openAPI, oneTap } from 'better-auth/plugins'
import { passkey } from '@better-auth/passkey'
import { config } from './config'

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
  },
  advanced: {
    cookiePrefix: 'dxrating',
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
  plugins: [openAPI(), passkey(), oneTap()],
})
