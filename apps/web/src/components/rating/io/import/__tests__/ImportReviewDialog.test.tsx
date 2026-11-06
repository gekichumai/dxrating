import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n } from '@/setup/init-i18n'
import { planImport } from '@/models/scores/importPlan'
import { ImportReviewController } from '@/models/scores/importReview'
import type { PlayEntry } from '@/components/rating/RatingCalculatorAddEntryForm'
import { ImportReviewDialog, ImportReviewHost } from '../ImportReviewDialog'

const SAVE: PlayEntry[] = [
  { sheetId: 'kept', achievementRate: 100 },
  { sheetId: 'dropped', achievementRate: 99 },
  { sheetId: 'lowered', achievementRate: 100.5, comboFlag: 'ap' },
]
const IMPORTED: PlayEntry[] = [
  { sheetId: 'kept', achievementRate: 100 },
  { sheetId: 'lowered', achievementRate: 98, comboFlag: 'fc' },
  { sheetId: 'new', achievementRate: 97 },
]

const countOf = (label: string) => {
  const term = screen.getByText(label, { selector: 'dt' })
  return term.nextElementSibling?.textContent
}

describe('ImportReviewDialog', () => {
  beforeAll(() => {
    initI18n()
  })

  it('shows the counts and lists the charts that would be lowered or removed', () => {
    const plan = planImport(SAVE, IMPORTED, { source: 'lxns', mode: 'replace' })
    render(<ImportReviewDialog open plan={plan} trigger="manual" onConfirm={() => {}} onCancel={() => {}} />)

    expect(screen.getByRole('heading', { name: 'Review import from LXNS' })).toBeTruthy()
    expect(countOf('New')).toBe('1')
    expect(countOf('Unchanged')).toBe('1')
    expect(countOf('Lowered')).toBe('1')
    expect(countOf('Removed')).toBe('1')

    const risky = screen.getByRole('list')
    const rows = within(risky).getAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual(['dropped99.0000%→Removed', 'lowered100.5000% AP→98.0000% FC'])
    expect(screen.getByRole('button', { name: 'Import anyway' })).toBeTruthy()
  })

  it('says when nothing is lost, and when nothing changes', () => {
    const safe = planImport(SAVE, [...SAVE, { sheetId: 'new', achievementRate: 97 }], {
      source: 'maimai-net',
      mode: 'merge',
    })
    const { rerender } = render(
      <ImportReviewDialog open plan={safe} trigger="manual" onConfirm={() => {}} onCancel={() => {}} />,
    )
    expect(screen.getByText('No saved score gets lower and nothing is removed.')).toBeTruthy()
    expect(screen.queryByRole('list')).toBeNull()

    const same = planImport(SAVE, SAVE, { source: 'dxrating-json', mode: 'replace' })
    rerender(<ImportReviewDialog open plan={same} trigger="manual" onConfirm={() => {}} onCancel={() => {}} />)
    expect(screen.getByText('This import doesn’t change any saved score.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Import' })).toBeTruthy()
  })

  it('explains an automatic import it holds back', () => {
    const plan = planImport(SAVE, IMPORTED, { source: 'maimai-net', mode: 'replace' })
    render(<ImportReviewDialog open plan={plan} trigger="automatic" onConfirm={() => {}} onCancel={() => {}} />)
    expect(screen.getByText(/Your automatic import would lower or remove saved scores/)).toBeTruthy()
  })
})

describe('ImportReviewHost', () => {
  beforeAll(() => {
    initI18n()
  })

  it('shows the pending preview and resolves it with the visitor answer', async () => {
    const controller = new ImportReviewController()
    render(<ImportReviewHost controller={controller} />)
    expect(screen.queryByRole('dialog')).toBeNull()

    const confirmed = vi.fn()
    const plan = planImport(SAVE, IMPORTED, { source: 'lxns', mode: 'replace' })
    void controller.requestReview(plan, 'manual').then(confirmed)
    fireEvent.click(await screen.findByRole('button', { name: 'Import anyway' }))
    await vi.waitFor(() => expect(confirmed).toHaveBeenCalledWith(true))
    expect(controller.getRequest()).toBeNull()

    const cancelled = vi.fn()
    void controller.requestReview(plan, 'manual').then(cancelled)
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    await vi.waitFor(() => expect(cancelled).toHaveBeenCalledWith(false))
  })
})