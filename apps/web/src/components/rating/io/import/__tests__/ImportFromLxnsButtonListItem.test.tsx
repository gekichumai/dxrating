import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Dialog, Menu, MenuList, TextField } from '@mui/material'
import { type ReactElement, useState } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n } from '@/setup/init-i18n'
import { ImportFromLxnsButtonListItem } from '../ImportFromLxnsButtonListItem'

// A sign-in dialog shaped like useAuth's: an MUI Dialog (portalled) with a focusable field
const { auth } = vi.hoisted(() => ({
  auth: {
    isAuthenticated: false,
    loginOpen: false,
    openLoginDialog: vi.fn(),
    LoginDialog: (() => null) as () => ReactElement | null,
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

  it('keeps the import menu, and so the sign-in form, open while the user tabs through sign-in', () => {
    auth.isAuthenticated = false
    auth.LoginDialog = () => (
      <Dialog open aria-label="Sign in">
        <TextField label="Email" />
        <TextField label="Password" />
      </Dialog>
    )
    const onMenuClose = vi.fn()
    const Harness = () => {
      const [anchor] = useState(() => document.body)
      return (
        <Menu open anchorEl={anchor} onClose={onMenuClose}>
          <ImportFromLxnsButtonListItem onClose={() => {}} />
        </Menu>
      )
    }
    render(<Harness />)
    const email = screen.getByLabelText('Email')
    email.focus()
    fireEvent.keyDown(email, { key: 'Tab' })
    expect(onMenuClose).not.toHaveBeenCalled()
  })
})