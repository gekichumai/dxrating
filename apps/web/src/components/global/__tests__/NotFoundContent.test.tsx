import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'
import { initI18n } from '@/setup/init-i18n'
import { NotFoundContent } from '../NotFoundContent'

describe('NotFoundContent', () => {
  beforeAll(() => {
    initI18n()
  })

  it('shows polished not-found copy and a home link', () => {
    render(<NotFoundContent />)

    expect(screen.getByRole('heading', { name: 'Page Not Found' }).tagName).toBe('H1')
    expect(screen.getByText('This page may have moved, or the link may be outdated.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to Home' }).getAttribute('href')).toBe('/')
  })
})