import { sentryVitePlugin } from '@sentry/vite-plugin'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import UnoCSS from 'unocss/vite'
import Icons from 'unplugin-icons/vite'
import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    // Strip `with { type: 'json' }` import attributes before esbuild sees them.
    // esbuild 0.18 (Vite 4) doesn't support import attributes, but Vite handles
    // JSON imports natively so the attribute isn't needed for the frontend build.
    {
      name: 'strip-import-attributes',
      enforce: 'pre',
      transform(code, _id) {
        if (code.includes("with {")) {
          return { code: code.replace(/\s+with\s+\{[^}]*\}/g, ''), map: null }
        }
      },
    },
    react(),
    UnoCSS(),
    Icons({ compiler: 'jsx', jsx: 'react', autoInstall: true }),
    sentryVitePlugin({
      org: 'gekichumai',
      project: 'dxrating',

      // Auth tokens can be obtained from https://sentry.io/orgredirect/organizations/:orgslug/settings/auth-tokens/
      authToken: process.env.SENTRY_AUTH_TOKEN,
      reactComponentAnnotation: { enabled: true },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          lib: ['react', '@mui/material', 'react-use', '@tanstack/react-table'],
          dxdata: ['@gekichumai/dxdata'],
        },
      },
    },
    sourcemap: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
