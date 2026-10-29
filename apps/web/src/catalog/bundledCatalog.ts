import type { SongCatalogDocument } from '@gekichumai/dxdata'
import { catalogSnapshot } from '@gekichumai/dxdata/snapshot'

/** The catalog snapshot bundled with this build: what route loaders, head tags and server routes render from */
export const getBundledCatalogDocument = (): SongCatalogDocument => catalogSnapshot