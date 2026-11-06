import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createInstance } from 'i18next'
import { describe, expect, it } from 'vitest'
import * as messages from '@/paraglide/messages/_index.js'
import type { MessagePart } from '@/paraglide/runtime'
import { getI18nInitOptions } from '@/setup/init-i18n'
import { SUPPORTED_LOCALES } from '@/setup/locale'
import { i18nResources } from '@/locales/locales'
import { collectEntries, convertAll, convertPattern } from '../../../scripts/i18n/convert-i18next.ts'

type Message = ((inputs?: Record<string, unknown>, options?: { locale?: string }) => string) & {
  parts?: (inputs?: Record<string, unknown>, options?: { locale?: string }) => MessagePart[]
}

const entries = collectEntries(i18nResources.en)
const counts = [0, 1, 2, 3, 5, 11, 21, 101]

/** Every interpolated name of a key, across all locales and plural forms. */
function inputsOf(key: string, plural: boolean): string[] {
  const [namespace, baseKey] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)]
  const names = new Set<string>()
  for (const resources of Object.values(i18nResources)) {
    for (const [k, value] of Object.entries((resources as Record<string, Record<string, string>>)[namespace] ?? {})) {
      if (k === baseKey || k.startsWith(`${baseKey}_`)) convertPattern(value).inputs.forEach((n) => names.add(n))
    }
  }
  if (plural) names.delete('count')
  return [...names]
}

/** A message rendered back to i18next's string form: markup as `<tag>…</tag>` / `<tag />`. */
function render(message: Message, inputs: Record<string, unknown>, locale: string) {
  if (!message.parts) return message(inputs, { locale })
  return message
    .parts(inputs, { locale })
    .map((part) => {
      if (part.type === 'text') return part.value
      if (part.type === 'markup-start') return `<${part.name}>`
      if (part.type === 'markup-end') return `</${part.name}>`
      return `<${part.name} />`
    })
    .join('')
}

describe('Paraglide messages match i18next', () => {
  for (const locale of SUPPORTED_LOCALES) {
    it(`renders every key identically in ${locale}`, () => {
      const i18n = createInstance()
      void i18n.init({ ...getI18nInitOptions(locale), initImmediate: false })
      const mismatches: string[] = []
      let checked = 0

      for (const { id, key, plural } of entries) {
        const message = (messages as unknown as Record<string, Message>)[id]
        if (!message) {
          mismatches.push(`${key}: no message ${id}`)
          continue
        }
        const base = Object.fromEntries(inputsOf(key, plural).map((name) => [name, `«${name}»`]))
        for (const inputs of plural ? counts.map((count) => ({ ...base, count })) : [base]) {
          const expected = i18n.t(key, inputs)
          const actual = render(message, inputs, locale)
          checked++
          if (actual !== expected)
            mismatches.push(`${key} ${JSON.stringify(inputs)}\n  i18next:   ${expected}\n  paraglide: ${actual}`)
        }
      }

      expect(mismatches).toEqual([])
      expect(checked).toBeGreaterThan(1000)
    })
  }
})

describe('messages/*.json', () => {
  it('are up to date with the i18next resources (pnpm i18n:convert)', () => {
    for (const [locale, content] of Object.entries(convertAll())) {
      const file = path.resolve(__dirname, `../../../messages/${locale}.json`)
      expect(JSON.parse(readFileSync(file, 'utf8')), locale).toEqual(content)
    }
  })
})