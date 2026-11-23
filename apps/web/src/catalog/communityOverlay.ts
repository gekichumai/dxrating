import type { SongCatalogDocument } from '@gekichumai/dxdata'
import { fromV2Community, type CommunityV2Document } from '@gekichumai/dxdata/v2'
import { keepPreviousData, useQuery, type QueryClient } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import { requestQueriesNamed, requestQuery } from '@/lib/query'
import { getLoadedCatalogDocument, loadClientCatalogDocument, subscribeToCatalog } from './clientCatalog'

// The tags and aliases of the catalog (dxdata v2, gekichumai/meta#43). They change within minutes while the catalog
// changes about daily, so they come from their own small document. Its responses tell the browser to revalidate
// every time (the edge answers a 304 when nothing changed), so a plain fetch() always sees a current copy; like the
// catalog it is a plain GET route of the backend, not an oRPC procedure.
export const COMMUNITY_URL = `${import.meta.env.VITE_BACKEND_URL}/api/v2/dxdata/community`

/** Requests within this window share one load: the tag and alias hooks mount together */
const SHARE_MS = 5_000

export type CommunityLists = Pick<SongCatalogDocument, 'tagGroups' | 'tags' | 'tagSongs' | 'aliases'>

const isCommunityV2Document = (value: unknown): value is CommunityV2Document => {
  if (typeof value !== 'object' || value === null) return false
  const document = value as Partial<CommunityV2Document>
  return (
    document.schemaVersion === 2 &&
    Array.isArray(document.tagGroups) &&
    Array.isArray(document.tags) &&
    typeof document.sheetTags === 'object' &&
    document.sheetTags !== null &&
    typeof document.aliases === 'object' &&
    document.aliases !== null
  )
}

async function fetchCommunity(): Promise<CommunityV2Document> {
  const response = await fetch(COMMUNITY_URL)
  if (!response.ok) throw new Error(`Community data request failed with HTTP ${response.status}`)
  const document: unknown = await response.json()
  if (!isCommunityV2Document(document)) throw new Error('Community data response is not a v2 community document')
  return document
}

let shared: { at: number; community: Promise<CommunityV2Document> } | undefined

type TagSong = CommunityLists['tagSongs'][number]
type Alias = CommunityLists['aliases'][number]

// What the viewer added in this page session. The shared overlay comes through the edge cache, which can take a few
// minutes to include a new write, so every load adds these: a reload never takes away what the viewer just added
const attachedTags: TagSong[] = []
const createdAliases: Alias[] = []

const sameTagSong = (a: TagSong, b: TagSong) =>
  a.tag_id === b.tag_id &&
  a.song_id === b.song_id &&
  a.sheet_type === b.sheet_type &&
  a.sheet_difficulty === b.sheet_difficulty
const sameAlias = (a: Alias, b: Alias) => a.song_id === b.song_id && a.name === b.name

const withAdded = <T>(list: T[], added: readonly T[], same: (a: T, b: T) => boolean) => {
  const missing = added.filter((item) => !list.some((existing) => same(existing, item)))
  return missing.length ? [...list, ...missing] : list
}

const withLocalAdditions = (lists: CommunityLists): CommunityLists => ({
  ...lists,
  tagSongs: withAdded(lists.tagSongs, attachedTags, sameTagSong),
  aliases: withAdded(lists.aliases, createdAliases, sameAlias),
})

const COMMUNITY_QUERY = 'community'

const showLocalAdditions = (queryClient: QueryClient) =>
  queryClient.setQueriesData<CommunityLists>(requestQueriesNamed(COMMUNITY_QUERY), (lists) =>
    lists ? withLocalAdditions(lists) : lists,
  )

/** Shows a tag association the viewer attached at once, and adds it to every later load of the lists */
export const rememberAttachedTag = (queryClient: QueryClient, tagSong: TagSong) => {
  if (!attachedTags.some((existing) => sameTagSong(existing, tagSong))) attachedTags.push(tagSong)
  showLocalAdditions(queryClient)
}

/** Shows an alias the viewer created at once, and adds it to every later load of the lists */
export const rememberCreatedAlias = (queryClient: QueryClient, alias: Alias) => {
  if (!createdAliases.some((existing) => sameAlias(existing, alias))) createdAliases.push(alias)
  showLocalAdditions(queryClient)
}

/**
 * The v1 tag and alias lists the app renders from, rebuilt from the overlay against the current catalog: an
 * association or alias of a sheet or song the catalog does not have yet is left out. The overlay request is shared
 * for a few seconds; the lists are resolved on every call, so a call after a catalog refresh sees the new songs.
 */
export async function loadCommunityLists(): Promise<CommunityLists> {
  if (!shared || Date.now() - shared.at >= SHARE_MS) {
    const entry = { at: Date.now(), community: fetchCommunity() }
    shared = entry
    // A failure is not shared: the next caller tries again
    entry.community.catch(() => {
      if (shared === entry) shared = undefined
    })
  }
  const [community, loaded] = await Promise.all([shared.community, loadClientCatalogDocument()])
  return withLocalAdditions(fromV2Community(community, getLoadedCatalogDocument() ?? loaded))
}

const loadedCatalogUpdatedAt = () => getLoadedCatalogDocument()?.updatedAt ?? null
const noCatalog = () => null

/**
 * The lists, as `select` picks from them. The loaded catalog is part of the query key, so a catalog published later
 * resolves them again: the songs and sheets it adds get their tags and aliases without a reload.
 */
export const useCommunityLists = <T>(select: (lists: CommunityLists) => T) =>
  useQuery({
    ...requestQuery(COMMUNITY_QUERY, useSyncExternalStore(subscribeToCatalog, loadedCatalogUpdatedAt, noCatalog), () =>
      loadCommunityLists(),
    ),
    select,
    staleTime: 60 * 60 * 1000,
    placeholderData: keepPreviousData,
  })

/** Tests only: forgets the shared load */
export function resetCommunityListsForTests() {
  shared = undefined
  attachedTags.length = 0
  createdAliases.length = 0
}