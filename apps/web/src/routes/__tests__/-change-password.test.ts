import { describe, expect, it } from 'vitest'
import { createChangePasswordRedirect } from '../[.]well-known/change-password'

describe('change password well-known URL', () => {
  it('temporarily redirects to the account security page', () => {
    const response = createChangePasswordRedirect(new Request('https://dxrating.net/.well-known/change-password'))

    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe('https://dxrating.net/account/security')
  })

  it('keeps the redirect on the incoming origin', () => {
    const response = createChangePasswordRedirect(
      new Request('https://preview.dxrating.pages.dev/.well-known/change-password'),
    )

    expect(response.headers.get('Location')).toBe('https://preview.dxrating.pages.dev/account/security')
  })
})