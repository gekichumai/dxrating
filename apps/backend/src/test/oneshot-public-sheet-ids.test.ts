import { VersionEnum } from '@gekichumai/dxdata'
import { describe, expect, it, vi } from 'vitest'
import {
  calculateEntries,
  translatePublicSheetIds,
  type OneshotRequest,
} from '../services/functions/oneshot-renderer/index'

const PUBLIC_SHEET_ID = 'dsht_jxnmx39rwt'
const LEGACY_SHEET_ID = 'ウミユリ海底譚__dxrt__std__dxrt__master'

const translate = vi.fn(
  async (sheetIds: readonly string[]) =>
    new Map(
      sheetIds
        .filter((sheetId) => sheetId === PUBLIC_SHEET_ID)
        .map(
          (sheetId) => [sheetId, { songId: 'ウミユリ海底譚', sheetType: 'std', sheetDifficulty: 'master' }] as const,
        ),
    ),
)

const request = (sheetIds: string[]): OneshotRequest => ({
  version: VersionEnum.CiRCLE,
  region: 'jp',
  entries: sheetIds.map((sheetId) => ({ sheetId, achievementRate: 100.5 })),
  calculatedEntries: {
    b15: [],
    b35: sheetIds.map((sheetId) => ({ sheetId, achievementRate: 100.5 })),
  },
})

describe('oneshot public sheet IDs', () => {
  it('renders public sheet IDs like the legacy sheet IDs they translate to', async () => {
    const translated = await translatePublicSheetIds(request([PUBLIC_SHEET_ID]), translate)

    expect(translated.entries?.map((entry) => entry.sheetId)).toEqual([LEGACY_SHEET_ID])
    expect(translated.calculatedEntries?.b35.map((entry) => entry.sheetId)).toEqual([LEGACY_SHEET_ID])
    expect(calculateEntries(translated.entries!, VersionEnum.CiRCLE, 'jp').b35).toHaveLength(1)
  })

  it('passes legacy sheet IDs through without a lookup', async () => {
    translate.mockClear()
    const body = request([LEGACY_SHEET_ID])

    await expect(translatePublicSheetIds(body, translate)).resolves.toBe(body)
    expect(translate).not.toHaveBeenCalled()
  })

  it('keeps public sheet IDs it cannot translate, which the renderer then skips', async () => {
    const translated = await translatePublicSheetIds(request(['dsht_zzzzzzzzzz', LEGACY_SHEET_ID]), translate)

    expect(translated.entries?.map((entry) => entry.sheetId)).toEqual(['dsht_zzzzzzzzzz', LEGACY_SHEET_ID])
    expect(calculateEntries(translated.entries!, VersionEnum.CiRCLE, 'jp').b35).toHaveLength(1)
  })
})