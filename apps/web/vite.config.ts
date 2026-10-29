import { cloudflare } from '@cloudflare/vite-plugin'
import { sentryTanstackStart } from '@sentry/tanstackstart-react/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import UnoCSS from 'unocss/vite'
import Icons from 'unplugin-icons/vite'
import { defineConfig, type Plugin } from 'vite'

// Emit the song catalog in the Worker bundle as JSON.parse("...") instead of a multi-megabyte object literal. V8 parses
// a JSON string much faster than the equivalent JS, which shortens Worker cold starts (isolate startup evaluates every
// chunk before the first request). Vite 8's native JSON plugin keeps it as a literal, so target the catalog snapshot directly.
// The client keeps the minified literal, which is smaller over the wire.
const dxdataJsonParse = (): Plugin => ({
  name: 'dxrating:dxdata-json-parse',
  enforce: 'pre',
  applyToEnvironment: (environment) => environment.name === 'ssr',
  load(id) {
    if (!id.endsWith('/packages/dxdata/snapshot.json')) return null
    const json = JSON.stringify(JSON.parse(readFileSync(id, 'utf8')))
    return { code: `export default JSON.parse(${JSON.stringify(json)})`, moduleType: 'js' }
  },
})

// The catalog the build renders with: the browser never uses an older one (see src/catalog/clientCatalog.ts)
const catalogSnapshotUpdatedAt = (
  JSON.parse(readFileSync(path.resolve(__dirname, '../../packages/dxdata/snapshot.json'), 'utf8')) as {
    updatedAt: string
  }
).updatedAt

export default defineConfig({
  define: {
    'import.meta.env.VITE_CATALOG_SNAPSHOT_UPDATED_AT': JSON.stringify(catalogSnapshotUpdatedAt),
  },
  server: {
    port: 5173,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [
    dxdataJsonParse(),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    UnoCSS(),
    Icons({ compiler: 'jsx', jsx: 'react', autoInstall: true }),
    tanstackStart(),
    viteReact(),
    sentryTanstackStart({
      org: 'gekichumai',
      project: 'dxrating-web',
      authToken: process.env.SENTRY_AUTH_TOKEN,
      release: {
        name: process.env.SENTRY_RELEASE,
        setCommits: process.env.SENTRY_AUTH_TOKEN ? { auto: true } : undefined,
      },
      sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
    }),
  ],
  build: {
    sourcemap: 'hidden',
  },
})