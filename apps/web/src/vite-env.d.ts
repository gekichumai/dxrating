/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** `updatedAt` of the catalog snapshot this build was made with */
  readonly VITE_CATALOG_SNAPSHOT_UPDATED_AT: string
}