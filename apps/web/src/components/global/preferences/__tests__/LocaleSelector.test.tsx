import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '@/i18n/LocaleProvider'
import { getClientLocale } from '@/i18n/runtime'
import { LocaleSelector, pushLocalizedLocation } from '../LocaleSelector'

vi.mock('@/lib/analytics', () => ({ captureAnalyticsEvent: vi.fn() }))

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(document, 'startViewTransition')
})

describe('LocaleSelector wipe', () => {
  it('closes the menu before capture and renders the new language inside the update', async () => {
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
      <LocaleProvider initialLocale="en">
        <LocaleSelector />
      </LocaleProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Select language' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '日本語' }))
    await waitFor(() => expect(snapshotLabel).toBe('言語を選択'))
    expect(start).toHaveBeenCalledOnce()
    expect(getClientLocale()).toBe('ja')
  })

  it('closes the menu without animating an unchanged language', () => {
    const start = vi.fn()
    Object.defineProperty(document, 'startViewTransition', { configurable: true, value: start })
    render(
      <LocaleProvider initialLocale="en">
        <LocaleSelector />
      </LocaleProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Select language' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'English' }))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(start).not.toHaveBeenCalled()
  })
})
describe('pushLocalizedLocation', () => {
  const history = (pathname: string, state: object) => ({
    location: { href: '', pathname, search: '?q=x', hash: '', state: { __TSR_index: 3, ...state } },
    push: vi.fn(),
  })

  it("moves the page on screen to the language's path, keeping the query", () => {
    const h = history('/ja/rating', {})
    pushLocalizedLocation(h, 'th')
    expect(h.push).toHaveBeenCalledWith('/th/rating?q=x', { __TSR_index: 3 })
    const english = history('/th/rating', {})
    pushLocalizedLocation(english, 'en')
    expect(english.push).toHaveBeenCalledWith('/rating?q=x', { __TSR_index: 3 })
  })

  it('keeps the history state, so a masked chart dialog and the search under it stay open', () => {
    const tempLocation = { pathname: '/', search: '?q=x&songId=dsng_x' }
    const h = history('/songs/dsng_x/dx/master', { __tempLocation: tempLocation })
    pushLocalizedLocation(h, 'ja')
    expect(h.push).toHaveBeenCalledWith(
      '/ja/songs/dsng_x/dx/master?q=x',
      expect.objectContaining({ __tempLocation: tempLocation }),
    )
  })
})