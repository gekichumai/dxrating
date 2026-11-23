import { describe, expect, it } from 'vitest'
import { calculateRatingAward } from '../best50'
import { collapsePlays, type ChartPlay } from '../collapse-plays'
import type { Best50Bucket, ComboFlag, SyncFlag } from '../types'

const COMBO_ORDER: readonly ComboFlag[] = [null, 'fc', 'fcp', 'ap', 'app']
const SYNC_ORDER: readonly SyncFlag[] = [null, 'sync', 'fs', 'fsp', 'fsd', 'fsdp']
const ACHIEVEMENTS = [97, 99.5, 100, 100.4999, 100.5, 100.8]
const BUCKETS: readonly (Best50Bucket | null)[] = [null, 'b15', 'b35']

function random(seed: number) {
  let state = seed
  return (n: number) => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n)
  }
}

function randomPlays(pick: (n: number) => number): [ChartPlay, ...ChartPlay[]] {
  const play = (): ChartPlay => ({
    achievementRate: ACHIEVEMENTS[pick(ACHIEVEMENTS.length)]!,
    comboFlag: COMBO_ORDER[pick(COMBO_ORDER.length)]!,
    syncFlag: SYNC_ORDER[pick(SYNC_ORDER.length)]!,
    dxScore: pick(3) === 0 ? null : 1000 + pick(500),
    best50Bucket: BUCKETS[pick(BUCKETS.length)]!,
  })
  return [play(), ...Array.from({ length: pick(4) }, play)]
}

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]]
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
  )
}

const strongest = <T>(order: readonly T[], values: readonly T[]) =>
  order[Math.max(...values.map((value) => order.indexOf(value)))]!

/** The hint `calculateBest50` keeps: the play carrying it with the highest rating, then achievement, then b15 */
function expectedHint(plays: readonly ChartPlay[], internalLevel: number | null): Best50Bucket | null {
  const hinted = plays.filter((play) => play.best50Bucket !== null)
  const isAp = (play: ChartPlay) => play.comboFlag === 'ap' || play.comboFlag === 'app'
  const key = (play: ChartPlay) =>
    internalLevel === null
      ? [play.achievementRate, Number(isAp(play)), Number(play.best50Bucket === 'b15')]
      : [
          calculateRatingAward(internalLevel, play.achievementRate, play.comboFlag).ratingAwardValue,
          play.achievementRate,
          Number(play.best50Bucket === 'b15'),
        ]
  const sorted = [...hinted].sort((a, b) => {
    const [ka, kb] = [key(a), key(b)]
    return kb[0]! - ka[0]! || kb[1]! - ka[1]! || kb[2]! - ka[2]!
  })
  return sorted[0]?.best50Bucket ?? null
}

describe('collapsePlays', () => {
  it('keeps each field at its best over every play and the hint calculateBest50 keeps, in any order', () => {
    const pick = random(432)
    for (let run = 0; run < 400; run++) {
      const plays = randomPlays(pick)
      const internalLevel = pick(2) === 0 ? null : 13.7
      const expected = {
        achievementRate: Math.max(...plays.map((play) => play.achievementRate)),
        comboFlag: strongest(
          COMBO_ORDER,
          plays.map((play) => play.comboFlag ?? null),
        ),
        syncFlag: strongest(
          SYNC_ORDER,
          plays.map((play) => play.syncFlag ?? null),
        ),
        dxScore: plays.some((play) => typeof play.dxScore === 'number')
          ? Math.max(...plays.flatMap((play) => (typeof play.dxScore === 'number' ? [play.dxScore] : [])))
          : null,
        best50Bucket: expectedHint(plays, internalLevel),
      }
      for (const order of permutations(plays)) {
        expect(collapsePlays(order as [ChartPlay, ...ChartPlay[]], internalLevel), JSON.stringify(order)).toEqual(
          expected,
        )
      }
    }
  })

  it('keeps an AP from a lower play next to the higher achievement of another', () => {
    const record = collapsePlays(
      [
        { achievementRate: 100.6, comboFlag: 'fc', syncFlag: null, best50Bucket: null },
        { achievementRate: 100.3, comboFlag: 'ap', syncFlag: 'fsd', dxScore: 2400, best50Bucket: null },
      ],
      null,
    )
    expect(record).toEqual({
      achievementRate: 100.6,
      comboFlag: 'ap',
      syncFlag: 'fsd',
      dxScore: 2400,
      best50Bucket: null,
    })
  })
})