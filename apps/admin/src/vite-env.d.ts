/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ADMIN_ENVIRONMENT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}