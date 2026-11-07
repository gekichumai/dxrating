// Bundles admin-api for Node. Workspace packages (@gekichumai/*) are bundled in, because the backend's exported
// modules are TypeScript with extensionless imports that Node cannot load (they are devDependencies for that reason);
// npm dependencies stay external.
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'

const { dependencies } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const external = Object.keys(dependencies)
  .filter((name) => !name.startsWith('@gekichumai/'))
  .flatMap((name) => [name, `${name}/*`])

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outdir: 'dist',
  platform: 'node',
  target: 'node26',
  format: 'esm',
  sourcemap: true,
  external,
})