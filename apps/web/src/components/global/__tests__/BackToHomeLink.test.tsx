import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initI18n } from '@/setup/init-i18n'
import { BackToHomeLink } from '../BackToHomeLink'

const back = vi.fn()
const navigate = vi.fn()
let origin: string | undefined
let canGoBack = true
let search: Record<string, unknown> = {}

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ history: { back }, navigate }),
  useCanGoBack: () => canGoBack,
  useRouterState: ({ select }: { select: (state: { location: { search: unknown } }) => unknown }) =>
    select({ location: { search } }),
}))

vi.mock('@/components/layout/navigationOrigins', () => ({
  useNavigationOrigin: () => origin,
}))

describe('BackToHomeLink', () => {
  beforeAll(() => {
    initI18n()
  })

  beforeEach(() => {
    back.mockClear()
    navigate.mockClear()
    origin = '/'
    canGoBack = true
    search = {}
  })

  it('renders nothing unless the page was reached from Home', () => {
    origin = '/versions'
    const { container } = render(<BackToHomeLink />)
    expect(container.innerHTML).toBe('')

    origin = undefined
    const second = render(<BackToHomeLink />)
    expect(second.container.innerHTML).toBe('')
  })

  it('is a real link to Home, keeping the URL locale', () => {
    search = { locale: 'ja' }
    render(<BackToHomeLink />)
    const link = screen.getByRole('link', { name: 'Back to home' })
    expect(link.getAttribute('href')).toBe('/?locale=ja')
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