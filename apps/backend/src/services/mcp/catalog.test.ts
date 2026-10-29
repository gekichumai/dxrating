import { describe, expect, it } from 'vitest'
import { PublishedDxdataCatalogSchema } from '../dxdata-openapi'
import { buildMcpCatalog, resolveSongReference, searchKey, searchSongs } from './catalog'
import {
  HIBANA,
  LINK_A,
  LINK_B,
  publishedCatalog,
  SYMBOLS,
  UMIYURI,
  UMIYURI_MASTER,
  UMIYURI_UTAGE,
} from './test-fixture'

const catalog = buildMcpCatalog('1', publishedCatalog)
const ids = (query: string) => searchSongs(catalog, query).map((match) => match.entry.song.id)

describe('MCP catalog', () => {
  it('has a fixture the producer could publish', () => {
    expect(PublishedDxdataCatalogSchema.safeParse(publishedCatalog).success).toBe(true)
  })

  it('folds width, case, kana and punctuation in search keys', () => {
    expect(searchKey('ＵＭＩＹＵＲＩ')).toBe('umiyuri')
    expect(searchKey('ヒバナ')).toBe(searchKey('ひばな'))
    expect(searchKey('Umiyuri Kaiteitan!')).toBe('umiyurikaiteitan')
    // a title of symbols only keeps them
    expect(searchKey('+♂')).toBe('+♂')
  })

  it('finds songs by title, acronym, alias and artist, best first', () => {
    expect(ids('ウミユリ海底譚')).toEqual([UMIYURI, UMIYURI_UTAGE])
    expect(ids('umiyuri')[0]).toBe(UMIYURI)
    expect(ids('海底谭')).toEqual([UMIYURI, UMIYURI_UTAGE])
    expect(ids('ひばな')).toEqual([HIBANA])
    expect(ids('火花')).toEqual([HIBANA])
    expect(ids('DECO*27')).toEqual([HIBANA])
    expect(ids('+♂')).toEqual([SYMBOLS])
    expect(ids('')).toEqual([])
  })

  it('says which name matched', () => {
    const [match] = searchSongs(catalog, '海底谭')
    expect(match.matched).toEqual({ kind: 'alias', text: '海底谭' })
  })

  it('keeps each alias once', () => {
    expect(catalog.songsById.get(UMIYURI)?.aliases).toEqual(['海底谭'])
  })

  it('resolves a reference by ID, sheet ID or whole name', () => {
    expect(resolveSongReference(catalog, UMIYURI).map((e) => e.song.id)).toEqual([UMIYURI])
    expect(resolveSongReference(catalog, UMIYURI_MASTER).map((e) => e.song.id)).toEqual([UMIYURI])
    expect(resolveSongReference(catalog, 'umiyuri').map((e) => e.song.id)).toEqual([UMIYURI])
    // a part of a name is not a reference
    expect(resolveSongReference(catalog, 'umi')).toEqual([])
    // two songs titled Link, and the alias Link of another song, which the titles win over
    expect(resolveSongReference(catalog, 'link').map((e) => e.song.id)).toEqual([LINK_A, LINK_B])
  })
})