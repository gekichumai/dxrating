import { ADMIN_ACCESS_TEST_BYPASS_HEADER } from '../admin/access-verifier.js'

export const TEST_ADMIN_ACCESS_BYPASS_SECRET = 'dxrating-test-only-admin-access-proof-2026'

export const TEST_ADMIN_ACCESS_HEADERS = {
  [ADMIN_ACCESS_TEST_BYPASS_HEADER]: TEST_ADMIN_ACCESS_BYPASS_SECRET,
} as const