/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ADMIN_ENVIRONMENT?: string
  readonly VITE_BACKEND_URL?: string
  readonly VITE_TURNSTILE_SITE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}