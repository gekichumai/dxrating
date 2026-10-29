import type { Song, SongCatalogDocument } from '@gekichumai/dxdata'
import { getSongCatalog, type SongCatalog } from '@gekichumai/maimai-domain'
import { useMatches } from '@tanstack/react-router'
import {
  createContext,
  type FC,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react'
import { useAppContextDXDataVersion } from '@/models/context/useAppContext'
import { buildCatalogSlice, type CatalogMeta, EMPTY_CATALOG_DOCUMENT, getCatalogDocument } from './catalogSource'
import { getLoadedCatalogDocument, loadClientCatalogDocument, subscribeToCatalog } from './clientCatalog'

// The song catalog every component renders from. Components read it through these hooks only, never by importing
// catalog data. Until the complete catalog has loaded in the browser (and always during SSR) they render from the
// catalog slice the route loaders put in the page: the root loader's `catalogMeta` plus each route's `catalogSongs`.
// The server render and the first client render both use that slice, so hydration matches; the complete catalog
// replaces it right after.

/** Loader data fields the catalog slice is read from */
export type CatalogSliceLoaderData = { catalogMeta?: CatalogMeta; catalogSongs?: readonly Song[] }

type CatalogView = { document: SongCatalogDocument; complete: boolean }

const CatalogSliceContext = createContext<SongCatalogDocument | null>(null)

const RETRY_DELAYS_MS = [2_000, 10_000, 30_000]
const getNoCatalog = () => null

export const CatalogProvider: FC<PropsWithChildren> = ({ children }) => {
  const loaderData = useMatches({
    select: (matches) => matches.map((match) => match.loaderData as CatalogSliceLoaderData | undefined),
  })
  const meta = loaderData.find((data) => data?.catalogMeta)?.catalogMeta
  const songs = loaderData.flatMap((data) => data?.catalogSongs ?? [])
  // Keyed by the song IDs: the selected loader data is a new array on every render
  const songsKey = songs.map((song) => song.id).join()
  const slice = useMemo(() => (meta ? buildCatalogSlice(meta, uniqueSongs(songs)) : null), [meta, songsKey])

  useEffect(() => {
    let cancelled = false
    let attempt = 0
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    const load = () => {
      loadClientCatalogDocument().catch((error: unknown) => {
        console.error('Failed to load the song catalog', error)
        if (cancelled) return
        retryTimer = setTimeout(load, RETRY_DELAYS_MS[Math.min(attempt++, RETRY_DELAYS_MS.length - 1)])
      })
    }
    load()
    return () => {
      cancelled = true
      clearTimeout(retryTimer)
    }
  }, [])

  return <CatalogSliceProvider slice={slice}>{children}</CatalogSliceProvider>
}

/** Provides the catalog slice components render from until the complete catalog has loaded */
export const CatalogSliceProvider: FC<PropsWithChildren<{ slice: SongCatalogDocument | null }>> = ({
  slice,
  children,
}) => <CatalogSliceContext.Provider value={slice}>{children}</CatalogSliceContext.Provider>

const uniqueSongs = (songs: readonly Song[]) => {
  const seen = new Set<string>()
  return songs.filter((song) => !seen.has(song.id) && !!seen.add(song.id))
}

const useCatalogView = (): CatalogView => {
  const slice = useContext(CatalogSliceContext)
  // The server snapshot is "not loaded", for SSR and for hydration alike
  const loaded = useSyncExternalStore(subscribeToCatalog, getLoadedCatalogDocument, getNoCatalog)
  return useMemo(
    () =>
      loaded ? { document: loaded, complete: true } : { document: slice ?? EMPTY_CATALOG_DOCUMENT, complete: false },
    [loaded, slice],
  )
}

/** The catalog document (songs, versions, servers, …): the complete one once loaded, the page's slice before */
export const useCatalogDocument = (): SongCatalogDocument => useCatalogView().document

/** Whether the complete catalog has loaded. Code that acts on the whole catalog waits for it */
export const useIsCatalogComplete = (): boolean => useCatalogView().complete

/** The song catalog under the selected game version, from `useCatalogDocument` */
export const useSongCatalog = (): SongCatalog => {
  const version = useAppContextDXDataVersion()
  return getSongCatalog(useCatalogDocument(), version)
}

/** The complete catalog document, or null until it has loaded */
export const useCompleteCatalogDocument = (): SongCatalogDocument | null => {
  const { document, complete } = useCatalogView()
  return complete ? document : null
}

/** The complete song catalog under the selected game version, or null until it has loaded */
export const useCompleteSongCatalog = (): SongCatalog | null => {
  const version = useAppContextDXDataVersion()
  const document = useCompleteCatalogDocument()
  return document ? getSongCatalog(document, version) : null
}

/** For event handlers (imports and the like): resolves to the complete song catalog, waiting for it if needed */
export const useSongCatalogLoader = (): (() => Promise<SongCatalog>) => {
  const version = useAppContextDXDataVersion()
  return useCallback(async () => getSongCatalog(await getCatalogDocument(), version), [version])
}