import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Logo } from '../Logo'

describe('Logo', () => {
  it('links the site name back to the home page', () => {
    render(<Logo />)

    expect(screen.getByRole('link', { name: 'DXRating.net' }).getAttribute('href')).toBe('/')
  })
})