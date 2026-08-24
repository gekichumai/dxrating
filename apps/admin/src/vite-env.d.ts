/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ADMIN_ENVIRONMENT?: string
  readonly VITE_BACKEND_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}