import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig, loadEnv, type ProxyOptions } from 'vite'

const LOCAL_BACKEND_ORIGIN = 'http://localhost:3000'
const LOCAL_ADMIN_ACCESS_HEADER = 'X-DXRating-Admin-Access-Test'

export const createLocalDevelopmentProxy = (accessProof: string): Record<string, ProxyOptions> => {
  const proof = accessProof.trim()
  if (!proof) {
    throw new Error(
      'ADMIN_ACCESS_TEST_BYPASS_SECRET is required by the local admin proxy; configure apps/backend/.env.local',
    )
  }

  return {
    '^/api/admin(?:/|$)': {
      target: LOCAL_BACKEND_ORIGIN,
      changeOrigin: true,
      headers: {
        [LOCAL_ADMIN_ACCESS_HEADER]: proof,
      },
    },
    '/api': {
      target: LOCAL_BACKEND_ORIGIN,
      changeOrigin: true,
    },
  }
}

export default defineConfig(({ command, isPreview, mode }) => {
  const localDevelopment = command === 'serve' && !isPreview
  const backendEnvironment = localDevelopment ? loadEnv(mode, path.resolve(__dirname, '../backend'), '') : undefined
  const accessProof =
    process.env.ADMIN_ACCESS_TEST_BYPASS_SECRET?.trim() ||
    backendEnvironment?.ADMIN_ACCESS_TEST_BYPASS_SECRET?.trim() ||
    ''

  return {
    appType: 'spa',
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5174,
      strictPort: true,
      proxy: localDevelopment ? createLocalDevelopmentProxy(accessProof) : undefined,
    },
    preview: {
      port: 4174,
      strictPort: true,
    },
    build: {
      sourcemap: true,
    },
  }
})