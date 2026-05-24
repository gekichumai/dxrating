import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n } from '@/setup/init-i18n'
import { About } from '../About'

vi.mock('posthog-js/react', () => ({
  usePostHog: () => null,
}))

vi.mock('../../ResponsiveDialog', () => ({
  ResponsiveDialog: ({ children }: { children: () => ReactNode }) => <>{children()}</>,
}))

describe('About', () => {
  beforeAll(() => {
    initI18n()
  })

  it('passes the displayed version name into the logo alt text', () => {
    render(<About />)

    expect(screen.getByRole('img', { name: 'maimai DX BUDDiES logo' }).getAttribute('src')).toBe(
      'https://shama.dxrating.net/images/version-adornment/buddies.png',
    )
  })
})