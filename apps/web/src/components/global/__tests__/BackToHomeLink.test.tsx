import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BackToHomeLink } from '../BackToHomeLink'

const back = vi.fn()
const navigate = vi.fn()
let origin: { pathname: string; href: string } | undefined
let canGoBack = true

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ history: { back }, navigate }),
  useCanGoBack: () => canGoBack,
}))

vi.mock('@/components/layout/navigationOrigins', () => ({
  useNavigationOrigin: () => origin,
}))

describe('BackToHomeLink', () => {
  beforeEach(() => {
    back.mockClear()
    navigate.mockClear()
    origin = { pathname: '/', href: '/' }
    canGoBack = true
  })

  it('renders nothing unless the page was reached from Home', () => {
    origin = { pathname: '/versions', href: '/versions' }
    const { container } = render(<BackToHomeLink />)
    expect(container.innerHTML).toBe('')

    origin = undefined
    const second = render(<BackToHomeLink />)
    expect(second.container.innerHTML).toBe('')
  })

  it('is a real link to the Home it came from, search included', () => {
    origin = { pathname: '/', href: '/?locale=ja&q=Can%20Do' }
    render(<BackToHomeLink />)
    const link = screen.getByRole('link', { name: 'Back to home' })
    expect(link.getAttribute('href')).toBe('/?locale=ja&q=Can%20Do')
    expect(link.textContent).toBe('Home')
  })

  it('goes back on a plain click, so Home keeps its scroll and search', () => {
    render(<BackToHomeLink />)
    fireEvent.click(screen.getByRole('link'), { button: 0 })
    expect(back).toHaveBeenCalledTimes(1)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('leaves a modified click to the browser (new tab)', () => {
    render(<BackToHomeLink />)
    const link = screen.getByRole('link')
    link.addEventListener('click', (event) => event.preventDefault())
    fireEvent.click(link, { button: 0, metaKey: true })
    expect(back).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })
})