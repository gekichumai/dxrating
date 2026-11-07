import react from '@vitejs/plugin-react'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vitest/config'

// Local development: the admin API runs on :3100 with ADMIN_DEV_ACCESS_EMAIL (no Cloudflare Access locally).
export default defineConfig({
  plugins: [react(), UnoCSS()],
  server: { port: 5180, strictPort: true, proxy: { '/api': 'http://localhost:3100' } },
  test: { environment: 'happy-dom', include: ['src/**/*.test.tsx', 'worker/**/*.test.ts'] },
})