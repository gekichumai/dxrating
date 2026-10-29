import { catalogSnapshot } from '@gekichumai/dxdata/snapshot'
import { setLoadedCatalogDocumentForTests } from '@/catalog/clientCatalog'

// Tests render against the complete catalog, as a browser does once it has loaded; tests of the loading itself reset it
setLoadedCatalogDocumentForTests(catalogSnapshot)