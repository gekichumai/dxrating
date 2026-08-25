import { ADMIN_ACCESS_TEST_BYPASS_HEADER } from '../admin/access-verifier.js'

const configuredTestAdminAccessBypassSecret = process.env.ADMIN_ACCESS_TEST_BYPASS_SECRET
if (!configuredTestAdminAccessBypassSecret) {
  throw new Error('ADMIN_ACCESS_TEST_BYPASS_SECRET must be configured for administrator HTTP tests')
}

export const TEST_ADMIN_ACCESS_BYPASS_SECRET = configuredTestAdminAccessBypassSecret

export const TEST_ADMIN_ACCESS_HEADERS = {
  [ADMIN_ACCESS_TEST_BYPASS_HEADER]: TEST_ADMIN_ACCESS_BYPASS_SECRET,
} as const