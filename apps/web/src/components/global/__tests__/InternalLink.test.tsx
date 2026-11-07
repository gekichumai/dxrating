import { Button } from '@mui/material'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NAVIGATION_FEEDBACK_DELAY_MS } from '@/components/layout/NavigationProgress'
import { InternalLink, LinkBehavior, isClientRoutableHref, placeLinkSpinner } from '../InternalLink'

const navigate = vi.fn()
const router: { navigate: typeof navigate; subscribe: typeof subscribe; latestLocation?: { pathname: string } } = {
  navigate,
  subscribe: (...args: Parameters<typeof subscribe>) => subscribe(...args),
}
const routerListeners = new Map<string, Set<(event: { toLocation: { pathname: string } }) => void>>()
const subscribe = (type: string, listener: (event: { toLocation: { pathname: string } }) => void) => {
  const set = routerListeners.get(type) ?? new Set()
  set.add(listener)
  routerListeners.set(type, set)
  return () => set.delete(listener)
}
const emitRouter = (type: string, pathname: string) => {
  for (const listener of routerListeners.get(type) ?? []) listener({ toLocation: { pathname } })
}

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => router,
  useRouterState: () => false,
}))

describe('isClientRoutableHref', () => {
  it.each([
    ['/versions/magical', true],
    ['/', true],
    ['/search?q=test#top', true],
    ['/songs/Mr.%20Wonderland', true],
    ['/songs/a.b?x=1', true],
    ['//cdn.example.com/x', false],
    ['https://dxrating.net/versions', false],
    ['#section', false],
    ['mailto:a@b.c', false],
    ['/llms.txt', false],
    ['/sitemap.xml?x=1', false],
    ['/.well-known/apple-app-site-association', false],
    [undefined, false],
  ])('%s → %s', (href, expected) => {
    expect(isClientRoutableHref(href)).toBe(expected)
  })
})

/**
 * Whether the click reached the browser's default action. A bubbling window listener runs after React's handler, records
 * it, then cancels the native navigation so happy-dom doesn't try to load the page
 */
let browserNavigated: boolean | undefined
const recordAndCancel = (event: MouseEvent) => {
  browserNavigated = !event.defaultPrevented
  event.preventDefault()
}

