import { ORPCError } from '@orpc/client'
import { render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initI18n } from '@/setup/init-i18n'

const mocks = vi.hoisted(() => ({ complete: vi.fn(), navigate: vi.fn() }))

vi.mock('@/lib/orpc', () => ({ apiClient: { lxns: { complete: mocks.complete } } }))
vi.mock('@tanstack/react-router', () => ({
  // InternalLink: no router in these tests, so links render as plain anchors
  useRouter: () => undefined,
  useNavigate: () => mocks.navigate,
}))

import { LxnsOauthCallback } from '../LxnsOauthCallback'

const open = (search: string) => {
  window.history.replaceState(null, '', `/io/import/lxns/oauth_callback${search}`)
  return render(
    <StrictMode>
      <LxnsOauthCallback />
    </StrictMode>,
  )
}

describe('LxnsOauthCallback', () => {
  beforeAll(() => {
    initI18n()
  })

  beforeEach(() => {
    mocks.complete.mockReset()
    mocks.navigate.mockReset()
  })

  it('completes the forwarded code and state once and drops them from the URL', async () => {
    mocks.complete.mockResolvedValue({ success: true })
    open('?code=synthetic-code&state=synthetic-state')

    expect(await screen.findByText('LXNS connected')).toBeTruthy()
    expect(mocks.complete).toHaveBeenCalledTimes(1)
    expect(mocks.complete).toHaveBeenCalledWith({ code: 'synthetic-code', state: 'synthetic-state' })
    expect(window.location.search).toBe('')
  })

  it.each([
    ['session_mismatch', 'FORBIDDEN', 'started from a different DXRating account'],
    ['not_signed_in', 'UNAUTHORIZED', 'Sign in to DXRating to finish connecting LXNS'],
  ])('explains %s', async (reason, code, text) => {
    mocks.complete.mockRejectedValue(new ORPCError(code, { data: { reason } }))
    open('?code=synthetic-code&state=synthetic-state')

    expect(await screen.findByText('LXNS not connected')).toBeTruthy()
    expect(screen.getByText((content) => content.includes(text))).toBeTruthy()
  })

  it('keeps showing provider errors without calling the API', async () => {
    open('?status=error&error=access_denied')

    expect(await screen.findByText('LXNS not connected')).toBeTruthy()
    expect(mocks.complete).not.toHaveBeenCalled()
  })
})