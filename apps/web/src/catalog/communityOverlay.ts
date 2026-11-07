import type { SongCatalogDocument } from '@gekichumai/dxdata'
import { fromV2Community, type CommunityV2Document } from '@gekichumai/dxdata/v2'
import { useEffect } from 'react'
import { loadClientCatalogDocument, subscribeToCatalog } from './clientCatalog'

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
  const [community, catalog] = await Promise.all([shared.community, loadClientCatalogDocument()])
  return fromV2Community(community, catalog)
}

/**
 * Re-resolves a hook's community data whenever a newer catalog is published (a background revalidation found one),
 * so songs and sheets it adds get their tags and aliases without a reload
 */
export const useRefreshOnCatalogChange = (revalidate: () => unknown) => {
  useEffect(
    () =>
      subscribeToCatalog(() => {
        void revalidate()
      }),
    [revalidate],
  )
}

/** Tests only: forgets the shared load */
export function resetCommunityListsForTests() {
  shared = undefined
}