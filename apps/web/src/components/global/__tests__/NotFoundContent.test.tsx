import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NotFoundContent } from '../NotFoundContent'

describe('NotFoundContent', () => {
  it('shows polished not-found copy and a home link', () => {
    render(<NotFoundContent />)

    expect(screen.getByRole('heading', { name: 'Page not found' }).tagName).toBe('H1')
    expect(screen.getByText('This page may have moved, or the link may be outdated.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to home' }).getAttribute('href')).toBe('/')
  })
})