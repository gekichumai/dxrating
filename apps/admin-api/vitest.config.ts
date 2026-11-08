import { defineConfig } from 'vitest/config'

// The integration files share one test database (and truncate the dxdata fixture), so they run one at a time
export default defineConfig({ test: { include: ['src/**/*.test.ts'], fileParallelism: false } })