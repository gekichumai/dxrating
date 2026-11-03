import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, describe, expect, it } from 'vitest'
import { buildMcpCatalog, type McpCatalog } from './catalog'
import { createMcpServer, INSTRUCTIONS, MCP_TOOL_NAMES, SERVER_NAME, serverVersion } from './server'
import {
  HIBANA,
  HIBANA_MASTER,
  LINK_A,
  publishedCatalog,
  RHYTHM_TEST,
  UMIYURI,
  UMIYURI_MASTER,
  UMIYURI_UTAGE,
} from './test-fixture'

const catalog = buildMcpCatalog('1', publishedCatalog)
const clients: Client[] = []

async function connect(data: McpCatalog | null = catalog) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await createMcpServer(data ?? undefined, 'v1.7.0').connect(serverTransport)
  const client = new Client({ name: 'test', version: '1.0.0' })
  await client.connect(clientTransport)
  clients.push(client)
  return client
}

async function call(name: string, args: Record<string, unknown>, data?: McpCatalog) {
  const client = await connect(data)
  return client.callTool({ name, arguments: args })
}

const structured = (result: Awaited<ReturnType<typeof call>>) => result.structuredContent as any
const text = (result: Awaited<ReturnType<typeof call>>) => (result.content as { text: string }[])[0].text

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()))
})

