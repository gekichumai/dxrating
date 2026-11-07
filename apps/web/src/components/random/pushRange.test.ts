import { VERSION_SORT_ORDER, type VersionEnum } from '@gekichumai/dxdata'
import { catalogSnapshot } from '@gekichumai/dxdata/snapshot'
import {
  type Best50Result,
  buildSongCatalog,
  type CalculatedRatingEntry,
  calculateBest50,
} from '@gekichumai/maimai-domain'
import { describe, expect, it } from 'vitest'
import { buildDemoScores } from '@/fixtures/demoScores'
import { toRatingEntries } from '@/models/userRecords'
import { computePushRange } from './pushRange'

const entry = (internalLevelValue: number, ratingAwardValue: number) =>
  ({ sheet: { internalLevelValue }, rating: { ratingAwardValue } }) as unknown as CalculatedRatingEntry

const best50 = (b15: CalculatedRatingEntry[], b35: CalculatedRatingEntry[]) =>
  ({ b15, b35 }) as Pick<Best50Result, 'b15' | 'b35'>

const repeat = (count: number, make: (index: number) => CalculatedRatingEntry) =>
  Array.from({ length: count }, (_, index) => make(index))

describe('computePushRange', () => {
  it('is null without a B50', () => {
    expect(computePushRange(best50([], []))).toBeNull()
  })

  it('starts at the lowest level whose SSS+ beats the lower bucket floor, up to the hardest B50 chart', () => {
    // B35 floor 289 (13.4 at SSS); 12.8 × 22.512 = 288.2 does not beat it, 12.9 × 22.512 = 290.4 does
    const b35 = repeat(35, (index) => entry(index === 0 ? 14.6 : 13.4, index === 0 ? 300 : 289))
    const b15 = repeat(15, () => entry(14, 310))
    expect(computePushRange(best50(b15, b35))).toEqual({ min: 129, max: 146 })
  })

  it('uses only full buckets for the floor', () => {
    // B15 is not full, so its missing floor is ignored and the B35 floor of 280 decides: 12.5 × 22.512 = 281.4
    const b35 = repeat(35, () => entry(13, 280))
    expect(computePushRange(best50([entry(12, 100)], b35))?.min).toBe(125)
  })

  it('falls back to the easiest B50 chart while no bucket is full', () => {
    expect(computePushRange(best50([entry(12.3, 200)], [entry(13.1, 250), entry(11.7, 240)]))).toEqual({
      min: 117,
      max: 131,
    })
  })

  it('collapses to the low end when it passes the hardest chart, and is null when nothing can raise it', () => {
    // Floor 337: even 15.0 at SSS+ (337.68, floored to 337) does not beat it, so nothing raises the rating
    expect(
      computePushRange(
        best50(
          repeat(15, () => entry(14, 337)),
          repeat(35, () => entry(14, 337)),
        ),
      ),
    ).toBeNull()
    // Floor 330: 14.7 at SSS+ is 330 (no gain), 14.8 is 333, so the low end is 14.8, above the hardest chart (14.0)
    expect(
      computePushRange(
        best50(
          repeat(15, () => entry(14, 330)),
          repeat(35, () => entry(14, 330)),
        ),
      ),
    ).toEqual({
      min: 148,
      max: 148,
    })
  })

  it('gives a plausible band for the demo fixture', () => {
    const version = VERSION_SORT_ORDER[VERSION_SORT_ORDER.length - 1] as VersionEnum
    const catalog = buildSongCatalog(catalogSnapshot, version)
    const result = calculateBest50({
      catalog,
      version,
      region: 'jp',
      entries: toRatingEntries(buildDemoScores(catalog), catalog),
    })
    const range = computePushRange(result)!
    expect(range.min).toBeGreaterThanOrEqual(100)
    expect(range.max).toBeGreaterThanOrEqual(range.min)
    expect(range.max).toBeLessThanOrEqual(150)
  })
})