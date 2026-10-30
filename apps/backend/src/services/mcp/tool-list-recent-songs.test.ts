import { describe, expect, it } from 'vitest'
import { buildMcpCatalog, type PublishedCatalog, type PublishedSheet } from './catalog'
import { runListRecentSongs } from './tool-list-recent-songs'
import { publishedCatalog } from './test-fixture'

const sheet = (id: string, overrides: Partial<PublishedSheet> = {}): PublishedSheet => ({
  id,
  type: 'dx',
  difficulty: 'master',
  level: '13',
  internalLevelValue: 13,
  noteCounts: {},
  serverIds: ['jp', 'intl', 'usa', 'cn'],
  isSpecial: false,
  version: 'PRiSM',
  ...overrides,
})
const base = { ...publishedCatalog.songs[0], searchAcronyms: [] as string[] }
const OLD = 'dsng_old2345678'
const NEW = 'dsng_new2345678'
const JP_ONLY = 'dsng_jpo2345678'
const FUTURE = 'dsng_fut2345678'
const LOCKED = 'dsng_lck2345678'
const VERSIONED = 'dsng_ver2345678'

const data: PublishedCatalog = {
  ...publishedCatalog,
  versions: [...publishedCatalog.versions, { version: 'CiRCLE', releaseDate: '2026-10-15' }],
  songs: [
    {
      ...base,
      id: OLD,
      title: 'Old song',
      sheets: [
        sheet('dsht_old0000001', { releaseDate: '2020-01-01' }),
        // a Re:MASTER added later, which jp has and intl gets with its own level
        sheet('dsht_old0000002', {
          difficulty: 'remaster',
          level: '14',
          internalLevelValue: 14.2,
          releaseDate: '2026-10-20',
          serverOverrides: { intl: { level: '14+', levelValue: 14.6, version: 'CiRCLE' } },
        }),
      ],
    },
    {
      ...base,
      id: NEW,
      title: 'New song',
      sheets: [
        sheet('dsht_new0000001', { difficulty: 'expert', level: '11', releaseDate: '2026-10-20' }),
        sheet('dsht_new0000002', { releaseDate: '2026-10-20' }),
      ],
    },
    {
      ...base,
      id: JP_ONLY,
      title: 'JP first',
      sheets: [
        sheet('dsht_jpo0000001', { serverIds: ['jp'], releaseDate: '2026-09-01' }),
        // on intl only from this date: the song is new there
        sheet('dsht_jpo0000002', { type: 'std', releaseDate: '2026-10-25' }),
      ],
    },
    { ...base, id: FUTURE, title: 'Announced', sheets: [sheet('dsht_fut0000001', { releaseDate: '2026-11-12' })] },
    {
      ...base,
      id: LOCKED,
      title: 'Locked',
      isLocked: true,
      sheets: [sheet('dsht_lck0000001', { releaseDate: '2026-10-01' })],
    },
    // no date of its own: the date of its version
    { ...base, id: VERSIONED, title: 'Versioned', sheets: [sheet('dsht_ver0000001', { version: 'CiRCLE' })] },
  ],
}
const catalog = buildMcpCatalog('1', data)
const NOW = new Date('2026-10-30T12:00:00Z')
type Result = {
  server: string | null
  since: string
  total: number
  truncated: boolean
  releases: { date: string; newSongs: any[]; newCharts: any[] }[]
}
const run = (args: Parameters<typeof runListRecentSongs>[1]) => runListRecentSongs(catalog, args, NOW)
const content = (args: Parameters<typeof runListRecentSongs>[1]) => run(args).structuredContent as Result
const ids = (songs: { songId: string }[]) => songs.map((song) => song.songId)

describe('list_recent_songs', () => {
  it('groups by date, newest first, with announced dates first and new songs apart from new charts', () => {
    const result = content({})
    expect(result).toMatchObject({ server: null, since: '2026-09-30', total: 6, truncated: false })
    expect(result.releases.map((r) => r.date)).toEqual([
      '2026-11-12',
      '2026-10-25',
      '2026-10-20',
      '2026-10-15',
      '2026-10-01',
    ])
    const oct20 = result.releases[2]
    expect(ids(oct20.newSongs)).toEqual([NEW])
    expect(oct20.newSongs[0]).toMatchObject({
      sheetIds: ['dsht_new0000001', 'dsht_new0000002'],
      title: 'New song',
      unlockRequired: false,
      sheets: [{ difficulty: 'expert', level: '11', version: 'PRiSM' }, { difficulty: 'master' }],
    })
    expect(ids(oct20.newCharts)).toEqual([OLD])
    expect(oct20.newCharts[0]).toMatchObject({
      sheetIds: ['dsht_old0000002'],
      sheets: [{ sheetId: 'dsht_old0000002', type: 'dx', difficulty: 'remaster', level: '14', internalLevel: 14.2 }],
    })
    // everywhere, JP first had a chart in September: the std chart is a new chart
    expect(ids(result.releases[1].newCharts)).toEqual([JP_ONLY])
    expect(result.releases[1].newSongs).toEqual([])
    expect(result.releases[3].newSongs[0]).toMatchObject({ songId: VERSIONED, sheetIds: ['dsht_ver0000001'] })
    expect(result.releases[4].newSongs[0]).toMatchObject({ songId: LOCKED, unlockRequired: true })
  })

  it('takes the charts, levels and first release of a server', () => {
    const intl = content({ server: 'INTL', since: '2026-10-20' })
    expect(intl.server).toBe('intl')
    const oct25 = intl.releases.find((r) => r.date === '2026-10-25')!
    expect(ids(oct25.newSongs)).toEqual([JP_ONLY])
    expect(oct25.newSongs[0].sheetIds).toEqual(['dsht_jpo0000002'])
    const oct20 = intl.releases.find((r) => r.date === '2026-10-20')!
    expect(oct20.newCharts[0].sheets[0]).toMatchObject({ level: '14+', internalLevel: 14.6, version: 'CiRCLE' })
  })

  it('takes since or days, and limits songs', () => {
    expect(content({ since: '2026-10-21' }).releases.map((r) => r.date)).toEqual(['2026-11-12', '2026-10-25'])
    expect(content({ days: 7 }).since).toBe('2026-10-23')
    expect(content({ since: '2019-01-01' }).total).toBe(8)
    const limited = content({ limit: 2 })
    expect(limited).toMatchObject({ total: 6, truncated: true })
    expect(limited.releases.map((r) => r.date)).toEqual(['2026-11-12', '2026-10-25'])
  })

  it('says what is wrong with an argument', () => {
    expect(run({ since: '2026-10-01', days: 3 }).isError).toBe(true)
    expect(run({ since: '2026-13-45' }).isError).toBe(true)
    expect(run({ since: '2026-02-30' }).isError).toBe(true)
    expect(run({ since: '2026-02-29' }).isError).toBe(true)
    expect(run({ since: '2028-02-29' }).isError).toBeFalsy()
    const server = run({ server: 'eu' })
    expect(server.isError).toBe(true)
    expect((server.content[0] as { text: string }).text).toContain('jp, intl, usa, cn')
  })
})