import { catalogSnapshot } from '@gekichumai/dxdata/snapshot'
import { act, render, screen } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { CatalogSliceProvider } from '@/catalog/CatalogContext'
import { setLoadedCatalogDocumentForTests } from '@/catalog/clientCatalog'
import type { PlayEntry } from '@/components/rating/RatingCalculatorAddEntryForm'
import { RatingCalculatorContext } from '@/models/context/RatingCalculatorContext'
import { initI18n } from '@/setup/init-i18n'
import { ProgressSummaryPage } from '../ProgressSummaryPage'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, params, to }: { children: React.ReactNode; params?: { level: string }; to: string }) => (
    <a href={to.replace('$level', params?.level ?? '')}>{children}</a>
  ),
}))

vi.mock('@/models/context/useAppContext', () => ({
  useAppContextDXDataVersion: () => 'MAGiCAL',
}))

const sheetId = 'dsht_8rsgpcbmn6'
const sheet = catalogSnapshot.songs.flatMap((song) => song.sheets).find((s) => s.id === sheetId)!
// The AP / FDX were earned in a lower-scoring play than the best achievement
const entries: PlayEntry[] = [
  { sheetId, achievementRate: 100.1, comboFlag: 'fc', syncFlag: null },
  { sheetId, achievementRate: 99.9, comboFlag: 'ap', syncFlag: 'fsd' },
]

describe('ProgressSummaryPage', () => {
  beforeAll(() => {
    initI18n()
  })
  afterAll(() => {
    setLoadedCatalogDocumentForTests(catalogSnapshot)
  })

  it('waits for the complete catalog, then counts flags earned in any stored play', async () => {
    setLoadedCatalogDocumentForTests(null)
    render(
      <CatalogSliceProvider slice={null}>
        <RatingCalculatorContext.Provider value={{ entries, modifyEntries: {} as never }}>
          <ProgressSummaryPage />
        </RatingCalculatorContext.Provider>
      </CatalogSliceProvider>,
    )
    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()

    await act(async () => {
      setLoadedCatalogDocumentForTests(catalogSnapshot)
    })
    expect(screen.queryByRole('status')).toBeNull()
    const row = screen.getByRole('rowheader', { name: `Lv.${sheet.level}` }).closest('tr')!
    const cells = [...row.querySelectorAll('td')].map((cell) => cell.textContent)
    // played, then s, ss, sss, sssp, fc, ap, app, fsd
    expect(cells[0]).toMatch(/^1\/\d+$/)
    expect(cells.slice(1)).toEqual(['1', '1', '1', '0', '1', '1', '0', '1'])
  })
})