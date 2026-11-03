import { catalogSnapshot } from '@gekichumai/dxdata/snapshot'
import { describe, expect, it } from 'vitest'
import { findSongById, resolveLegacySongId, resolveSongRouteParam } from '../songLookup'

describe('song route parameters', () => {
  it('finds songs by public song ID', async () => {
    await expect(resolveSongRouteParam(catalogSnapshot, 'dsng_kkx38yfx4t')).resolves.toEqual({
      song: findSongById(catalogSnapshot, 'dsng_kkx38yfx4t'),
    })
  })

  it('redirects legacy song IDs from old links to the public song ID', async () => {
    await expect(resolveSongRouteParam(catalogSnapshot, '君の知らない物語')).resolves.toEqual({
      redirectSongId: 'dsng_kkx38yfx4t',
    })
    // "Link" and "Link (2)" share a title; the legacy ID tells them apart
    await expect(resolveSongRouteParam(catalogSnapshot, 'Link')).resolves.toEqual({ redirectSongId: 'dsng_hfz8w7y42r' })
    await expect(resolveSongRouteParam(catalogSnapshot, 'Link (2)')).resolves.toEqual({
      redirectSongId: 'dsng_cs6jtvqaga',
    })
  })

  it('names nothing for unknown public or legacy IDs', async () => {
    await expect(resolveSongRouteParam(catalogSnapshot, 'dsng_zzzzzzzzzz')).resolves.toBeNull()
    await expect(resolveSongRouteParam(catalogSnapshot, 'no such song')).resolves.toBeNull()
  })

  it('falls back to the one song with a title for legacy IDs newer than the map', () => {
    expect(resolveLegacySongId(catalogSnapshot, '君の知らない物語', {})).toBe('dsng_kkx38yfx4t')
    expect(resolveLegacySongId(catalogSnapshot, 'Link', {})).toBeUndefined()
  })
})