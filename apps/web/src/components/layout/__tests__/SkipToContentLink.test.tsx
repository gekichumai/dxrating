import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SkipToContentLink } from '../SkipToContentLink'

describe('SkipToContentLink', () => {
  it('moves focus to the main content without following the fragment (no history entry)', () => {
    render(
      <>
        <SkipToContentLink>Skip to content</SkipToContentLink>
        <main id="main-content" tabIndex={-1} />
      </>,
    )
    const link = screen.getByRole('link', { name: 'Skip to content' })
    expect(link.getAttribute('href')).toBe('#main-content')

    const followed = fireEvent.click(link)

    expect(followed).toBe(false)
    expect(document.activeElement?.id).toBe('main-content')
  })
})