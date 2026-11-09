import { isRedirect } from '@tanstack/react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const lookup = vi.hoisted(() => ({
  resolution: null as unknown,
}))

const song = vi.hoisted(() => ({
  id: 'dsng_hub',
  title: 'Hub Song',
  artist: 'Artist',
  bpm: 150,
  category: 'maimai',
  imageName: 'hub',
  searchAcronyms: [],
  sheets: [
    { id: 's1', type: 'std', difficulty: 'master' },
    { id: 's2', type: 'dx', difficulty: 'expert' },
  ],
}))

vi.mock('@/catalog/catalogSource', () => ({ getCatalogDocument: async () => ({ songs: [song] }) }))
vi.mock('@/catalog/songLookup', () => ({
  resolveSongRouteParam: async () => lookup.resolution,
  findSongById: (_: unknown, id: string) => (id === song.id ? song : undefined),
}))
vi.mock('@/pages/SongHubPage', () => ({ SongHubPage: () => null }))

const { Route } = await import('../songs_.$songId')

type BeforeLoad = (ctx: {
  params: { songId: string }
  search: { type?: string; difficulty?: string; locale?: string }
  location: { search: Record<string, unknown> }
}) => Promise<unknown>

const beforeLoad = Route.options.beforeLoad as unknown as BeforeLoad

const run = async (songId: string, search: Record<string, string>) => {
  try {
    await beforeLoad({ params: { songId }, search, location: { search } })
    return null
  } catch (error) {
    return error
  }
}

describe('/songs/$songId hub route', () => {
  beforeEach(() => {
    lookup.resolution = { song }
  })

  it('renders the hub for a bare public song ID (no redirect)', async () => {
    expect(await run('dsng_hub', {})).toBeNull()
    expect(await run('dsng_hub', { locale: 'ja' })).toBeNull()
  })

  // The router adds the URL's language prefix to every redirect it builds (router.tsx), so none carries a locale
  it('still 308s the legacy ?type=&difficulty= form to that chart', async () => {
    const result = (await run('dsng_hub', { type: 'dx', difficulty: 'expert' })) as {
      options: Record<string, unknown>
    }
    expect(isRedirect(result)).toBe(true)
    expect(result.options).toMatchObject({
      to: '/songs/$songId/$type/$difficulty',
      params: { songId: 'dsng_hub', type: 'dx', difficulty: 'expert' },
      statusCode: 308,
    })
  })

  it('redirects a legacy song ID to the public ID hub', async () => {
    lookup.resolution = { redirectSongId: 'dsng_hub' }
    const result = (await run('Hub Song', {})) as { options: Record<string, unknown> }
    expect(isRedirect(result)).toBe(true)
    expect(result.options).toMatchObject({
      to: '/songs/$songId',
      params: { songId: 'dsng_hub' },
      statusCode: 308,
    })
  })

  it('404s an unknown song', async () => {
    lookup.resolution = null
    const result = (await run('dsng_nope', {})) as { isNotFound?: boolean }
    expect(result?.isNotFound).toBe(true)
  })
})