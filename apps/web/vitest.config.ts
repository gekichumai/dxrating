import { defineConfig } from 'vitest/config'
import path from 'node:path'
import Icons from 'unplugin-icons/vite'

export default defineConfig({
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
  },
})