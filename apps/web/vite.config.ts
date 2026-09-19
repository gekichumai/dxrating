import { cloudflare } from '@cloudflare/vite-plugin'
import { sentryTanstackStart } from '@sentry/tanstackstart-react/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
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