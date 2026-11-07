/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** `updatedAt` of the catalog snapshot this build was made with */
  readonly VITE_CATALOG_SNAPSHOT_UPDATED_AT: string
  /** Sentry release this build uploads its source maps under; empty outside CI */
  readonly VITE_SENTRY_RELEASE: string
  /** Set on Playwright builds: the Worker's Sentry stays off (src/server.ts) */
  readonly VITE_E2E_BUILD?: string
}