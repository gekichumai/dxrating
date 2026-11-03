import { DifficultyEnum, TypeEnum, VersionEnum } from '@gekichumai/dxdata'
import { LEGACY_SONG_IDS } from '@gekichumai/dxdata/legacy-song-ids'
import { catalogSnapshot } from '@gekichumai/dxdata/snapshot'
import { describe, expect, it } from 'vitest'
import {
  isLegacySheetId,
  migrateLegacySheetIds,
  migrateLegacySheetRecords,
  resolveLegacySheetId,
} from '../legacy-migration'
import { getSongCatalog } from '../song-catalog'

// Real saved data: legacy sheet IDs as the web stored them before public IDs, against the bundled snapshot
const catalog = getSongCatalog(catalogSnapshot, VersionEnum.CiRCLE)

describe('legacy sheet ID migration', () => {
  it.each([
    ['君の知らない物語__dxrt__dx__dxrt__master', 'dsht_e5nsvt8k2a'],
    // two songs are titled "Link"; their legacy IDs tell them apart
    ['Link__dxrt__std__dxrt__basic', 'dsht_mpd82wyms9'],
    ['Link (2)__dxrt__std__dxrt__basic', 'dsht_5mk3yr8gme'],
    // Utage charts the legacy catalog split into one song per difficulty
    ['[宴]Wonderland Wars　オープニング (MASTER)__dxrt__utage__dxrt__【宴】', 'dsht_7anxcysy85'],
    ['[協]青春コンプレックス（入門編）__dxrt__utage2p__dxrt__【協】', 'dsht_k48qaj6dq4'],
  ])('resolves %s', (legacySheetId, publicSheetId) => {
    expect(isLegacySheetId(legacySheetId)).toBe(true)
    expect(resolveLegacySheetId(catalog, legacySheetId, LEGACY_SONG_IDS)).toBe(publicSheetId)
  })

  it('passes public sheet IDs through and rejects other strings', () => {
    expect(isLegacySheetId('dsht_e5nsvt8k2a')).toBe(false)
    expect(resolveLegacySheetId(catalog, 'dsht_e5nsvt8k2a', LEGACY_SONG_IDS)).toBe('dsht_e5nsvt8k2a')
    expect(resolveLegacySheetId(catalog, 'not a sheet', LEGACY_SONG_IDS)).toBeNull()
  })

  it('falls back to the title for songs newer than the legacy song ID map', () => {
    expect(resolveLegacySheetId(catalog, '君の知らない物語__dxrt__dx__dxrt__master', {})).toBe('dsht_e5nsvt8k2a')
    // ambiguous titles do not fall back
    expect(resolveLegacySheetId(catalog, 'Link__dxrt__std__dxrt__basic', {})).toBeNull()
  })

  it('migrates rating entries in place, keeping order, extra fields and entries it cannot match', () => {
    const entries = [
      {
        sheetId: '君の知らない物語__dxrt__dx__dxrt__master',
        identity: { songId: '君の知らない物語', type: TypeEnum.DX, difficulty: DifficultyEnum.Master },
        achievementRate: 100.5,
        comboFlag: 'ap' as const,
      },
      { sheetId: 'retired song__dxrt__dx__dxrt__master', achievementRate: 99 },
      { sheetId: 'dsht_mpd82wyms9', achievementRate: 98 },
      { sheetId: 'Link (2)__dxrt__std__dxrt__basic', achievementRate: 97 },
    ]

    const result = migrateLegacySheetRecords(entries, catalog, LEGACY_SONG_IDS)

    expect(result.migrated).toBe(2)
    expect(result.unresolved).toBe(1)
    expect(result.records).toEqual([
      {
        sheetId: 'dsht_e5nsvt8k2a',
        identity: { songId: 'dsng_kkx38yfx4t', type: TypeEnum.DX, difficulty: DifficultyEnum.Master },
        achievementRate: 100.5,
        comboFlag: 'ap',
      },
      entries[1],
      entries[2],
      { sheetId: 'dsht_5mk3yr8gme', achievementRate: 97 },
    ])
    // the input is not modified
    expect(entries[0]!.sheetId).toBe('君の知らない物語__dxrt__dx__dxrt__master')
  })

  it('is idempotent', () => {
    const once = migrateLegacySheetRecords(
      [{ sheetId: 'Link__dxrt__std__dxrt__basic', achievementRate: 100 }],
      catalog,
      LEGACY_SONG_IDS,
    )
    const twice = migrateLegacySheetRecords(once.records, catalog, LEGACY_SONG_IDS)

    expect(twice.records).toEqual(once.records)
    expect(twice.migrated).toBe(0)
  })

  it('migrates favorite sheet IDs without duplicates', () => {
    const result = migrateLegacySheetIds(
      ['Link__dxrt__std__dxrt__basic', 'dsht_mpd82wyms9', 'retired song__dxrt__dx__dxrt__master'],
      catalog,
      LEGACY_SONG_IDS,
    )

    expect(result.records).toEqual(['dsht_mpd82wyms9', 'retired song__dxrt__dx__dxrt__master'])
    expect(result.migrated).toBe(1)
    expect(result.unresolved).toBe(1)
  })
})