import { fileURLToPath } from 'node:url'
import { Generator, getConfig } from '@tanstack/router-generator'

const root = fileURLToPath(new URL('../', import.meta.url))
const config = getConfig(
  {
    // Match the registration footer added by the TanStack Start Vite plugin.
    routeTreeFileFooter: [
      `import type { getRouter } from './router.tsx'
import type { startInstance } from './start.ts'
declare module '@tanstack/react-start' {
  interface Register {
    ssr: true
    router: Awaited<ReturnType<typeof getRouter>>
    config: Awaited<ReturnType<typeof startInstance.getOptions>>
  }
}`,
    ],
  },
  root,
)

await new Generator({ root, config }).run()