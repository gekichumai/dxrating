import type { Song, SongCatalogDocument } from '@gekichumai/dxdata'
import { getLoadedCatalogDocument, loadClientCatalogDocument } from './clientCatalog'

/**
 * The complete catalog, for route loaders, server routes and code that acts on the whole catalog. During SSR it is the
 * snapshot bundled with the server build, so a server render never waits on the network; the `import.meta.env.SSR`
 * branch keeps that snapshot out of the client build. In the browser it is the dxdata API document (see clientCatalog).
 */
export const getCatalogDocument = (): Promise<SongCatalogDocument> =>
  import.meta.env.SSR
    ? import('@gekichumai/dxdata/snapshot').then((module) => module.catalogSnapshot)
    : loadClientCatalogDocument()

/** The catalog fields every page needs (versions, difficulties, servers, …), without songs */
export type CatalogMeta = Omit<SongCatalogDocument, 'songs' | 'tagGroups' | 'tags' | 'tagSongs' | 'aliases'>

export const toCatalogMeta = ({
  songs: _songs,
  tagGroups: _tagGroups,
  tags: _tags,
  tagSongs: _tagSongs,
  aliases: _aliases,
  ...meta
}: SongCatalogDocument): CatalogMeta => meta

/**
 * The root loader's catalog fields. The root route does not reload after the first load, so in the browser this only
 * runs without server-rendered data, where it can use the complete catalog.
 */
export const loadCatalogMeta = async (): Promise<CatalogMeta> =>
  toCatalogMeta((import.meta.env.SSR ? null : getLoadedCatalogDocument()) ?? (await getCatalogDocument()))

/**
 * A catalog with only some songs: what a server render inlines and renders from, and what the first client render
 * hydrates from, until the complete catalog replaces it. Song order follows the given songs.
 */
export const buildCatalogSlice = (meta: CatalogMeta, songs: readonly Song[]): SongCatalogDocument => ({
  ...meta,
  songs: [...songs],
  tagGroups: [],
  tags: [],
  tagSongs: [],
  aliases: [],
})

export const EMPTY_CATALOG_DOCUMENT: SongCatalogDocument = {
  schemaVersion: 1,
  updatedAt: '',
  categories: [],
  versions: [],
  types: [],
  difficulties: [],
  servers: [],
  songs: [],
  tagGroups: [],
  tags: [],
  tagSongs: [],
  aliases: [],
}