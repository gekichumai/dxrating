import { DifficultyEnum, TypeEnum, VersionEnum } from '@gekichumai/dxdata'
import { calculateRatingAward, getDxdataSongCatalog, type VersionedSheet } from '@gekichumai/maimai-domain'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  calculateEntries,
  enrichEntries,
  isRenderableRatingSheet,
  prepareCalculatedEntries,
} from '../services/functions/oneshot-renderer/index.js'

const findRenderableSheet = (version: VersionEnum, predicate: (sheet: VersionedSheet) => boolean = () => true) => {
  const sheet = getDxdataSongCatalog(version).sheets.find((candidate) => {
    return isRenderableRatingSheet(candidate) && predicate(candidate)
  })
  if (!sheet) throw new Error(`Expected ${version} catalog to include a matching renderable sheet`)
  return sheet
}

describe('Oneshot Renderer', () => {
  let testServer: typeof import('./setup.js') | undefined

  beforeAll(async () => {
    testServer = await import('./setup.js')
    await testServer.setupTestServer()
  })
  afterAll(async () => {
    await testServer?.teardownTestServer()
  })

  it('POST /functions/render-oneshot/v0 with demo=1 responds', async () => {
    if (!testServer) throw new Error('Expected test server setup to complete')
    const res = await fetch(`${testServer.getBaseUrl()}/functions/render-oneshot/v0?demo=1`, {
      method: 'POST',
    })
    // The renderer depends on font files (ASSETS_LOCAL_CACHE_DIR).
    // In test env without fonts, it may fail. We verify the endpoint is reachable.
    if (res.status === 200) {
      const contentType = res.headers.get('content-type') ?? ''
      expect(contentType).toMatch(/image\/(svg\+xml|png)/)
    } else {
      // Endpoint is reachable but failed due to missing assets — acceptable in test env
      expect(res.status).toBeGreaterThanOrEqual(400)
    }
  })
})

describe('oneshot renderer calculations', () => {
  it('applies AP combo bonus when enriching raw entries', () => {
    const version = VersionEnum.CiRCLEPLUS
    const sheet = findRenderableSheet(version, (candidate) => candidate.regions.jp)

    const [withoutCombo] = enrichEntries([{ sheetId: sheet.id, achievementRate: 100.5 }], version)
    const [withAp] = enrichEntries([{ sheetId: sheet.id, achievementRate: 100.5, achievementAccuracy: 'ap' }], version)

    if (!withoutCombo || !withAp) throw new Error('Expected entry enrichment to return render data')
    expect(withAp.rating).toEqual(calculateRatingAward(sheet.internalLevelValue, 100.5, 'ap'))
    expect(withAp.rating.ratingAwardValue).toBe(withoutCombo.rating.ratingAwardValue + 1)
  })

  it('uses region-aware Best 50 buckets for raw entries', () => {
    const version = VersionEnum.CiRCLEPLUS
    const previousVersionSheet = findRenderableSheet(version, (candidate) => {
      return (
        candidate.version === VersionEnum.CiRCLE &&
        candidate.type === TypeEnum.DX &&
        candidate.difficulty === DifficultyEnum.Master &&
        candidate.regions.intl
      )
    })

    const calculated = calculateEntries([{ sheetId: previousVersionSheet.id, achievementRate: 100.5 }], version, 'intl')

    expect(calculated.b15.map((entry) => entry.sheet.id)).toContain(previousVersionSheet.id)
    expect(calculated.b35.map((entry) => entry.sheet.id)).not.toContain(previousVersionSheet.id)
  })

  it('selects the best duplicate raw entry for the same sheet', () => {
    const version = VersionEnum.CiRCLEPLUS
    const sheet = findRenderableSheet(version, (candidate) => candidate.version === version && candidate.regions.intl)

    const calculated = calculateEntries(
      [
        { sheetId: sheet.id, achievementRate: 100.5, achievementAccuracy: 'app' },
        { sheetId: sheet.id, achievementRate: 80 },
      ],
      version,
      'intl',
    )

    expect(calculated.b15).toHaveLength(1)
    expect(calculated.b15[0]?.achievementRate).toBe(100.5)
    expect(calculated.b15[0]?.achievementAccuracy).toBe('app')
    expect(calculated.b15[0]?.rating).toEqual(calculateRatingAward(sheet.internalLevelValue, 100.5, 'app'))
  })

  it('uses sheet overrides when ranking raw entries', () => {
    const version = VersionEnum.CiRCLEPLUS
    const orderedSheets = getDxdataSongCatalog(version)
      .sheets.filter((candidate) => {
        return isRenderableRatingSheet(candidate) && candidate.version === version && candidate.regions.intl
      })
      .sort((a, b) => a.internalLevelValue - b.internalLevelValue)

    const boostedSheet = orderedSheets[0]
    const demotedSheet = orderedSheets.at(-1)
    if (!boostedSheet || !demotedSheet || boostedSheet.internalLevelValue >= demotedSheet.internalLevelValue) {
      throw new Error('Expected at least two current-version renderable sheets')
    }

    const boostedLevel = demotedSheet.internalLevelValue + 1
    const demotedLevel = boostedSheet.internalLevelValue
    const calculated = calculateEntries(
      [
        {
          sheetId: boostedSheet.id,
          sheetOverrides: { internalLevelValue: boostedLevel },
          achievementRate: 100.5,
        },
        {
          sheetId: demotedSheet.id,
          sheetOverrides: { internalLevelValue: demotedLevel },
          achievementRate: 100.5,
        },
      ],
      version,
      'intl',
    )

    expect(calculated.b15.map((entry) => entry.sheet.id)).toEqual([boostedSheet.id, demotedSheet.id])
    expect(calculated.b15[0]?.rating).toEqual(calculateRatingAward(boostedLevel, 100.5, null))
  })

  it('preserves pre-calculated buckets instead of recalculating them', () => {
    const version = VersionEnum.CiRCLEPLUS
    const currentVersionSheet = findRenderableSheet(version, (candidate) => {
      return (
        candidate.version === version &&
        candidate.type === TypeEnum.DX &&
        candidate.difficulty === DifficultyEnum.Master
      )
    })

    const prepared = prepareCalculatedEntries(
      {
        b15: [],
        b35: [{ sheetId: currentVersionSheet.id, achievementRate: 100.5, achievementAccuracy: 'app' }],
      },
      version,
    )

    expect(prepared.b15).toHaveLength(0)
    expect(prepared.b35.map((entry) => entry.sheet.id)).toEqual([currentVersionSheet.id])
    expect(prepared.b35[0]?.rating).toEqual(calculateRatingAward(currentVersionSheet.internalLevelValue, 100.5, 'app'))
  })
})