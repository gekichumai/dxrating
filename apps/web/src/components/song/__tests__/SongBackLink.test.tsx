import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initI18n } from '@/setup/init-i18n'
import { SongBackLink, canReturnWithinSite } from '../SongBackLink'

const router = vi.hoisted(() => ({
  canGoBack: false,
  back: vi.fn(),
  navigate: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  useCanGoBack: () => router.canGoBack,
  useRouter: () => ({ history: { back: router.back }, navigate: router.navigate }),
}))

const ORIGIN = 'https://dxrating.net'

describe('canReturnWithinSite', () => {
  it('goes back after an in-app navigation, whatever the referrer', () => {
    expect(canReturnWithinSite({ canGoBack: true, referrer: '', origin: ORIGIN, historyLength: 2 })).toBe(true)
  })

  it('goes back to a page of the site that loaded this one with a plain link', () => {
    expect(
      canReturnWithinSite({
        canGoBack: false,
        referrer: 'https://dxrating.net/plates/cho-kiwami',
        origin: ORIGIN,
        historyLength: 3,
      }),
    ).toBe(true)
  })

  it('does not go back to another site, or with no referrer', () => {
    expect(
      canReturnWithinSite({ canGoBack: false, referrer: 'https://www.google.com/', origin: ORIGIN, historyLength: 3 }),
    ).toBe(false)
    expect(canReturnWithinSite({ canGoBack: false, referrer: '', origin: ORIGIN, historyLength: 3 })).toBe(false)
  })

  it('does not trust a host that only starts with the site name', () => {
    expect(
      canReturnWithinSite({
        canGoBack: false,
        referrer: 'https://dxrating.net.example.com/',
        origin: ORIGIN,
        historyLength: 3,
      }),
    ).toBe(false)
  })

  it('does not go back in a new tab opened from the site', () => {
    expect(
      canReturnWithinSite({ canGoBack: false, referrer: `${ORIGIN}/rating`, origin: ORIGIN, historyLength: 1 }),
    ).toBe(false)
  })
})

describe('SongBackLink', () => {
  beforeAll(() => {
    initI18n()
  })

  beforeEach(() => {
    router.canGoBack = false
    router.back.mockReset()
    router.navigate.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('links to the home page, keeping the URL locale', () => {
    render(<SongBackLink search={{ locale: 'ja' }} />)

    expect(screen.getByRole('link', { name: 'Back' }).getAttribute('href')).toBe('/?locale=ja')
  })

  it('returns to the previous page after an in-app navigation', () => {
    router.canGoBack = true
    render(<SongBackLink search={{}} />)

    fireEvent.click(screen.getByRole('link', { name: 'Back' }))
    expect(router.back).toHaveBeenCalledOnce()
    expect(router.navigate).not.toHaveBeenCalled()
  })

  it('opens the home page in the app when the visitor arrived from elsewhere', () => {
    render(<SongBackLink search={{ locale: 'ja' }} />)

    fireEvent.click(screen.getByRole('link', { name: 'Back' }))
    expect(router.back).not.toHaveBeenCalled()
    expect(router.navigate).toHaveBeenCalledWith({ href: '/?locale=ja' })
  })

  it('leaves a modified click (open in a new tab) to the browser', () => {
    router.canGoBack = true
    render(<SongBackLink search={{}} />)

    fireEvent.click(screen.getByRole('link', { name: 'Back' }), { metaKey: true })
    expect(router.back).not.toHaveBeenCalled()
    expect(router.navigate).not.toHaveBeenCalled()
  })
})