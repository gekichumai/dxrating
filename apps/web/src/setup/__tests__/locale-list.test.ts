import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SUPPORTED_LOCALES } from '../locale'

// Adding a language takes the shared list (packages/api-contract/src/locales.ts), Paraglide's settings and a
// messages file. The settings are JSON and cannot import the list, so this keeps the three in step.
describe('supported locales', () => {
  const root = resolve(__dirname, '../../..')

  it('match the Paraglide project settings', () => {
    const settings = JSON.parse(readFileSync(resolve(root, 'project.inlang/settings.json'), 'utf8'))
    expect([...settings.locales].sort()).toEqual([...SUPPORTED_LOCALES].sort())
    expect(settings.baseLocale).toBe('en')
  })

  it.each(SUPPORTED_LOCALES)('%s has a messages file', (locale) => {
    expect(() => readFileSync(resolve(root, `messages/${locale}.json`), 'utf8')).not.toThrow()
  })
})