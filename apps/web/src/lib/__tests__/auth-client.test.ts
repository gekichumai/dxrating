import { LOCALE_HEADER } from '@gekichumai/api-contract'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

// The setup file replaces the auth client for every other test; this one checks the real one
vi.unmock('@/lib/auth-client')

const fetchSpy = vi.fn(
  async (_input: RequestInfo | URL, _init?: RequestInit) =>
    new Response(JSON.stringify({ code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    }),
)

let authClient: (typeof import('../auth-client'))['authClient']

beforeAll(async () => {
  // The client keeps the fetch it was created with
  vi.stubGlobal('fetch', fetchSpy)
  ;({ authClient } = await import('../auth-client'))
})

afterEach(() => {
  fetchSpy.mockClear()
  window.history.replaceState(null, '', '/')
})

const sentLocale = () => {
  const init = fetchSpy.mock.calls.at(-1)?.[1]
  return new Headers(init?.headers).get(LOCALE_HEADER)
}

describe('authClient', () => {
  it.each([
    ['/ja/account/security', 'ja'],
    ['/ko/account/security', 'ko'],
    ['/zh-hant/account/security', 'zh-Hant'],
    ['/my', 'my'],
    ['/account/security', 'en'],
  ])('names the language of %s on its requests', async (path, locale) => {
    window.history.replaceState(null, '', path)
    await authClient.signIn.email({ email: 'player@example.com', password: 'wrong-password' })
    expect(fetchSpy).toHaveBeenCalled()
    expect(sentLocale()).toBe(locale)
  })

  it('follows the page after an in-place language switch, not the language it loaded in', async () => {
    window.history.replaceState(null, '', '/ja/account/security')
    await authClient.signIn.email({ email: 'player@example.com', password: 'wrong-password' })
    expect(sentLocale()).toBe('ja')

    window.history.replaceState(null, '', '/zh-hans/account/security')
    await authClient.signIn.email({ email: 'player@example.com', password: 'wrong-password' })
    expect(sentLocale()).toBe('zh-Hans')
  })
})