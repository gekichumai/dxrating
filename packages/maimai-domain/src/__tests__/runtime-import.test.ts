import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('runtime package import', () => {
  it('loads through Node transform-types from the backend workspace', () => {
    const backendCwd = fileURLToPath(new URL('../../../../apps/backend/', import.meta.url))

    expect(() => {
      execFileSync(
        process.execPath,
        [
          '--experimental-transform-types',
          '-e',
          "import('@gekichumai/maimai-domain').then((module) => { if (!module.calculateBest50) throw new Error('missing export') })",
        ],
        { cwd: backendCwd, stdio: 'pipe' },
      )
    }).not.toThrow()
  })
})