import { createHash } from 'node:crypto'
import { toV2Community } from '@gekichumai/dxdata/v2'
import { Data, Effect, Exit } from 'effect'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import {
  COMMUNITY_CDN_CACHE_CONTROL,
  COMMUNITY_REUSE_MS,
  createCommunityOverlayHandler,
  DXDATA_V2_COMMUNITY_CACHE_TAG,
  DXDATA_V2_COMMUNITY_PATH,
  readListsThrough,
  type CommunityLists,
} from './dxdata-v2-community'

class ListsError extends Data.TaggedError('ListsError')<{ readonly message: string }> {}

const lists: CommunityLists = {
  tags: {
    tagGroups: [{ id: 1, localized_name: { en: 'Patterns' }, color: '#7dd3fc' }],
    tags: [{ id: 3, localized_name: { en: 'Spinning' }, localized_description: { en: '…' }, group_id: 1 }],
    tagSongs: [
      { song_id: 'dsng_a', sheet_id: 'dsht_a', sheet_type: 'dx', sheet_difficulty: 'master', tag_id: 3 },
      // A vote score, as the tag list may carry one, never reaches the overlay
      {
        song_id: 'dsng_a',
        sheet_id: 'dsht_b',
        sheet_type: 'std',
        sheet_difficulty: 'expert',
        tag_id: 3,
        score: 2,
      } as never,
    ],
  },
  aliases: [
    { song_id: 'dsng_a', name: 'alias' },
    { song_id: 'dsng_a', name: 'alias' },
  ],
}

const createApp = (options?: { fail?: () => boolean }) => {
  let clock = 0
  let reads = 0
  const errors: unknown[] = []
  const readLists = Effect.suspend(() => {
    reads++
    return options?.fail?.() ? Effect.fail(new ListsError({ message: 'down' })) : Effect.succeed(lists)
  })
  const handler = createCommunityOverlayHandler(
    readLists,
    (error) => void errors.push(error),
    () => clock,
  )
  const app = new Hono()
  app.on(['GET', 'HEAD'], DXDATA_V2_COMMUNITY_PATH, (context) => Effect.runPromise(handler(context)))
  return {
    app,
    errors,
    reads: () => reads,
    advance: (ms: number) => {
      clock += ms
    },
  }
}

describe('v2 community overlay endpoint', () => {
  it('serves the overlay of the public lists under the sha256 of its body, cacheable at the edge', async () => {
    const { app } = createApp()
    const response = await app.request(DXDATA_V2_COMMUNITY_PATH)

    expect(response.status).toBe(200)
    const text = await response.text()
    expect(JSON.parse(text)).toEqual(toV2Community(lists.tags, lists.aliases))
    expect(JSON.parse(text).aliases).toEqual({ dsng_a: ['alias'] })
    expect(text).not.toContain('score')
    expect(response.headers.get('etag')).toBe(`"${createHash('sha256').update(text).digest('hex')}"`)
    expect(response.headers.get('cache-control')).toBe('public, no-cache')
    expect(response.headers.get('cdn-cache-control')).toBe(COMMUNITY_CDN_CACHE_CONTROL)
    expect(response.headers.get('cache-tag')).toBe(DXDATA_V2_COMMUNITY_CACHE_TAG)
  })

  it('answers a matching validator with a 304 and HEAD without a body', async () => {
    const { app } = createApp()
    const etag = (await app.request(DXDATA_V2_COMMUNITY_PATH)).headers.get('etag')!

    const revalidated = await app.request(DXDATA_V2_COMMUNITY_PATH, { headers: { 'If-None-Match': etag } })
    expect(revalidated.status).toBe(304)
    expect(revalidated.headers.get('cdn-cache-control')).toBe(COMMUNITY_CDN_CACHE_CONTROL)

    const head = await app.request(DXDATA_V2_COMMUNITY_PATH, { method: 'HEAD' })
    expect(head.status).toBe(200)
    expect(await head.text()).toBe('')
    expect(head.headers.get('etag')).toBe(etag)
  })

  it('reads the lists again only after the reuse window', async () => {
    const { app, reads, advance } = createApp()
    for (let i = 0; i < 3; i++) await (await app.request(DXDATA_V2_COMMUNITY_PATH)).arrayBuffer()
    expect(reads()).toBe(1)

    advance(COMMUNITY_REUSE_MS)
    await (await app.request(DXDATA_V2_COMMUNITY_PATH)).arrayBuffer()
    expect(reads()).toBe(2)
  })

  it('answers an uncached 503 when the lists cannot be read, and tries again on the next request', async () => {
    let failing = true
    const { app, errors, reads } = createApp({ fail: () => failing })
    const failed = await app.request(DXDATA_V2_COMMUNITY_PATH)
    expect(failed.status).toBe(503)
    expect(failed.headers.get('cache-control')).toBe('no-store')
    expect(failed.headers.get('cdn-cache-control')).toBe('no-store')
    expect(errors).toHaveLength(1)

    failing = false
    expect((await app.request(DXDATA_V2_COMMUNITY_PATH)).status).toBe(200)
    expect(reads()).toBe(2)
  })
})

describe('reading the public lists through the app', () => {
  it('reads both lists with public IDs', async () => {
    const paths: string[] = []
    const result = await Effect.runPromise(
      readListsThrough((path) => {
        paths.push(path)
        return Response.json(path.startsWith('/api/v1/tags') ? lists.tags : lists.aliases)
      }),
    )
    expect(paths.sort()).toEqual(['/api/v1/aliases?idScheme=public', '/api/v1/tags?idScheme=public'])
    expect(result).toEqual(lists)
  })

  it('fails when a list does not answer 200', async () => {
    const exit = await Effect.runPromiseExit(
      readListsThrough((path) =>
        path.startsWith('/api/v1/tags') ? Response.json({ error: 'x' }, { status: 503 }) : Response.json([]),
      ),
    )
    expect(Exit.isFailure(exit)).toBe(true)
  })
})