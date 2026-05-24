import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initI18n } from '@/setup/init-i18n'
import { SheetSortFilter, SheetSortFilterTrigger } from '../SheetSortFilter'

vi.mock('@hookform/devtools', () => ({
  DevTool: () => null,
}))

describe('SheetSortFilter', () => {
  beforeAll(() => {
    initI18n()
  })

  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn(() => null),
        removeItem: vi.fn(),
        setItem: vi.fn(),
      },
    })
  })

  it('does not read localStorage during render', () => {
    const originalLocalStorage = window.localStorage
    const getItem = vi.fn(() => null)
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem,
        removeItem: vi.fn(),
        setItem: vi.fn(),
      },
    })

    try {
      renderToString(<SheetSortFilter />)

      expect(getItem).not.toHaveBeenCalled()
    } finally {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: originalLocalStorage,
      })
    }
  })

  it('allows a compact external trigger to expand the filter panel', () => {
    const contentId = 'sheet-sort-filter-content'
    const Harness = () => {
      const [expanded, setExpanded] = useState(false)

      return (
        <>
          <SheetSortFilterTrigger
            variant="compact"
            expanded={expanded}
            contentId={contentId}
            onToggle={() => setExpanded((current) => !current)}
          />
          <SheetSortFilter expanded={expanded} contentId={contentId} showDefaultTrigger={false} />
        </>
      )
    }

    render(<Harness />)

    const trigger = screen.getByRole('button', { name: 'Filter & Sort' })
    expect(trigger.getAttribute('aria-controls')).toBe(contentId)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(within(trigger).getByText('Filter')).toBeTruthy()
    expect(within(trigger).getByText('Sort')).toBeTruthy()
    const icons = trigger.querySelectorAll('svg')
    expect(icons).toHaveLength(2)
    expect(icons[1]?.getAttribute('class')).not.toContain('rotate-180')
    expect(screen.queryByText('Reset All')).toBeNull()

    fireEvent.click(trigger)

    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(icons[1]?.getAttribute('class')).toContain('rotate-180')
    expect(screen.getByText('Reset All')).toBeTruthy()
    expect(screen.queryByText('Filter & Sort')).toBeNull()
  })
})