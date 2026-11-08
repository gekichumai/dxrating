import { fireEvent, render, screen, within } from '@testing-library/react'
import { act, useState } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VERSION_SORT_ORDER } from '@gekichumai/dxdata'
import { SheetSortFilter, SheetSortFilterTrigger } from '../SheetSortFilter'

vi.mock('@hookform/devtools', () => ({
  DevTool: () => null,
}))

describe('SheetSortFilter', () => {
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
    expect(trigger.getAttribute('class')).toContain('MuiButton-root')
    expect(trigger.getAttribute('aria-controls')).toBe(contentId)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(within(trigger).getByText('Filter')).toBeTruthy()
    expect(within(trigger).getByText('Sort')).toBeTruthy()
    const icons = trigger.querySelectorAll('svg')
    expect(icons).toHaveLength(2)
    expect(icons[1]?.getAttribute('class')).not.toContain('rotate-180')
    expect(screen.queryByText('Reset all')).toBeNull()

    fireEvent.click(trigger)

    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(icons[1]?.getAttribute('class')).toContain('rotate-180')
    const panel = document.getElementById(contentId)
    expect(panel).not.toBeNull()
    expect(panel?.getAttribute('class')).toContain('transition-[opacity,transform,filter]')
    expect(panel?.closest('.MuiCollapse-root')).not.toBeNull()
    expect(screen.getByText('Reset all')).toBeTruthy()
    expect(screen.queryByText('Filter & Sort')).toBeNull()
  })

  it('uses latest uncontrolled expansion state for rapid toggles', () => {
    const onExpandedChange = vi.fn()
    render(<SheetSortFilter onExpandedChange={onExpandedChange} />)

    const trigger = screen.getByRole('button', { name: 'Filter & Sort' })

    act(() => {
      trigger.click()
      trigger.click()
    })

    expect(onExpandedChange).toHaveBeenNthCalledWith(1, true)
    expect(onExpandedChange).toHaveBeenNthCalledWith(2, false)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })
})
describe('countActiveSortFilters', () => {
  it('counts each filter group and the sort that differ from the defaults', async () => {
    const { countActiveSortFilters, getDefaultSheetSortFilterForm } = await import('../SheetSortFilter')
    const form = getDefaultSheetSortFilterForm()
    expect(countActiveSortFilters(form)).toBe(0)
    expect(countActiveSortFilters(undefined)).toBe(0)

    form.filters.favoritesOnly = true
    form.filters.difficulties = form.filters.difficulties.slice(0, 2)
    form.filters.internalLevelValue = { min: 13, max: 15 }
    expect(countActiveSortFilters(form)).toBe(3)

    form.sorts = [{ descriptor: 'internalLevelValue', direction: 'desc' }]
    expect(countActiveSortFilters(form)).toBe(4)

    // The same members in another order are still the defaults
    form.filters.categories = [...getDefaultSheetSortFilterForm().filters.categories].reverse()
    expect(countActiveSortFilters(form)).toBe(4)
  })
})

describe('SheetSortFilterTrigger active count', () => {
  it('shows how many filters are active and says so in its name', () => {
    render(
      <SheetSortFilterTrigger variant="compact" expanded={false} contentId="x" onToggle={() => {}} activeCount={2} />,
    )
    const button = screen.getByRole('button')
    expect(button.getAttribute('aria-label')).toMatch(/2 active/)
    expect(button.textContent).toContain('2')
  })

  it('shows no count with the defaults', () => {
    render(<SheetSortFilterTrigger variant="compact" expanded={false} contentId="x" onToggle={() => {}} />)
    expect(screen.getByRole('button').getAttribute('aria-label')).not.toMatch(/active/)
  })
})

describe('sort and filter persistence', () => {
  it('keeps the choice in sessionStorage without an expiry, and drops the old localStorage copy', async () => {
    const session = new Map<string, string>()
    const removeLocal = vi.fn()
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => session.get(k) ?? null,
        setItem: (k: string, v: string) => session.set(k, v),
        removeItem: (k: string) => session.delete(k),
      },
    })
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: removeLocal,
      },
    })
    const { getDefaultSheetSortFilterForm } = await import('../SheetSortFilter')
    const saved = getDefaultSheetSortFilterForm()
    saved.filters.favoritesOnly = true
    session.set(
      'dxrating-sheet-sort-filter',
      JSON.stringify({ version: 1, payload: saved, latestVersion: latestVersion() }),
    )

    const onChange = vi.fn()
    render(<SheetSortFilter onChange={onChange} />)
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ filters: expect.objectContaining({ favoritesOnly: true }) }),
    )
    expect(removeLocal).toHaveBeenCalledWith('dxrating-sheet-sort-filter')
  })
})

describe('sort and filter persistence across game versions', () => {
  it("drops a tab's saved filters from a build that knew an older latest version", async () => {
    const session = new Map<string, string>()
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => session.get(k) ?? null,
        setItem: (k: string, v: string) => session.set(k, v),
        removeItem: (k: string) => session.delete(k),
      },
    })
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() },
    })
    const { getDefaultSheetSortFilterForm } = await import('../SheetSortFilter')
    const saved = getDefaultSheetSortFilterForm()
    saved.filters.favoritesOnly = true
    const older = VERSION_SORT_ORDER[VERSION_SORT_ORDER.length - 2]
    session.set('dxrating-sheet-sort-filter', JSON.stringify({ version: 1, payload: saved, latestVersion: older }))

    const onChange = vi.fn()
    render(<SheetSortFilter onChange={onChange} />)
    expect(onChange).not.toHaveBeenCalledWith(
      expect.objectContaining({ filters: expect.objectContaining({ favoritesOnly: true }) }),
    )
    expect(session.has('dxrating-sheet-sort-filter')).toBe(false)
  })
})

const latestVersion = () => {
  // The newest version the build knows: an unchanged one keeps the saved filters
  return VERSION_SORT_ORDER[VERSION_SORT_ORDER.length - 1]!
}