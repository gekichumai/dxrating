// @vitest-environment node

import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const sourceRoot = fileURLToPath(new URL('.', import.meta.url))
const prohibited = [
  /@mui\//,
  /@emotion\//,
  /(?:@unocss\/|\bunocss(?:\b|-)|virtual:uno\.css)/,
  /posthog-js/,
  /(?:apps\/web|(?:\.\.\/)+web(?:\/|['"]))/,
]

const collectSourceFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = `${directory}/${entry.name}`
      if (entry.isDirectory()) return collectSourceFiles(path)
      if (entry.name === 'architecture.test.ts') return []
      return /\.(?:css|ts|tsx)$/.test(entry.name) ? [path] : []
    }),
  )
  return files.flat()
}

describe('administrator presentation boundary', () => {
  it('keeps prohibited public-web stacks out of dependencies and source imports', async () => {
    const packageJson = JSON.parse(await readFile(`${packageRoot}/package.json`, 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const dependencyNames = Object.keys({ ...packageJson.dependencies, ...packageJson.devDependencies })
    for (const pattern of prohibited) expect(dependencyNames.some((name) => pattern.test(name))).toBe(false)

    const sourceFiles = await collectSourceFiles(sourceRoot)
    for (const path of sourceFiles) {
      const source = await readFile(path, 'utf8')
      for (const pattern of prohibited) expect(pattern.test(source), `${pattern} found in ${path}`).toBe(false)
    }
  })
})