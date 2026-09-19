import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { createOneshotRenderer, type RenderInput } from '../src/index.js'
import { cases } from '../test/fixtures/cases.js'

const root = fileURLToPath(new URL('..', import.meta.url))
const fixtureDir = path.join(root, 'test/fixtures')
const baseDir = process.env.ASSETS_BASE_DIR
if (!baseDir) throw new Error('ASSETS_BASE_DIR is required. Visual verification never downloads or substitutes assets.')
const artifactDir = path.resolve(process.env.RENDER_ARTIFACT_DIR ?? path.join(root, 'artifacts'))
const readJson = async (name: string) => JSON.parse(await readFile(path.join(fixtureDir, name), 'utf8'))
const input = (await readJson('full.json')) as RenderInput
const expected = await readJson('goldens.json')
const hashes = (await readJson('assets.json')) as Record<string, string>
const assets = new Map<string, Buffer>()
const digest = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex')

for (const [assetPath, hash] of Object.entries(hashes)) {
  let buffer: Buffer
  try {
    buffer = await readFile(path.join(baseDir, assetPath))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || !process.env.ASSETS_LOCAL_CACHE_DIR) throw error
    buffer = await readFile(path.join(process.env.ASSETS_LOCAL_CACHE_DIR, assetPath))
  }
  assert.equal(
    digest(buffer),
    hash,
    `Asset changed: ${assetPath}. Restore the reference bytes before comparing engines.`,
  )
  assets.set(assetPath, buffer)
}
const render = createOneshotRenderer({
  revision: expected.revision,
  loadAsset: async (assetPath) => {
    const buffer = assets.get(assetPath)
    if (!buffer) throw new Error(`Unrecorded asset: ${assetPath}`)
    return buffer
  },
})

await mkdir(artifactDir, { recursive: true })
const results = []
let failures = 0
for (const test of cases(input)) {
  const baseline = expected.cases[test.name]
  for (const format of ['svg', 'png', 'jpeg'] as const) {
    const start = performance.now()
    const result = await render(test.input, { width: test.width, format })
    const duration = performance.now() - start
    const extension = format === 'jpeg' ? 'jpg' : format
    await writeFile(path.join(artifactDir, `${test.name}.${extension}`), result.body)
    let actual: string
    let reference: string
    if (format === 'svg') {
      actual = digest(result.body)
      reference = baseline.svg
    } else {
      const decoded = await sharp(result.body).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      assert.equal(decoded.info.width, baseline.width, `${test.name} width`)
      assert.equal(decoded.info.height, baseline.height, `${test.name} height`)
      actual = digest(decoded.data)
      reference = format === 'png' ? baseline.rgba : baseline.jpegRgba
    }
    const pass = actual === reference
    if (!pass) failures++
    results.push({ name: test.name, format, pass, duration, timings: result.timings, expected: reference, actual })
    console.log(`${pass ? 'PASS' : 'FAIL'} ${test.name} ${format}: ${duration.toFixed(1)} ms`)
  }
}
await writeFile(
  path.join(artifactDir, 'report.json'),
  JSON.stringify({ reference: expected.sourceCommit, results }, null, 2),
)
assert.equal(
  failures,
  0,
  `${failures} visual comparisons failed. Do not regenerate the baseline to accept an engine change.`,
)
console.log(`All ${results.length} comparisons match the original renderer exactly.`)