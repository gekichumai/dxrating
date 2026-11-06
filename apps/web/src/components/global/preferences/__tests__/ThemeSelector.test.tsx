import { Experimental_CssVarsProvider as CssVarsProvider } from '@mui/material/styles'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '@/i18n/LocaleProvider'
import { THEME_ATTRIBUTE, THEME_MODE_STORAGE_KEY } from '@/setup/theme-script'
import { DisplayPreferencesMenu, ThemeSelector } from '../ThemeSelector'

vi.mock('@/lib/analytics', () => ({ captureAnalyticsEvent: vi.fn() }))

const Providers = ({ children }: { children: ReactNode }) => (
  <CssVarsProvider attribute={THEME_ATTRIBUTE} modeStorageKey={THEME_MODE_STORAGE_KEY} defaultMode="system">
    <LocaleProvider initialLocale="en">{children}</LocaleProvider>
  </CssVarsProvider>
)

const focused = () => document.activeElement as HTMLElement

describe('appearance menus with the keyboard', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => document.documentElement.removeAttribute(THEME_ATTRIBUTE))

  it('focuses the current choice on open, moves with the arrow keys and selects with Enter', () => {
    render(<ThemeSelector />, { wrapper: Providers })
    fireEvent.click(screen.getByRole('button', { name: 'settings:theme.select' }))

    // Nothing remembered: "system" is current and receives focus
    expect(focused().getAttribute('role')).toBe('menuitemradio')
    expect(focused().textContent).toContain('settings:theme.system')

    fireEvent.keyDown(focused(), { key: 'ArrowUp' })
    expect(focused().textContent).toContain('settings:theme.dark')

    act(() => {
      fireEvent.keyDown(focused(), { key: 'Enter' })
    })
    expect(localStorage.getItem(THEME_MODE_STORAGE_KEY)).toBe('dark')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('lets the combined phone menu reach both language and appearance choices', () => {
    render(<DisplayPreferencesMenu />, { wrapper: Providers })
    fireEvent.click(screen.getByRole('button', { name: 'settings:display-preferences.select' }))

    // Focus lands on an item, not on the popover paper
    expect(focused().getAttribute('role')).toMatch(/^menuitem/)

    const reached = new Set<string>()
    for (let i = 0; i < 10; i++) {
      reached.add(focused().textContent ?? '')
      fireEvent.keyDown(focused(), { key: 'ArrowDown' })
    }
    expect([...reached].some((text) => text.includes('English'))).toBe(true)
    expect([...reached].some((text) => text.includes('settings:theme.light'))).toBe(true)
    // Subheaders are skipped
    expect([...reached].some((text) => text === 'settings:language.select')).toBe(false)
  })
})