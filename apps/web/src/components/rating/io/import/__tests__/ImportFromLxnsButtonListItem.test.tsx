import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MenuList } from '@mui/material'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n } from '@/setup/init-i18n'
import { ImportFromLxnsButtonListItem } from '../ImportFromLxnsButtonListItem'

const { auth } = vi.hoisted(() => ({
  auth: {
    isAuthenticated: false,
    openLoginDialog: vi.fn(),
    LoginDialog: () => <div role="dialog" aria-label="Sign in" />,
  },
}))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }))

beforeAll(() => initI18n())
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const renderItem = () =>
  render(
    <MenuList>
      <ImportFromLxnsButtonListItem onClose={() => {}} />
    </MenuList>,
  )

describe('LXNS import menu item', () => {
  it('signed out, says how to use it and opens sign-in instead of being disabled', () => {
    auth.isAuthenticated = false
    renderItem()
    const item = screen.getByRole('menuitem', { name: /LXNS/ })
    expect(item.getAttribute('aria-disabled')).not.toBe('true')
    expect(item.textContent).toContain('Sign in to connect LXNS')
    fireEvent.click(item)
    expect(auth.openLoginDialog).toHaveBeenCalledOnce()
  })

  it('signed in, opens the LXNS import dialog', () => {
    auth.isAuthenticated = true
    renderItem()
    fireEvent.click(screen.getByRole('menuitem', { name: /LXNS/ }))
    expect(auth.openLoginDialog).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeTruthy()
  })
})