describe('InternalLink', () => {
  beforeEach(() => {
    navigate.mockClear()
    browserNavigated = undefined
    window.addEventListener('click', recordAndCancel)
  })

  afterEach(() => {
    window.removeEventListener('click', recordAndCancel)
  })

  it('server-renders a real anchor with its href', () => {
    const html = renderToString(<InternalLink href="/versions/magical">MAGiCAL</InternalLink>)
    expect(html).toBe('<a href="/versions/magical">MAGiCAL</a>')
  })

  it('navigates through the router on a plain click, without letting the browser load the page', () => {
    render(<InternalLink href="/versions/magical?region=jp">MAGiCAL</InternalLink>)
    const link = screen.getByRole('link', { name: 'MAGiCAL' })

    fireEvent.click(link, { button: 0 })

    expect(browserNavigated).toBe(false)
    expect(navigate).toHaveBeenCalledWith({ href: '/versions/magical?region=jp' })
  })

  it.each([
    ['meta', { metaKey: true }],
    ['ctrl', { ctrlKey: true }],
    ['shift', { shiftKey: true }],
    ['alt', { altKey: true }],
    ['middle button', { button: 1 }],
  ])('leaves a %s click to the browser', (_, init) => {
    render(<InternalLink href="/versions">Versions</InternalLink>)

    fireEvent.click(screen.getByRole('link'), { button: 0, ...init })

    expect(browserNavigated).toBe(true)
    expect(navigate).not.toHaveBeenCalled()
  })

  it.each([
    ['target="_blank"', { target: '_blank', href: '/terms-of-service' }],
    ['download', { download: true, href: '/versions' }],
    ['an external URL', { href: 'https://github.com/gekichumai/dxrating' }],
    ['a server file', { href: '/llms.txt' }],
    ['a hash', { href: '#top' }],
  ])('leaves a link with %s to the browser', (_, props) => {
    render(<InternalLink {...props}>Link</InternalLink>)

    fireEvent.click(screen.getByText('Link'), { button: 0 })

    expect(browserNavigated).toBe(true)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('runs its own onClick first and respects preventDefault from it', () => {
    const onClick = vi.fn((event: { preventDefault: () => void }) => event.preventDefault())
    render(
      <InternalLink href="/versions" onClick={onClick}>
        Versions
      </InternalLink>,
    )

    fireEvent.click(screen.getByRole('link'), { button: 0 })

    expect(onClick).toHaveBeenCalledTimes(1)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('shows a spinner beside the clicked link while its navigation loads, after the feedback delay', async () => {
    vi.useFakeTimers()
    let finish!: () => void
    navigate.mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)))
    render(<InternalLink href="/versions/magical">MAGiCAL</InternalLink>)
    const link = screen.getByRole('link', { name: 'MAGiCAL' })

    fireEvent.click(link, { button: 0 })
    expect(link.getAttribute('aria-busy')).toBe('true')
    expect(screen.queryByTestId('link-pending-spinner')).toBeNull()

    await act(async () => {
      vi.advanceTimersByTime(NAVIGATION_FEEDBACK_DELAY_MS)
    })
    expect(screen.getByTestId('link-pending-spinner')).toBeTruthy()

    await act(async () => {
      finish()
    })
    expect(screen.queryByTestId('link-pending-spinner')).toBeNull()
    expect(link.hasAttribute('aria-busy')).toBe(false)
    vi.useRealTimers()
  })

  it('moves the feedback to a second link clicked before the first page loads', async () => {
    vi.useFakeTimers()
    // The router chains a replaced navigation's promise to its replacement, so neither settles until the last loads
    let finish!: () => void
    const pageLoaded = new Promise<void>((resolve) => (finish = resolve))
    navigate.mockImplementation(() => pageLoaded)
    render(
      <>
        <InternalLink href="/a">A</InternalLink>
        <InternalLink href="/b">B</InternalLink>
      </>,
    )
    const a = screen.getByRole('link', { name: 'A' })
    const b = screen.getByRole('link', { name: 'B' })

    fireEvent.click(a, { button: 0 })
    await act(async () => {
      vi.advanceTimersByTime(NAVIGATION_FEEDBACK_DELAY_MS)
    })
    expect(a.getAttribute('aria-busy')).toBe('true')

    fireEvent.click(b, { button: 0 })
    await act(async () => {
      vi.advanceTimersByTime(NAVIGATION_FEEDBACK_DELAY_MS)
    })
    expect(a.hasAttribute('aria-busy')).toBe(false)
    expect(b.getAttribute('aria-busy')).toBe('true')
    expect(screen.getAllByTestId('link-pending-spinner')).toHaveLength(1)

    await act(async () => {
      finish()
    })
    expect(screen.queryByTestId('link-pending-spinner')).toBeNull()
    navigate.mockReset()
    vi.useRealTimers()
  })

  it('clears the feedback when another navigation (a tab-bar Link, Back) heads somewhere else', async () => {
    vi.useFakeTimers()
    navigate.mockImplementation(() => new Promise<void>(() => {}))
    render(<InternalLink href="/versions/circle">CiRCLE</InternalLink>)
    const link = screen.getByRole('link', { name: 'CiRCLE' })

    fireEvent.click(link, { button: 0 })
    await act(async () => {
      vi.advanceTimersByTime(NAVIGATION_FEEDBACK_DELAY_MS)
    })
    // Its own load starting does not count
    act(() => emitRouter('onBeforeLoad', '/versions/circle'))
    expect(link.getAttribute('aria-busy')).toBe('true')

    act(() => emitRouter('onBeforeLoad', '/charts/recent'))
    expect(link.hasAttribute('aria-busy')).toBe(false)
    expect(screen.queryByTestId('link-pending-spinner')).toBeNull()
    navigate.mockReset()
    vi.useRealTimers()
  })

  it('clears the feedback when a navigation started in the same task as the click replaced it', async () => {
    vi.useFakeTimers()
    // The click's navigation, then at once a programmatic one elsewhere: its event fired before the link listened
    navigate.mockImplementation(({ href }: { href: string }) => {
      router.latestLocation = { pathname: href }
      router.latestLocation = { pathname: '/charts/recent' }
      return new Promise<void>(() => {})
    })
    render(<InternalLink href="/versions/circle">CiRCLE</InternalLink>)
    const link = screen.getByRole('link', { name: 'CiRCLE' })

    await act(async () => {
      fireEvent.click(link, { button: 0 })
    })
    await act(async () => {
      vi.advanceTimersByTime(NAVIGATION_FEEDBACK_DELAY_MS)
    })

    expect(link.hasAttribute('aria-busy')).toBe(false)
    expect(screen.queryByTestId('link-pending-spinner')).toBeNull()
    navigate.mockReset()
    router.latestLocation = undefined
    vi.useRealTimers()
  })

  it('shows no spinner for a navigation faster than the delay', async () => {
    vi.useFakeTimers()
    render(<InternalLink href="/versions">Versions</InternalLink>)

    await act(async () => {
      fireEvent.click(screen.getByRole('link'), { button: 0 })
    })
    await act(async () => {
      vi.advanceTimersByTime(NAVIGATION_FEEDBACK_DELAY_MS * 2)
    })

    expect(screen.queryByTestId('link-pending-spinner')).toBeNull()
    vi.useRealTimers()
  })

  it('routes an MUI Button href when the theme sets LinkBehavior', () => {
    const theme = createTheme({ components: { MuiButtonBase: { defaultProps: { LinkComponent: LinkBehavior } } } })
    render(
      <ThemeProvider theme={theme}>
        <Button href="/">Home</Button>
      </ThemeProvider>,
    )
    const link = screen.getByRole('link', { name: 'Home' })
    expect(link.getAttribute('href')).toBe('/')

    fireEvent.click(link, { button: 0 })

    expect(navigate).toHaveBeenCalledWith({ href: '/' })
  })
})
describe('placeLinkSpinner', () => {
  const anchorWith = (display: string, rect: { left: number; right: number; top: number; height: number }) => {
    const anchor = document.createElement('a')
    anchor.style.display = display
    document.body.append(anchor)
    const box = { ...rect, bottom: rect.top + rect.height, width: rect.right - rect.left, x: rect.left, y: rect.top }
    anchor.getBoundingClientRect = () => box as DOMRect
    anchor.getClientRects = () => [box] as unknown as DOMRectList
    return anchor
  }

  it('sits just past the end of an inline text link', () => {
    expect(placeLinkSpinner(anchorWith('inline', { left: 10, right: 100, top: 20, height: 20 }), 390)).toEqual({
      left: 106,
      top: 30,
      inset: false,
    })
  })

  it('moves inside an inline link that ends at the window edge', () => {
    expect(placeLinkSpinner(anchorWith('inline', { left: 300, right: 385, top: 20, height: 20 }), 390)).toEqual({
      left: 371,
      top: 30,
      inset: true,
    })
  })

  it('sits inside the top-right corner of a boxed link (a card, a row)', () => {
    expect(placeLinkSpinner(anchorWith('block', { left: 16, right: 374, top: 100, height: 56 }), 390)).toEqual({
      left: 352,
      top: 115,
      inset: true,
    })
  })
})