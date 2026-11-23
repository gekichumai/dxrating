import { sql } from 'drizzle-orm'
import { relations } from 'drizzle-orm/_relations'
import { pgTable, text, timestamp, boolean, integer, index, check } from 'drizzle-orm/pg-core'

/**
 * How an address came to be verified (`user.email_verification_method`, gekichumai/meta#80):
 *
 * - `oauth`: an OAuth provider (Google, GitHub, Apple) said the address is verified, at sign-up or on a later sign-in
 * - `email_link`: the user followed a verification link or code mailed to the address
 * - `email_verification_protocol`: the browser proved control of the address (Chrome's Email Verification Protocol)
 * - `admin`: an operator marked it verified by hand
 * - `unknown`: verified before this column existed and not attributable to a linked OAuth account (Supabase-era
 *   confirmations, or OAuth sign-ups that later unlinked their provider), or written by a path that names no method
 */
export const EMAIL_VERIFICATION_METHODS = [
  'oauth',
  'email_link',
  'email_verification_protocol',
  'admin',
  'unknown',
] as const
export type EmailVerificationMethod = (typeof EMAIL_VERIFICATION_METHODS)[number]

export const user = pgTable(
  'user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').default(false).notNull(),
    /** When the current address was first verified; null while it is unverified */
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    emailVerificationMethod: text('email_verification_method', { enum: EMAIL_VERIFICATION_METHODS }),
    image: text('image'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    check(
      'user_email_verification_method_check',
      sql`${table.emailVerificationMethod} IN ('oauth', 'email_link', 'email_verification_protocol', 'admin', 'unknown')`,
    ),
    // The timestamp and the method are recorded together, and only for a verified address. A verified address may
    // briefly have neither: Better Auth writes `email_verified` first and the update hook records the rest after it.
    check(
      'user_email_verification_record_check',
      sql`(${table.emailVerifiedAt} IS NULL) = (${table.emailVerificationMethod} IS NULL) AND (${table.emailVerified} OR ${table.emailVerifiedAt} IS NULL)`,
    ),
  ],
)

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [index('session_userId_idx').on(table.userId)],
)

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index('account_userId_idx').on(table.userId)],
)

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
)

export const passkey = pgTable(
  'passkey',
  {
    id: text('id').primaryKey(),
    name: text('name'),
    publicKey: text('public_key').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    credentialID: text('credential_id').notNull(),
    counter: integer('counter').notNull(),
    deviceType: text('device_type').notNull(),
    backedUp: boolean('backed_up').notNull(),
    transports: text('transports'),
    createdAt: timestamp('created_at'),
    aaguid: text('aaguid'),
  },
  (table) => [index('passkey_userId_idx').on(table.userId), index('passkey_credentialID_idx').on(table.credentialID)],
)

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  passkeys: many(passkey),
}))

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}))

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}))

export const passkeyRelations = relations(passkey, ({ one }) => ({
  user: one(user, {
    fields: [passkey.userId],
    references: [user.id],
  }),
}))