describe('MCP server', () => {
  it('names itself and tells the model how to use it', async () => {
    const client = await connect()
    expect(client.getServerVersion()).toMatchObject({ name: SERVER_NAME, title: 'DXRating', version: '1.7.0' })
    const instructions = client.getInstructions()
    expect(instructions).toBe(INSTRUCTIONS)
    expect(instructions!.length).toBeLessThanOrEqual(600)
  })

  it('lists read-only tools, each named in the instructions', async () => {
    const client = await connect()
    const { tools } = await client.listTools()
    expect(tools.map((tool) => tool.name)).toEqual([
      'search_songs',
      'get_sheet',
      'list_recent_songs',
      'calculate_rating',
      'calculate_best50',
    ])
    // the names telemetry records, else it counts a tool as other
    expect(MCP_TOOL_NAMES).toEqual(tools.map((tool) => tool.name))
    for (const tool of tools) {
      expect(INSTRUCTIONS).toContain(tool.name)
      expect(tool.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      })
      expect(tool.outputSchema).toBeDefined()
    }
  })

  it('has a semantic version, or a pre-release of 0.0.0', () => {
    expect(serverVersion('v1.7.0')).toBe('1.7.0')
    expect(serverVersion(undefined)).toBe('0.0.0-dev')
    expect(serverVersion('unknown')).toBe('0.0.0-dev')
  })

  it('answers that the data is loading before a catalog is loaded', async () => {
    const client = await connect(null)
    const result = await client.callTool({ name: 'search_songs', arguments: { query: 'umiyuri' } })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('still loading')
  })

  describe('search_songs', () => {
    it('finds songs with their charts and credits the data', async () => {
      const result = await call('search_songs', { query: '海底谭' })
      expect(result.isError).toBeFalsy()
      const content = structured(result)
      expect(content.songs.map((song: { songId: string }) => song.songId)).toEqual([UMIYURI, UMIYURI_UTAGE])
      expect(content.songs[0]).toMatchObject({
        title: 'ウミユリ海底譚',
        matched: { kind: 'alias', text: '海底谭' },
        sheets: [
          { sheetId: UMIYURI_MASTER, type: 'std', difficulty: 'master', level: '13', internalLevel: 13.4 },
          { type: 'std', difficulty: 'expert' },
        ],
      })
      expect(content.dataAsOf).toBe(publishedCatalog.updatedAt)
      expect(content.source.license).toBe('CC BY-NC 4.0')
      // clients that read text only get the same
      expect(JSON.parse(text(result))).toEqual(content)
    })

    it('filters by chart type and limits', async () => {
      const utage = structured(await call('search_songs', { query: 'ウミユリ', type: 'utage' }))
      expect(utage.songs.map((song: { songId: string }) => song.songId)).toEqual([UMIYURI_UTAGE])

      const limited = structured(await call('search_songs', { query: 'ウミユリ', limit: 1 }))
      expect(limited).toMatchObject({ total: 2, truncated: true })
      expect(limited.songs).toHaveLength(1)
    })

    it('rejects arguments out of the schema', async () => {
      const result = await call('search_songs', { query: 'x', limit: 500 })
      expect(result.isError).toBe(true)
    })
  })

  describe('get_sheet', () => {
    it('details a song and its charts, with tags in the language asked for', async () => {
      const content = structured(await call('get_sheet', { song: UMIYURI, lang: 'zh-Hans' }))
      expect(content.song).toMatchObject({
        songId: UMIYURI,
        title: 'ウミユリ海底譚',
        aliases: ['海底谭'],
        coverUrl: 'https://shama.dxrating.net/images/cover/v2/e05e2a6f.jpg',
      })
      expect(content.sheets).toHaveLength(2)
      expect(content.sheets[0]).toMatchObject({
        sheetId: UMIYURI_MASTER,
        internalLevel: 13.4,
        internalLevelByVersion: { BUDDiES: 13.4, 'maimaiでらっくす PLUS': 12.8 },
        noteDesigner: 'はっぴー',
        releaseDate: '2015-05-14',
        tags: [{ id: 1, name: '错位', group: '配置' }],
      })
      expect(content.sheets[1].tags).toEqual([])
    })

    it('takes a sheet ID, a name, and filters', async () => {
      const bySheet = structured(await call('get_sheet', { song: UMIYURI_MASTER }))
      expect(bySheet.sheets.map((sheet: { sheetId: string }) => sheet.sheetId)).toEqual([UMIYURI_MASTER])

      const byName = structured(await call('get_sheet', { song: 'ヒバナ', difficulty: 'Re:MAS' }))
      expect(byName.song.songId).toBe(HIBANA)
      expect(byName.sheets).toMatchObject([{ difficulty: 'remaster', internalLevel: 13.8 }])

      const utage = structured(await call('get_sheet', { song: UMIYURI_UTAGE, difficulty: '【習】' }))
      expect(utage.sheets).toMatchObject([{ difficulty: '【習】', comment: 'ウミユリ練習譚' }])
    })

    it('applies the level of a server', async () => {
      const all = structured(await call('get_sheet', { song: HIBANA, difficulty: 'master' }))
      expect(all.sheets[0]).toMatchObject({ sheetId: HIBANA_MASTER, level: '12+', internalLevel: 12.9 })
      expect(all.sheets[0].serverOverrides).toEqual({ intl: { level: '13', levelValue: 13.0 } })

      const intl = structured(await call('get_sheet', { song: HIBANA, difficulty: 'master', server: 'INTL' }))
      expect(intl.server).toBe('intl')
      expect(intl.sheets[0]).toMatchObject({ level: '13', internalLevel: 13.0 })
      expect(intl.sheets[0].serverOverrides).toBeUndefined()
    })

    it('says what is wrong with an argument', async () => {
      const ambiguous = await call('get_sheet', { song: 'Link' })
      expect(ambiguous.isError).toBe(true)
      expect(text(ambiguous)).toContain(LINK_A)

      const unknown = await call('get_sheet', { song: 'no such song' })
      expect(text(unknown)).toContain('search_songs')

      const server = await call('get_sheet', { song: HIBANA, server: 'eu' })
      expect(text(server)).toContain('jp, intl, usa, cn')

      const difficulty = await call('get_sheet', { song: HIBANA, difficulty: 'extreme' })
      expect(difficulty.isError).toBe(true)

      const notOnServer = await call('get_sheet', { song: RHYTHM_TEST, server: 'jp' })
      expect(text(notOnServer)).toContain('std basic (intl/usa)')
    })
  })
})