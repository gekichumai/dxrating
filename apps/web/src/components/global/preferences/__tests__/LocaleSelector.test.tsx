import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createServerI18n } from '@/setup/init-i18n'
import { LocaleSelector } from '../LocaleSelector'

vi.mock('@/lib/analytics', () => ({ captureAnalyticsEvent: vi.fn() }))

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(document, 'startViewTransition')
})

describe('LocaleSelector wipe', () => {
  it('closes the menu before capture and renders the new language inside the update', async () => {
    const i18n = createServerI18n('en')
    let snapshotLabel: string | null = null
    const start = vi.fn((update: () => void | Promise<void>) => {
      expect(screen.queryByRole('menu')).toBeNull()
      const done = Promise.resolve().then(async () => {
        await update()
        snapshotLabel = screen.getByRole('button').getAttribute('aria-label')
      })
      return { ready: done, updateCallbackDone: done, finished: done, skipTransition: vi.fn() }
    })
    Object.defineProperty(document, 'startViewTransition', { configurable: true, value: start })
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList)
    render(
      <I18nextProvider i18n={i18n}>
        <LocaleSelector />
      </I18nextProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Select language' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '日本語' }))
    await waitFor(() => expect(snapshotLabel).toBe('言語を選択'))
    expect(start).toHaveBeenCalledOnce()
    expect(i18n.language).toBe('ja')
  })

  it('closes the menu without animating an unchanged language', () => {
    const start = vi.fn()
    Object.defineProperty(document, 'startViewTransition', { configurable: true, value: start })
    render(
      <I18nextProvider i18n={createServerI18n('en')}>
        <LocaleSelector />
      </I18nextProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Select language' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'English' }))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(start).not.toHaveBeenCalled()
  })
})