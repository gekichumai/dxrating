import { vi } from 'vitest'

// Tests render as an anonymous visitor, so nothing calls the auth server and the score repository is the local
// save. Tests of auth flows mock the client themselves; tests of cloud saves provide `ActiveSaveDependenciesContext`.
vi.mock('@/lib/auth-client', () => ({
  authClient: { useSession: () => ({ data: null, isPending: false }) },
}))