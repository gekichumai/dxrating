import type { SongCatalogDocument } from '@gekichumai/dxdata'
import { getSongCatalog, type SongCatalog } from '@gekichumai/maimai-domain'
import { createContext, type FC, type PropsWithChildren, useContext } from 'react'
import { useAppContextDXDataVersion } from '@/models/context/useAppContext'
import { getBundledCatalogDocument } from './bundledCatalog'

// The song catalog every component renders from. Components read it through these hooks only, never by importing
// catalog data, so where the document comes from (bundled snapshot, persisted cache, the dxdata API) is decided here.

const CatalogContext = createContext<SongCatalogDocument | null>(null)

export const CatalogProvider: FC<PropsWithChildren<{ document?: SongCatalogDocument }>> = ({ document, children }) => (
  <CatalogContext.Provider value={document ?? getBundledCatalogDocument()}>{children}</CatalogContext.Provider>
)

/** The catalog document (songs, versions, servers, …) */
export const useCatalogDocument = (): SongCatalogDocument => {
  const contextDocument = useContext(CatalogContext)
  return contextDocument ?? getBundledCatalogDocument()
}

/** The song catalog under the selected game version */
export const useSongCatalog = (): SongCatalog => {
  const version = useAppContextDXDataVersion()
  return getSongCatalog(useCatalogDocument(), version)
}