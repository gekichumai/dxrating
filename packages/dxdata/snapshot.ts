// The catalog snapshot the SSR worker renders from, so a server render never waits on the network. Server code only:
// importing it from a module that ships to the browser would put the whole catalog back into the client bundle
// (browsers load the catalog from the dxdata API instead). `pnpm --filter @gekichumai/dxdata snapshot:refresh`
// replaces it with the current API document; release builds run it before building.
import snapshotJson from './snapshot.json' with { type: 'json' }
import type { SongCatalogDocument } from './index.ts'

export const catalogSnapshot = snapshotJson as SongCatalogDocument