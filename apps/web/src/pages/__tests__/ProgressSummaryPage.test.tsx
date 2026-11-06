import { catalogSnapshot } from '@gekichumai/dxdata/snapshot'
import { act, render, screen } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { CatalogSliceProvider } from '@/catalog/CatalogContext'
import { setLoadedCatalogDocumentForTests } from '@/catalog/clientCatalog'
import type { PlayEntry } from '@/components/rating/RatingCalculatorAddEntryForm'
import { RatingCalculatorContext } from '@/models/context/RatingCalculatorContext'
import { initI18n } from '@/setup/init-i18n'
import { buildDxStarRows, ProgressSummaryPage } from '../ProgressSummaryPage'

vi.mock('@tanstack/react-router', () => ({
  // InternalLink: no router in these tests, so links render as plain anchors
  useRouter: () => undefined,
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

  it('counts DX score stars per level from the best DX score, cumulatively', () => {
    const max = sheet.noteCounts.total! * 3
    const records = new Map([[sheetId, { best: { dxScore: Math.ceil((max * 93) / 100) } }]])
    const row = buildDxStarRows(
      catalogSnapshot.songs.flatMap((song) =>
        song.sheets.map((s) => ({ ...s, songId: song.id, title: song.title }) as never),
      ),
      records,
    ).find((r) => r.level === sheet.level)!
    expect(row.withDxScore).toBe(1)
    expect(row.atLeast).toEqual([1, 1, 1, 0, 0])
    expect(row.averagePercent).toBeGreaterThanOrEqual(93)
    expect(row.averagePercent).toBeLessThan(93.1)
  })

  it('averages the exact DX score shares, truncating only the mean', () => {
    const sheets = [
      { id: 'a', level: '13', type: 'dx', internalLevelValue: 13.0, serverIds: ['jp'], noteCounts: { total: 1000 } },
      { id: 'b', level: '13', type: 'dx', internalLevelValue: 13.0, serverIds: ['jp'], noteCounts: { total: 1000 } },
    ] as never
    const records = new Map([
      ['a', { best: { dxScore: 2815 } }],
      ['b', { best: { dxScore: 2816 } }],
    ])
    expect(buildDxStarRows(sheets, records).find((r) => r.level === '13')!.averagePercent).toBe(93.85)
  })

  it('keeps an exact share on its boundary despite float error', () => {
    const sheets = [
      { id: 'a', level: '10+', type: 'dx', internalLevelValue: 10.7, serverIds: ['jp'], noteCounts: { total: 375 } },
    ] as never
    const records = new Map([['a', { best: { dxScore: 1071 } }]])
    expect(buildDxStarRows(sheets, records).find((r) => r.level === '10+')!.averagePercent).toBe(95.2)
  })
})