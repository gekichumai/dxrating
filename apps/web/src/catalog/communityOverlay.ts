import type { SongCatalogDocument } from '@gekichumai/dxdata'
import { fromV2Community, type CommunityV2Document } from '@gekichumai/dxdata/v2'
import { useEffect, useRef } from 'react'
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
// This page session's fresh per-sheet reads after a vote, removal or attachment, keyed by sheet. Every load takes a
// sheet's associations from here, so a reload never brings back one the viewer removed or buried
const sheetTagSongs = new Map<string, TagSong[]>()
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

/** Adds a tag association the viewer attached to every later load of the lists */
export const rememberAttachedTag = (tagSong: TagSong) => {
  if (!attachedTags.some((existing) => sameTagSong(existing, tagSong))) attachedTags.push(tagSong)
}

type SheetRef = Pick<TagSong, 'song_id' | 'sheet_type' | 'sheet_difficulty'>
const sheetKey = (sheet: SheetRef) => JSON.stringify([sheet.song_id, sheet.sheet_type, sheet.sheet_difficulty])

/** Replaces a sheet's tag associations, in every later load of the lists, with the visible ones of a fresh read */
export const rememberSheetTagSongs = (sheet: SheetRef, tagSongs: readonly TagSong[]) => {
  sheetTagSongs.set(sheetKey(sheet), [...tagSongs])
}

const withSheetTagSongs = (list: TagSong[]) =>
  sheetTagSongs.size === 0
    ? list
    : [...list.filter((tagSong) => !sheetTagSongs.has(sheetKey(tagSong))), ...[...sheetTagSongs.values()].flat()]

/** Adds an alias the viewer created to every later load of the lists */
export const rememberCreatedAlias = (alias: Alias) => {
  if (!createdAliases.some((existing) => sameAlias(existing, alias))) createdAliases.push(alias)
}

/**
 * The v1 tag and alias lists the app renders from, rebuilt from the overlay against the current catalog: an
 * association or alias of a sheet or song the catalog does not have yet is left out. The overlay request is shared
 * for a few seconds; the lists are resolved on every call, so a call after a catalog refresh sees the new songs.
 * `catalogUpdatedAt` names the catalog they were resolved against (see {@link resolvedAgainst}).
 */
export async function loadCommunityLists(): Promise<CommunityLists & { catalogUpdatedAt: string }> {
  if (!shared || Date.now() - shared.at >= SHARE_MS) {
    const entry = { at: Date.now(), community: fetchCommunity() }
    shared = entry
    // A failure is not shared: the next caller tries again
    entry.community.catch(() => {
      if (shared === entry) shared = undefined
    })
  }
  const [community, loaded] = await Promise.all([shared.community, loadClientCatalogDocument()])
  // The latest catalog, not the one loaded when this call began: a background revalidation can publish a newer one
  // while the overlay request is in flight, and nothing would notify this call again
  const catalog = getLoadedCatalogDocument() ?? loaded
  const lists = fromV2Community(community, catalog)
  return {
    ...lists,
    tagSongs: withSheetTagSongs(withAdded(lists.tagSongs, attachedTags, sameTagSong)),
    aliases: withAdded(lists.aliases, createdAliases, sameAlias),
    catalogUpdatedAt: catalog.updatedAt,
  }
}

// The catalog each value a hook keeps in SWR was resolved against, keyed by that value. Keyed by what SWR actually
// holds, not by fetcher completion: SWR discards a revalidation that overlaps a local mutation, and a value made by a
// local mutation has no entry, so it counts as unresolved
const resolvedCatalogs = new WeakMap<object, string>()

/** Records that `value`, as returned to SWR, was resolved against the catalog of `catalogUpdatedAt` */
export const resolvedAgainst = <T extends object>(value: T, catalogUpdatedAt: string): T => {
  resolvedCatalogs.set(value, catalogUpdatedAt)
  return value
}

const isStale = (data: object | undefined) => {
  const current = getLoadedCatalogDocument()?.updatedAt
  return data !== undefined && current !== undefined && resolvedCatalogs.get(data) !== current
}

/**
 * Re-resolves a hook's community data when what it holds was not resolved against the current catalog: a catalog
 * published while it is mounted (a background revalidation found it), one published while no consumer was mounted
 * (found when it mounts again), or a value a local mutation made, which may have replaced a discarded refresh. Songs
 * and sheets a newer catalog adds get their tags and aliases without a reload; the viewer's own additions stay.
 */
export const useRefreshOnCatalogChange = (data: object | undefined, revalidate: () => unknown) => {
  const latest = useRef(data)
  useEffect(() => {
    latest.current = data
    if (isStale(data)) void revalidate()
  }, [data, revalidate])
  useEffect(
    () =>
      subscribeToCatalog(() => {
        if (isStale(latest.current)) void revalidate()
      }),
    [revalidate],
  )
}

/** Tests only: forgets the shared load */
export function resetCommunityListsForTests() {
  shared = undefined
  attachedTags.length = 0
  sheetTagSongs.clear()
  createdAliases.length = 0
}