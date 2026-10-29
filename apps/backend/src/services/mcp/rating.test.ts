import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, describe, expect, it } from 'vitest'
import { buildMcpCatalog } from './catalog'
import { minAchievementFor, RANK_THRESHOLDS, ratingOf } from './rating'
import { createMcpServer } from './server'
import { HIBANA, HIBANA_MASTER, publishedCatalog, UMIYURI, UMIYURI_MASTER, UMIYURI_UTAGE } from './test-fixture'

const catalog = buildMcpCatalog('1', publishedCatalog)
const clients: Client[] = []

async function call(name: string, args: Record<string, unknown>) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await createMcpServer(catalog, 'v1.7.0').connect(serverTransport)
  const client = new Client({ name: 'test', version: '1.0.0' })
  await client.connect(clientTransport)
  clients.push(client)
  return client.callTool({ name, arguments: args })
}

type Result = Awaited<ReturnType<typeof call>>
const structured = (result: Result) => result.structuredContent as any
const text = (result: Result) => (result.content as { text: string }[])[0].text

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()))
})

describe('ratings', () => {
  it('rates an achievement in 1/10000 of a percent', () => {
    expect(ratingOf(15, 1_005_000)).toEqual({ rating: 337, rank: 'SSS+', coefficient: 22.4 })
    // above SSS+ the rating does not grow
    expect(ratingOf(15, 1_010_000).rating).toBe(337)
    expect(ratingOf(13.4, 1_004_999)).toMatchObject({ rank: 'SSS', rating: 298 })
    expect(ratingOf(13.4, 1_005_000, 'ap').rating).toBe(ratingOf(13.4, 1_005_000).rating + 1)
  })

  it('has the threshold of each rank from A up', () => {
    expect(RANK_THRESHOLDS.map((t) => t.rank)).toEqual(['A', 'AA', 'AAA', 'S', 'S+', 'SS', 'SS+', 'SSS', 'SSS+'])
    expect(RANK_THRESHOLDS.at(-1)).toEqual({ rank: 'SSS+', achievement: 1_005_000 })
  })

  it('finds the lowest achievement of a rating', () => {
    const achievement = minAchievementFor(13.4, 290)!
    expect(ratingOf(13.4, achievement).rating).toBeGreaterThanOrEqual(290)
    expect(ratingOf(13.4, achievement - 1).rating).toBeLessThan(290)
    // no achievement between SSS and SSS+ gives 299: SSS+ is the lowest that does
    expect(minAchievementFor(13.4, 299)).toBe(1_005_000)
    expect(minAchievementFor(13.4, 400)).toBeNull()
  })
})

describe('calculate_rating', () => {
  it('rates a chart by its sheet ID with its current internal level', async () => {
    const content = structured(await call('calculate_rating', { song: UMIYURI_MASTER, achievement: 1_007_543 }))
    expect(content.chart).toMatchObject({ sheetId: UMIYURI_MASTER, songId: UMIYURI, level: '13' })
    expect(content.internalLevel).toBe(13.4)
    expect(content.result).toEqual({ achievement: 1_007_543, combo: null, ...ratingOf(13.4, 1_007_543) })
    expect(content.thresholds.map((t: { rank: string }) => t.rank)).toEqual(['S', 'S+', 'SS', 'SS+', 'SSS', 'SSS+'])
  })

  it('uses the internal level of the server', async () => {
    const intl = structured(await call('calculate_rating', { song: HIBANA, difficulty: 'master', server: 'intl' }))
    expect(intl).toMatchObject({ server: 'intl', internalLevel: 13.0, chart: { sheetId: HIBANA_MASTER, level: '13' } })
    const jp = structured(await call('calculate_rating', { song: HIBANA_MASTER }))
    expect(jp).toMatchObject({ server: 'jp', internalLevel: 12.9 })
  })

  it('takes an internal level, and finds the achievement of a target rating', async () => {
    const content = structured(await call('calculate_rating', { internal_level: 13.4, target_rating: 290 }))
    expect(content).toMatchObject({ chart: null, result: null })
    expect(content.target).toEqual({ rating: 290, minAchievement: minAchievementFor(13.4, 290) })
  })

  it('says what is wrong with the chart', async () => {
    expect(text(await call('calculate_rating', { song: HIBANA }))).toContain('several charts')
    expect(text(await call('calculate_rating', { song: UMIYURI_UTAGE }))).toContain('utage')
    expect(text(await call('calculate_rating', { achievement: 1_000_000 }))).toContain('internal_level')
    // a decimal achievement is refused by the schema
    expect((await call('calculate_rating', { internal_level: 13, achievement: 100.5 })).isError).toBe(true)
  })
})

describe('calculate_best50', () => {
  it('splits scores into b15 and b35, keeps the best of a chart, and lists what is not counted', async () => {
    const content = structured(
      await call('calculate_best50', {
        scores: [
          { song: UMIYURI_MASTER, achievement: 1_005_000 },
          { song: UMIYURI_MASTER, achievement: 990_000 },
          { song: HIBANA, difficulty: 'remaster', achievement: 1_000_000, combo: 'ap' },
          { song: HIBANA, achievement: 990_000 },
          { song: UMIYURI_UTAGE, achievement: 1_000_000 },
          { song: 'no such song', achievement: 1_000_000 },
        ],
      }),
    )
    expect(content).toMatchObject({ server: 'jp', version: 'PRiSM' })
    expect(content.b15.entries.map((e: { difficulty: string }) => e.difficulty)).toEqual(['remaster'])
    expect(content.b15.entries[0]).toMatchObject({
      rank: 'SSS',
      combo: 'ap',
      rating: ratingOf(13.8, 1_000_000, 'ap').rating,
    })
    expect(content.b35).toMatchObject({ count: 1, min: ratingOf(13.4, 1_005_000).rating })
    expect(content.b35.entries[0]).toMatchObject({ sheetId: UMIYURI_MASTER, achievement: 1_005_000 })
    expect(content.rating).toBe(content.b15.total + content.b35.total)
    expect(content.unmatched.map((u: { index: number }) => u.index)).toEqual([3, 4, 5])
  })

  it('suggests the next rank that raises the rating', async () => {
    const content = structured(
      await call('calculate_best50', { scores: [{ song: HIBANA_MASTER, achievement: 995_000 }] }),
    )
    expect(content.suggestions[0]).toMatchObject({
      sheetId: HIBANA_MASTER,
      achievement: 995_000,
      targetRank: 'SSS',
      targetAchievement: 1_000_000,
      ratingGain: ratingOf(12.9, 1_000_000).rating - ratingOf(12.9, 995_000).rating,
    })
  })

  it('takes the version of the new 15', async () => {
    const content = structured(
      await call('calculate_best50', {
        scores: [{ song: HIBANA_MASTER, achievement: 1_000_000 }],
        version: 'PRiSM PLUS',
      }),
    )
    expect(content.b15.count).toBe(0)
    expect(content.b35.count).toBe(1)
    expect(
      (await call('calculate_best50', { scores: [{ song: HIBANA_MASTER, achievement: 1 }], version: 'X' })).isError,
    ).toBe(true)
  })
})