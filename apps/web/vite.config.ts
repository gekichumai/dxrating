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

// Client chunking. Default splitting gave every page ~60 small JS files, and any app change could rehash vendor code.
// Third-party code that the first page load needs goes into a few vendor chunks named by package scope, so their
// hashes only change when those packages do. App modules shared by two or more route entries go into one app-shared
// chunk. Packages not listed (sql.js, d3, @tanstack/table-core and other lazy-only libraries) keep the default
// splitting, so they stay in lazy chunks and out of the first load.
const toPosix = (id: string) => id.replaceAll('\\', '/')

const nodeModule = (id: string, pkgs: string[]) => {
  const path = toPosix(id)
  return pkgs.some((pkg) => path.includes(`/node_modules/${pkg}/`))
}

// MUI components only lazy routes use; vendor-mui would otherwise pull them into the first load
const LAZY_MUI = /[\\/]@mui[\\/]material[\\/](Slider|Autocomplete|useAutocomplete|Tabs|Tab|TabScrollButton|Switch)[\\/]/

const VENDOR_GROUPS: [name: string, pkgs: string[]][] = [
  // Leaf packages that most others import
  [
    'vendor-react',
    ['react', 'react-dom', 'scheduler', 'use-sync-external-store', 'react-is', '@babel/runtime', 'clsx', 'tslib'],
  ],
  [
    'vendor-mui',
    [
      '@mui/material',
      '@mui/system',
      '@mui/utils',
      '@mui/styled-engine',
      '@mui/private-theming',
      '@mui/types',
      '@emotion/cache',
      '@emotion/hash',
      '@emotion/is-prop-valid',
      '@emotion/memoize',
      '@emotion/react',
      '@emotion/serialize',
      '@emotion/sheet',
      '@emotion/styled',
      '@emotion/unitless',
      '@emotion/use-insertion-effect-with-fallbacks',
      '@emotion/utils',
      '@emotion/weak-memoize',
      'stylis',
      'react-transition-group',
      '@popperjs/core',
      'hoist-non-react-statics',
    ],
  ],
  [
    'vendor-tanstack',
    [
      '@tanstack/react-router',
      '@tanstack/router-core',
      '@tanstack/history',
      '@tanstack/store',
      '@tanstack/react-store',
      '@tanstack/query-core',
      '@tanstack/react-query',
      'seroval',
      'seroval-plugins',
    ],
  ],
  [
    'vendor-sentry',
    [
      '@sentry/core',
      '@sentry/browser',
      '@sentry/browser-utils',
      '@sentry/conventions',
      '@sentry/react',
      '@sentry/tanstackstart-react',
    ],
  ],
  ['vendor-posthog', ['posthog-js']],
  ['vendor-motion', ['framer-motion', 'motion-dom', 'motion-utils']],
  [
    'vendor-i18n',
    ['i18next', 'react-i18next', 'i18next-browser-languagedetector', 'html-parse-stringify', 'void-elements'],
  ],
  [
    'vendor-api',
    [
      '@orpc/client',
      '@orpc/contract',
      '@orpc/openapi',
      '@orpc/openapi-client',
      '@orpc/server',
      '@orpc/shared',
      '@orpc/tanstack-query',
      '@standard-server/core',
      '@standard-server/fetch',
      '@standard-server/shared',
      '@microsoft/fetch-event-source',
      'zod',
      'better-auth',
      '@better-auth/core',
      '@better-auth/passkey',
      '@better-fetch/fetch',
      'better-call',
      '@simplewebauthn/browser',
      'nanostores',
      'defu',
    ],
  ],
  [
    'vendor-libs',
    [
      'colorjs.io',
      'react-virtuoso',
      'react-hook-form',
      'lodash-es',
      'marked',
      'fuse.js',
      'swr',
      'react-hot-toast',
      'goober',
      'date-fns',
      'ts-pattern',
      'web-haptics',
      '@marsidev/react-turnstile',
      'react-use',
      'use-long-press',
      'lucide-react',
      'dequal',
    ],
  ],
]

// The bundler runtime and the preload helper are imported by vendor chunks too; keeping them out of app chunks stops
// an app change from rehashing every chunk that imports them
const isBundlerHelper = (id: string) => id.includes('rolldown/runtime') || id.includes('vite/preload-helper')

// A group also takes in the dependencies of the modules it captures, so the groups run leaf-first (higher priority
// captures first): vendor-react before everything that imports React. The TanStack Start client stays out of
// vendor-tanstack because it imports the app's router, which would drag the whole app into that chunk.
const vendorGroups = VENDOR_GROUPS.map(([name, pkgs], index) => ({
  name,
  test: (id: string) => (index === 0 && isBundlerHelper(id)) || (!LAZY_MUI.test(id) && nodeModule(id, pkgs)),
  priority: 100 - index,
}))

// The catalog the build renders with: the browser never uses an older one (see src/catalog/clientCatalog.ts)
const catalogSnapshotUpdatedAt = (
  JSON.parse(readFileSync(path.resolve(__dirname, '../../packages/dxdata/snapshot.json'), 'utf8')) as {
    updatedAt: string
  }
).updatedAt

export default defineConfig({
  define: {
    'import.meta.env.VITE_CATALOG_SNAPSHOT_UPDATED_AT': JSON.stringify(catalogSnapshotUpdatedAt),
    // The Sentry release, read by Sentry.init in src/router.tsx and src/server.ts. Only the modules that use it embed it.
    'import.meta.env.VITE_SENTRY_RELEASE': JSON.stringify(process.env.SENTRY_RELEASE ?? ''),
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
        // Injecting the release puts it at the top of every chunk, so each release rehashes the vendor chunks too.
        // Sentry.init sets the release from VITE_SENTRY_RELEASE instead; uploaded source maps match by debug ID.
        inject: false,
        setCommits: process.env.SENTRY_AUTH_TOKEN ? { auto: true } : undefined,
      },
      sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
    }),
  ],
  build: {
    sourcemap: 'hidden',
    // Never inline font files into stylesheets as data URIs (the legacy .woff fallbacks would bloat the CSS)
    assetsInlineLimit: (file) => (/\.(woff2?|ttf|otf|eot)$/.test(file) ? false : undefined),
  },
  environments: {
    // Client only: the Worker SSR build keeps its default chunking
    client: {
      build: {
        rolldownOptions: {
          output: {
            codeSplitting: {
              groups: [
                ...vendorGroups,
                // Before app-shared: shared icons would otherwise become many tiny chunks
                { name: 'vendor-icons', test: (id: string) => toPosix(id).includes('~icons/'), priority: 20 },
                // App modules shared by two or more route entries. Almost all of them are on the first load (the root
                // route reaches them), so one chunk beats splitting by entry set, which gave ~17 chunks every page loaded.
                { name: 'app-shared', test: /[\\/]src[\\/]/, minShareCount: 2, priority: 10 },
              ],
            },
          },
        },
      },
    },
  },
})