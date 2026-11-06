import { catalogSnapshot } from '@gekichumai/dxdata/snapshot'
import { buildSongCatalog, calculateBest50 } from '@gekichumai/maimai-domain'
import { act, render } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { buildCatalogSlice, toCatalogMeta } from '@/catalog/catalogSource'
import { CatalogSliceProvider } from '@/catalog/CatalogContext'
import { setLoadedCatalogDocumentForTests } from '@/catalog/clientCatalog'
import type { PlayEntry } from '@/components/rating/RatingCalculatorAddEntryForm'
import { RatingCalculatorContext } from '@/models/context/RatingCalculatorContext'
import { toRatingEntries } from '@/models/userRecords'
import { initI18n } from '@/setup/init-i18n'
import { computeSongHubRaises } from '../songHubRaise'
import { SongChartsTable } from '../SongChartsTable'

vi.mock('@tanstack/react-router', () => ({
  // InternalLink: no router in these tests, so links render as plain anchors
  useRouter: () => undefined,
  Link: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <a href="/" className={className}>
      {children}
    </a>
  ),
  useSearch: () => ({}),
}))
vi.mock('@/models/context/useAppContext', () => ({
  useAppContextDXDataVersion: () => 'PRiSM',
  useAppContext: () => ({ region: 'jp' }),
}))

const version = 'PRiSM' as never
const catalog = buildSongCatalog(catalogSnapshot, version)

describe('SongChartsTable rating hints', () => {
  beforeAll(() => {
    initI18n()
  })
  afterAll(() => {
    setLoadedCatalogDocumentForTests(catalogSnapshot)
  })

  it('shows no hint from the route slice alone while scores on other songs are not resolvable', async () => {
    const old = catalog.sheets.filter((s) => s.isRatingEligible && s.serverIds.includes('jp') && s.version === 'FiNALE')
    const top = [...old].sort((a, b) => b.internalLevelValue - a.internalLevelValue).slice(0, 35)
    const viewed = old.find((s) => s.internalLevelValue < 11 && !top.some((t) => t.songId === s.songId))!
    const song = catalogSnapshot.songs.find((s) => s.id === viewed.songId)!
    const entries: PlayEntry[] = top.map((s) => ({ sheetId: s.id, achievementRate: 100.5 }))
    setLoadedCatalogDocumentForTests(null)
    const sheets = song.sheets.map((s) => catalog.getById(s.id)!) as never
    const { container } = render(
      <CatalogSliceProvider slice={buildCatalogSlice(toCatalogMeta(catalogSnapshot), [song])}>
        <RatingCalculatorContext.Provider value={{ entries, modifyEntries: {} as never }}>
          <SongChartsTable songId={song.id} sheets={sheets} />
        </RatingCalculatorContext.Provider>
      </CatalogSliceProvider>,
    )
    await act(async () => {})
    expect(container.textContent).not.toMatch(/for \+\d+ rating/)
    await act(async () => {
      setLoadedCatalogDocumentForTests(catalogSnapshot)
    })
    // With the complete catalog the full B35 leaves the low chart without a reachable gain
    expect(container.querySelector('table')).toBeTruthy()
    expect(container.textContent).not.toMatch(/for \+\d+ rating/)
  })
})

describe('computeSongHubRaises CN bucket hints', () => {
  it('advertises only gains a B50 recalculation confirms', () => {
    const cn = catalog.sheets.filter(
      (s) => s.isRatingEligible && s.serverIds.includes('cn') && s.difficulty === 'master',
    )
    // Old charts by version, B15 by the imported hint
    const hinted = [...cn.filter((s) => s.version === 'FiNALE')]
      .sort((a, b) => b.internalLevelValue - a.internalLevelValue)
      .slice(0, 15)
    const entries: PlayEntry[] = hinted.map((s) => ({
      sheetId: s.id,
      achievementRate: 100.5,
      providerConfig: { divingFish: { ratingEligibility: 'b15' } },
    }))
    const candidate = catalog.sheets.find(
      (s) => s.version === 'PRiSM' && s.serverIds.includes('cn') && s.isRatingEligible && s.internalLevelValue <= 10.5,
    )!
    const raises = computeSongHubRaises({ songSheets: [candidate], entries, catalog, version, region: 'cn' })
    const before = calculateBest50({ catalog, version, region: 'cn', entries: toRatingEntries(entries, catalog) })
    expect(before.b15).toHaveLength(15)
    const raise = raises.get(candidate.id)
    const target = raise?.targetAchievement ?? 97
    const after = calculateBest50({
      catalog,
      version,
      region: 'cn',
      entries: toRatingEntries([...entries, { sheetId: candidate.id, achievementRate: target }], catalog),
    })
    expect(raise?.gain ?? 0).toBe(after.statistics.b50Sum - before.statistics.b50Sum)
    expect(raise).toBeUndefined()
  })
})