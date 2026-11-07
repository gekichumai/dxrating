import { defineConfig, devices } from '@playwright/test'

// Runs against a production build served by `vite preview` (build first: `pnpm build`), or against a deployed site
// with E2E_BASE_URL=https://dxrating.net. Browsing only: no test signs in or writes data.
const PREVIEW_PORT = 4318
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PREVIEW_PORT}`

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm vite preview --port ${PREVIEW_PORT} --strictPort`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})