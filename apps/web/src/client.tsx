import { StartClient } from '@tanstack/react-start/client'
import { StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { loadClientCatalogDocument } from '@/catalog/clientCatalog'
import { startEarlyErrorBuffer } from '@/setup/error-reporting-loader'
import { initClient } from '@/setup/init-client'
import { installStaleBuildRecovery } from '@/setup/stale-build'

// Before anything else can throw: Sentry loads after hydration and reports what this keeps
startEarlyErrorBuffer()
// A tab older than the latest deploy reloads once when a chunk of its build is gone
installStaleBuildRecovery()

// Start on the catalog before hydration; CatalogProvider retries if this fails
loadClientCatalogDocument().catch(() => {})
initClient()

hydrateRoot(
  document,
  <StrictMode>
    <StartClient />
  </StrictMode>,
)