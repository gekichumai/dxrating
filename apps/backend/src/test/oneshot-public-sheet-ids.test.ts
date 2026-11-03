import { VersionEnum } from '@gekichumai/dxdata'
import { catalogSnapshot } from '@gekichumai/dxdata/snapshot'
import { getSongCatalog } from '@gekichumai/maimai-domain'
import { describe, expect, it } from 'vitest'
import { calculateEntries, enrichEntries } from '../services/functions/oneshot-renderer/index'

// 君の知らない物語 DX MASTER, by public sheet ID and by the legacy sheet ID clients from before public IDs send
const PUBLIC_SHEET_ID = 'dsht_e5nsvt8k2a'
const LEGACY_SHEET_ID = '君の知らない物語__dxrt__dx__dxrt__master'
const catalog = getSongCatalog(catalogSnapshot, VersionEnum.CiRCLE)

describe('oneshot sheet IDs', () => {
  it('renders public sheet IDs', () => {
    const [entry] = enrichEntries([{ sheetId: PUBLIC_SHEET_ID, achievementRate: 100.5 }], catalog)

    expect(entry?.sheet.title).toBe('君の知らない物語')
    expect(entry?.sheetId).toBe(PUBLIC_SHEET_ID)
  })

  it('renders legacy sheet IDs as the sheet they name, under its public ID', () => {
    const [entry] = enrichEntries([{ sheetId: LEGACY_SHEET_ID, achievementRate: 100.5 }], catalog)

    expect(entry?.sheetId).toBe(PUBLIC_SHEET_ID)
    expect(entry?.sheet.id).toBe(PUBLIC_SHEET_ID)
  })

  it('counts a sheet sent under both IDs once', () => {
    const calculated = calculateEntries(
      [
        { sheetId: LEGACY_SHEET_ID, achievementRate: 99 },
        { sheetId: PUBLIC_SHEET_ID, achievementRate: 100.5 },
      ],
      catalog,
      // the song is no longer playable on any server; the generic region rates it regardless
      '_generic',
    )

    expect([...calculated.b15, ...calculated.b35].map((entry) => entry.achievementRate)).toEqual([100.5])
  })

  it('skips sheet IDs no sheet has', () => {
    expect(enrichEntries([{ sheetId: 'dsht_zzzzzzzzzz', achievementRate: 100 }], catalog)).toEqual([])
    expect(enrichEntries([{ sheetId: 'no such song__dxrt__dx__dxrt__master', achievementRate: 100 }], catalog)).toEqual(
      [],
    )
  })
})