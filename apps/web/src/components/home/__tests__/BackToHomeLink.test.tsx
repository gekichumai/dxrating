import { fireEvent, render, screen } from '@testing-library/react'
import type { MouseEvent, ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initI18n } from '@/setup/init-i18n'
import { BackToHomeLink } from '../BackToHomeLink'

const router = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  canGoBack: true,
  back: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    onClick,
    children,
    ...props
  }: {
    to: string
    onClick?: (event: MouseEvent<HTMLAnchorElement>) => void
    children: ReactNode
  }) => (
    <a href={to} onClick={onClick} {...props}>
      {children}
    </a>
  ),
  useLocation: ({ select }: { select: (location: { state: Record<string, unknown> }) => unknown }) =>
    select({ state: router.state }),
  useCanGoBack: () => router.canGoBack,
  useRouter: () => ({ history: { back: router.back } }),
}))

describe('BackToHomeLink', () => {
  beforeAll(() => {
    initI18n()
  })

  beforeEach(() => {
    router.state = { fromHome: true }
    router.canGoBack = true
    router.back.mockClear()
  })

  it('is left out of the server render, which never has history state', () => {
    expect(renderToString(<BackToHomeLink />)).toBe('')
  })

  it('shows only when the page was opened from the home page', () => {
    router.state = {}
    const { container } = render(<BackToHomeLink />)
    expect(container.innerHTML).toBe('')
  })

  it('goes back in history, so the home page keeps its scroll position', () => {
    render(<BackToHomeLink />)
    const link = screen.getByRole('link', { name: 'Back to Home' })
    expect(link.getAttribute('href')).toBe('/')

    fireEvent.click(link)
    expect(router.back).toHaveBeenCalledOnce()
  })

  it('leaves the link to the browser when there is no page of this app to go back to', () => {
    router.canGoBack = false
    render(<BackToHomeLink />)

    fireEvent.click(screen.getByRole('link', { name: 'Back to Home' }))
    expect(router.back).not.toHaveBeenCalled()
  })
})