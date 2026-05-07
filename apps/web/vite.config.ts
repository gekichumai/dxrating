import { sentryVitePlugin } from '@sentry/vite-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import path from 'node:path'
import UnoCSS from 'unocss/vite'
import Icons from 'unplugin-icons/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 5173,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [
    UnoCSS(),
    Icons({ compiler: 'jsx', jsx: 'react', autoInstall: true }),
    tanstackStart(),
    nitro(),
    viteReact(),
    sentryVitePlugin({
      org: 'gekichumai',
      project: 'dxrating',
      authToken: process.env.SENTRY_AUTH_TOKEN,
      reactComponentAnnotation: { enabled: true },
    }),
  ],
  build: {
    sourcemap: true,
  },
})