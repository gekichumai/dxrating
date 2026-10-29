import { defineConfig } from 'vitest/config'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import Icons from 'unplugin-icons/vite'

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
  plugins: [Icons({ compiler: 'jsx', jsx: 'react', autoInstall: true })],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    globals: true,
    setupFiles: ['src/test-utils/setup-catalog.ts'],
  },
})