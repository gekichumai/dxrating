import { sentryVitePlugin } from '@sentry/vite-plugin'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import UnoCSS from 'unocss/vite'
import Icons from 'unplugin-icons/vite'
import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
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
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/@mui/material/') ||
            id.includes('/react-use/') ||
            id.includes('/@tanstack/react-table/')
          ) {
            return 'lib'
          }
          if (id.includes('/@gekichumai/dxdata/') || id.includes('/packages/dxdata/')) {
            return 'dxdata'
          }
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
