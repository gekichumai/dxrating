import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createGenerator } from 'unocss'
import { describe, expect, it } from 'vitest'

const tokensCss = readFileSync(resolve(__dirname, '../tokens.css'), 'utf8')
const GLASS_CLASSES = [
  'glass',
  'glass-thin',
  'glass-inset',
  'glass-overlay',
  'material-surface',
  'material-surface-thin',
]

describe('tinted-glass surfaces', () => {
  it('styles the material on the class names used in markup, not on classes a shortcut would have to expand', () => {
    for (const name of [...GLASS_CLASSES, 'glass-bar']) {
      expect(tokensCss, name).toMatch(new RegExp(`\\.${name}[,\\s{]`))
    }
  })

  it('generates the radius for every glass shortcut without unmatched utilities', async () => {
    // uno.config.ts belongs to the node tsconfig project, so load it at runtime rather than through a typed import
    const configPath: string = '../../../uno.config'
    const { default: unoConfig } = await import(/* @vite-ignore */ configPath)
    const generator = await createGenerator(unoConfig)
    const { css, matched } = await generator.generate(GLASS_CLASSES.join(' '), { preflights: false })
    for (const name of GLASS_CLASSES) {
      expect(matched.has(name), name).toBe(true)
      expect(css).toMatch(new RegExp(`\\.${name}[,)][^{]*\\{border-radius:var\\(--radius-`))
    }
  })

  it('lets the document locale font stack win over the default root font', () => {
    expect(tokensCss).toMatch(/html\[lang\|='ja'\]/)
    expect(tokensCss).toMatch(/html\[lang='zh-Hans'\]/)
    expect(tokensCss).toMatch(/html\[lang='zh-Hant'\]/)
  })
})