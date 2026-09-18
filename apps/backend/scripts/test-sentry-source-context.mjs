import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { build } from 'esbuild'

// Reproduce Docker's dist-only layout, then verify the source files restore snippets.
test('mapped TypeScript frames include source context when sources ship with the bundle', async () => {
  const directory = await mkdtemp(fileURLToPath(new URL('../.sentry-test-', import.meta.url)))
  const sourcePath = path.join(directory, 'src/fixture.ts')
  const source = `import * as Sentry from '@sentry/node'
Sentry.init({
  dsn: 'https://public@example.invalid/1',
  release: process.env.SENTRY_RELEASE,
  beforeSend(event) {
    console.log(JSON.stringify(event))
    return null
  },
})
function renderFixture(): never {
  throw new Error('Sentry source context verification')
}
try { renderFixture() } catch (error) { Sentry.captureException(error) }
await Sentry.close(5000)
`
  try {
    await mkdir(path.dirname(sourcePath))
    await writeFile(path.join(directory, 'package.json'), '{"type":"module"}')
    await symlink(
      fileURLToPath(new URL('../../../node_modules', import.meta.url)),
      path.join(directory, 'node_modules'),
    )
    await writeFile(sourcePath, source)
    await build({
      entryPoints: [sourcePath],
      outfile: path.join(directory, 'dist/fixture.js'),
      bundle: true,
      platform: 'node',
      target: 'node25',
      format: 'esm',
      packages: 'external',
      sourcemap: true,
    })
    const captureFrame = () => {
      const output = execFileSync(process.execPath, ['--enable-source-maps', 'dist/fixture.js'], {
        cwd: directory,
        env: { ...process.env, SENTRY_RELEASE: 'dxrating-backend@test-commit' },
        encoding: 'utf8',
      })
      const event = JSON.parse(output.trim())
      assert.equal(event.release, 'dxrating-backend@test-commit')
      return event.exception.values[0].stacktrace.frames.find((frame) => frame.function === 'renderFixture')
    }
    await rm(sourcePath)
    const missing = captureFrame()
    assert.equal(missing.filename, sourcePath)
    assert.equal(missing.context_line, undefined)

    await writeFile(sourcePath, source)
    const restored = captureFrame()
    assert.equal(restored.context_line.trim(), "throw new Error('Sentry source context verification')")
    assert.ok(restored.pre_context.length > 0)
    assert.ok(restored.post_context.length > 0)

    // The production image must preserve the same source layout as the builder.
    const dockerfile = await readFile(new URL('../Dockerfile', import.meta.url), 'utf8')
    assert.ok(dockerfile.includes('COPY --from=builder /app/apps/backend/src ./apps/backend/src'))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})