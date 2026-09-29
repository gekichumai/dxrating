import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { build, context } from 'esbuild'

const root = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(import.meta.url)
const watch = process.argv.includes('--watch')
const options = {
  absWorkingDir: root,
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  packages: 'external',
  platform: 'node',
  target: 'node25',
  format: 'esm',
  jsx: 'automatic',
  sourcemap: true,
  logLevel: 'info',
}

if (!watch) await rm(new URL('../dist', import.meta.url), { recursive: true, force: true })
const declarations = spawn(
  process.execPath,
  [
    require.resolve('typescript/bin/tsc'),
    '-p',
    'tsconfig.json',
    ...(watch ? ['--watch', '--preserveWatchOutput'] : []),
  ],
  { cwd: root, stdio: 'inherit' },
)

if (watch) {
  const bundler = await context(options)
  let stopping = false
  const stop = async () => {
    if (stopping) return
    stopping = true
    declarations.kill()
    await bundler.dispose()
  }
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, stop)
  declarations.once('error', (error) => {
    console.error(error)
    process.exitCode = 1
    void stop()
  })
  declarations.once('exit', (code) => {
    if (stopping) return
    process.exitCode = code ?? 1
    void stop()
  })
  await bundler.watch()
} else {
  const [code] = await once(declarations, 'exit')
  if (code !== 0) process.exit(code ?? 1)
  await build(options)
}