import { randomBytes } from 'node:crypto'
import { auth } from '../auth.js'
import { config } from '../config.js'
import { adminPrimaryAuthOauthProviders } from './primary-auth-oauth.js'
import { postgresAdminPrimaryAuthStore } from './primary-auth-store.js'
import { createAdminPrimaryAuthService } from './primary-auth.js'

const betterAuthContext = auth.$context
const dummyPasswordHash = betterAuthContext.then((context) =>
  context.password.hash(randomBytes(32).toString('base64url')),
)

export const adminPrimaryAuthService = createAdminPrimaryAuthService({
  store: postgresAdminPrimaryAuthStore,
  providers: adminPrimaryAuthOauthProviders,
  verifyPassword: async (input) => (await betterAuthContext).password.verify(input),
  dummyPasswordHash,
  callbackOrigin: config.auth.url,
  trustedAdminOrigins: config.admin.trustedOrigins,
})