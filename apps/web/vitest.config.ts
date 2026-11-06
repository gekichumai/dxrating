import { defineConfig } from 'vitest/config'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import Icons from 'unplugin-icons/vite'
import { paraglideVitePlugin } from '@inlang/paraglide-js'
import { PARAGLIDE_OPTIONS } from './paraglide.options.ts'

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
  plugins: [paraglideVitePlugin(PARAGLIDE_OPTIONS), Icons({ compiler: 'jsx', jsx: 'react', autoInstall: true })],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'happy-dom',
    include: [
      'src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      // The search recall eval takes about a minute, so it runs only through `pnpm search:eval`
      ...(process.env.SEARCH_EVAL ? ['src/search-eval/*.eval.ts'] : []),
    ],
    globals: true,
    // UI tests render real component trees and await async effects; on a busy machine (parallel agents, CI runners)
    // the 5s default times out tests that pass alone
    testTimeout: 20_000,
    setupFiles: ['src/test-utils/setup-catalog.ts'],
  },
})