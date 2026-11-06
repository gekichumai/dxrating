import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { THEME_ATTRIBUTE, THEME_INLINE_SCRIPT, THEME_MODE_STORAGE_KEY } from '../theme-script'

function runScript() {
  // The script runs as an inline <script> in the document head; evaluate it the same way
  new Function(THEME_INLINE_SCRIPT)()
  return document.documentElement.getAttribute(THEME_ATTRIBUTE)
}

function mockSystemDark(dark: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: dark && query === '(prefers-color-scheme: dark)', media: query })),
  )
}

describe('pre-paint theme script', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute(THEME_ATTRIBUTE)
    localStorage.clear()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('follows the OS when nothing is remembered', () => {
    mockSystemDark(true)
    expect(runScript()).toBe('dark')
    mockSystemDark(false)
    expect(runScript()).toBe('light')
  })

  it('follows the OS for the remembered "system" choice', () => {
    localStorage.setItem(THEME_MODE_STORAGE_KEY, 'system')
    mockSystemDark(true)
    expect(runScript()).toBe('dark')
  })

  it('applies a remembered light or dark choice over the OS preference', () => {
    mockSystemDark(true)
    localStorage.setItem(THEME_MODE_STORAGE_KEY, 'light')
    expect(runScript()).toBe('light')
    mockSystemDark(false)
    localStorage.setItem(THEME_MODE_STORAGE_KEY, 'dark')
    expect(runScript()).toBe('dark')
  })

  it('falls back to the OS when storage is unavailable', () => {
    mockSystemDark(true)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(runScript()).toBe('dark')
  })

  it('cannot close its own script element', () => {
    expect(THEME_INLINE_SCRIPT).not.toMatch(/<\/script/i)
  })
})