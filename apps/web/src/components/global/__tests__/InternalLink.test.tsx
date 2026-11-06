import { Button } from '@mui/material'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import { fireEvent, render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InternalLink, LinkBehavior, isClientRoutableHref } from '../InternalLink'

const navigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ navigate }),
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