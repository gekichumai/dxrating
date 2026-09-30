import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n } from '@/setup/init-i18n'
import { SheetFilterSection } from '../filters/SheetFilterSection'

describe('SheetFilterSection accessibility', () => {
  beforeAll(() => initI18n())

  it('exposes distinct native reset buttons without requiring hover', () => {
    const resetCategory = vi.fn()
    const resetDifficulty = vi.fn()
    render(
      <>
        <SheetFilterSection titleLeft="Category" reset={resetCategory}>
          Categories
        </SheetFilterSection>
        <SheetFilterSection titleLeft="Difficulty" reset={resetDifficulty}>
          Difficulties
        </SheetFilterSection>
      </>,
    )

    const categoryReset = screen.getByRole('button', { name: 'Reset Category' })
    const difficultyReset = screen.getByRole('button', { name: 'Reset Difficulty' })
    expect(categoryReset.tagName).toBe('BUTTON')
    expect(categoryReset.tabIndex).toBe(0)
    categoryReset.focus()
    expect(document.activeElement).toBe(categoryReset)
    fireEvent.click(categoryReset)
    expect(resetCategory).toHaveBeenCalledOnce()
    expect(resetDifficulty).not.toHaveBeenCalled()
    fireEvent.click(difficultyReset)
    expect(resetDifficulty).toHaveBeenCalledOnce()
  })
})