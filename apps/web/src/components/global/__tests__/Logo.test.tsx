import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Logo } from '../Logo'

describe('Logo', () => {
  it('links the site name back to the home page', () => {
    render(<Logo />)

    const logo = screen.getByRole('link', { name: 'DXRating.net' })

    expect(logo.getAttribute('href')).toBe('/')
    expect(logo.className).toBe('text-lg font-bold text-black/70 leading-none')
  })
})