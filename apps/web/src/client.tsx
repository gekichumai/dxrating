import { StartClient } from '@tanstack/react-start/client'
import { StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { loadClientCatalogDocument } from '@/catalog/clientCatalog'
import { initClient } from '@/setup/init-client'

// Start on the catalog before hydration; CatalogProvider retries if this fails
loadClientCatalogDocument().catch(() => {})
initClient()

hydrateRoot(
  document,
  <StrictMode>
    <StartClient />
  </StrictMode>,
)