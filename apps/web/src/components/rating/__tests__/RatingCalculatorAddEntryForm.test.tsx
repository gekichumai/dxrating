import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const sheet = { id: 'dsht_test', title: 'System “Z”', type: 'std', difficulty: 'master', internalLevelValue: 14.4 }

vi.mock('../../../songs', () => ({
  useSheets: () => ({ data: [sheet] }),
  useSheetsSearchEngine: () => () => [sheet],
  formatSheetToString: (s: typeof sheet) => `${s.title} ${s.difficulty}`,
}))
vi.mock('../../sheet/SheetListItem', () => ({
  SheetListItemContent: ({ sheet: s }: { sheet: typeof sheet }) => <span>{s.title}</span>,
}))
vi.mock('@/models/scores/useScoreRepository', () => ({ useScoreEntries: () => [] }))
vi.mock('@/i18n/LocaleProvider', () => ({ useLocale: () => 'en' }))
// The virtualised listbox renders nothing in happy-dom; a plain list is enough to pick the option
vi.mock('react-virtuoso', () => ({
  Virtuoso: ({ data, itemContent }: { data: unknown[]; itemContent: (i: number, d: unknown) => unknown }) => (
    <div>{data.map((d, i) => itemContent(i, d) as never)}</div>
  ),
}))

const { RatingCalculatorAddEntryForm } = await import('../RatingCalculatorAddEntryForm')

const achievement = () => screen.getByLabelText(/Achievement/i) as HTMLInputElement
const errorText = () => document.querySelector('.rating-add-achievement .MuiFormHelperText-root')?.textContent ?? null

describe('RatingCalculatorAddEntryForm achievement validation', () => {
  it('does not flag the empty field on blur, after typing and clearing it, or after Add', () => {
    const onSubmit = vi.fn()
    render(<RatingCalculatorAddEntryForm onSubmit={onSubmit} />)

    fireEvent.blur(achievement())
    expect(errorText()).toBeNull()

    fireEvent.change(achievement(), { target: { value: '120' } })
    expect(errorText()).toMatch(/101/)
    fireEvent.change(achievement(), { target: { value: '' } })
    fireEvent.blur(achievement())
    expect(errorText()).toBeNull()

    // Pick the chart, enter a rate and add: the emptied field stays quiet on the next blur
    const combobox = screen.getByRole('combobox')
    fireEvent.change(combobox, { target: { value: 'system' } })
    fireEvent.click(screen.getByText('System “Z”'))
    fireEvent.change(achievement(), { target: { value: '100.5' } })
    fireEvent.submit(achievement().closest('form')!)
    expect(onSubmit).toHaveBeenCalledWith({ sheetId: 'dsht_test', achievementRate: 100.5 })
    expect(achievement().value).toBe('')
    fireEvent.blur(achievement())
    expect(errorText()).toBeNull()
  })

  it('asks for the rate when the form is submitted without one', () => {
    render(<RatingCalculatorAddEntryForm onSubmit={vi.fn()} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'system' } })
    fireEvent.click(screen.getByText('System “Z”'))
    fireEvent.submit(achievement().closest('form')!)
    expect(errorText()).toBeTruthy()
  })
})