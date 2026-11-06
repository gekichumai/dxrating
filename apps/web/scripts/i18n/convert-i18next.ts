/**
 * Converts the i18next resources (src/locales/resources/<locale>.json) into inlang message files
 * (messages/<locale>.json) for Paraglide, then formats them with oxfmt. Run with `pnpm i18n:convert`; `--check` fails
 * when the committed message files differ in content (formatting aside) instead of writing them.
 *
 * - ids come from toMessageId (keys.ts); a collision fails the script
 * - `{{ name }}` becomes `{name}`
 * - `key_one` / `key_other` (or the bare `key` as the other form) become one message with plural variants on `count`
 * - `<tag>…</tag>` and `<tag />` become `{#tag}…{/tag}` and `{#tag/}` markup, rendered with ParaglideMessage
 */
import { execFileSync } from 'node:child_process'
import { isDeepStrictEqual } from 'node:util'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PLURAL_SUFFIXES, toMessageId } from './keys.ts'

const LOCALES = ['en', 'ja', 'ko', 'zh-Hans', 'zh-Hant'] as const
const BASE_LOCALE = 'en'

const webRoot = path.resolve(import.meta.dirname, '../..')
const resourcesDir = path.join(webRoot, 'src/locales/resources')
const messagesDir = path.join(webRoot, 'messages')

type Resources = Record<string, Record<string, string>>
type Variant = { declarations: string[]; selectors: string[]; match: Record<string, string> }
type MessageFile = Record<string, string | Variant[]>

const read = (locale: string): Resources => JSON.parse(readFileSync(path.join(resourcesDir, `${locale}.json`), 'utf8'))

function escapeText(text: string) {
  return text.replace(/[\\{}]/g, (c) => `\\${c}`)
}

/** An i18next string as an inlang pattern, plus the input names it reads. */
export function convertPattern(value: string): { pattern: string; inputs: string[] } {
  const inputs: string[] = []
  const token = /\{\{\s*([A-Za-z_$][\w$]*)\s*\}\}|<([A-Za-z][\w-]*)\s*\/>|<([A-Za-z][\w-]*)>|<\/([A-Za-z][\w-]*)>/g
  let out = ''
  let last = 0
  for (const match of value.matchAll(token)) {
    out += escapeText(value.slice(last, match.index))
    const [, input, selfClosing, open, close] = match
    if (input) {
      out += `{${input}}`
      if (!inputs.includes(input)) inputs.push(input)
    } else if (selfClosing) out += `{#${selfClosing}/}`
    else if (open) out += `{#${open}}`
    else if (close) out += `{/${close}}`
    last = match.index + match[0].length
  }
  out += escapeText(value.slice(last))
  return { pattern: out, inputs }
}

type Entry = { id: string; key: string; plural: boolean }

/** Every message id with the i18next key it comes from, in the base locale's order. */
export function collectEntries(base: Resources): Entry[] {
  const entries: Entry[] = []
  const byId = new Map<string, string>()
  const pluralSuffix = new RegExp(`_(${PLURAL_SUFFIXES.join('|')})$`)

  for (const [namespace, keys] of Object.entries(base)) {
    const pluralBases = new Set(
      Object.keys(keys)
        .filter((key) => pluralSuffix.test(key))
        .map((key) => key.replace(pluralSuffix, '')),
    )
    for (const key of Object.keys(keys)) {
      const plural = pluralSuffix.test(key) && pluralBases.has(key.replace(pluralSuffix, ''))
      const baseKey = plural ? key.replace(pluralSuffix, '') : key
      if (plural || pluralBases.has(key)) {
        if (entries.some((entry) => entry.key === `${namespace}:${baseKey}`)) continue
      }
      const id = toMessageId(namespace, baseKey)
      const fullKey = `${namespace}:${baseKey}`
      const existing = byId.get(id)
      if (existing && existing !== fullKey)
        throw new Error(`Message id ${id} is used by both ${existing} and ${fullKey}`)
      byId.set(id, fullKey)
      entries.push({ id, key: fullKey, plural: plural || pluralBases.has(key) })
    }
  }
  return entries
}

function convertLocale(resources: Resources, entries: Entry[]): MessageFile {
  const file: MessageFile = { $schema: 'https://inlang.com/schema/inlang-message-format' }
  for (const { id, key, plural } of entries) {
    const [namespace, baseKey] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)]
    const keys = resources[namespace] ?? {}
    if (!plural) {
      if (keys[baseKey] !== undefined) file[id] = convertPattern(keys[baseKey]).pattern
      continue
    }
    // i18next picks `key_<category>` from Intl.PluralRules and falls back to the bare key; `other` is the catch-all
    const forms: [string, string][] = []
    for (const category of PLURAL_SUFFIXES) {
      if (category === 'other') continue
      const value = keys[`${baseKey}_${category}`]
      if (value !== undefined) forms.push([`countPlural=${category}`, value])
    }
    const other = keys[`${baseKey}_other`] ?? keys[baseKey]
    if (other === undefined) {
      if (forms.length) throw new Error(`${key} has plural forms but no other form in a locale`)
      continue
    }
    forms.push(['countPlural=*', other])
    const inputs = new Set(['count'])
    const match: Record<string, string> = {}
    for (const [selector, value] of forms) {
      const converted = convertPattern(value)
      converted.inputs.forEach((input) => inputs.add(input))
      match[selector] = converted.pattern
    }
    file[id] = [
      {
        declarations: [...[...inputs].map((input) => `input ${input}`), 'local countPlural = count: plural'],
        selectors: ['countPlural'],
        match,
      },
    ]
  }
  return file
}

export function convertAll(): Record<string, MessageFile> {
  const entries = collectEntries(read(BASE_LOCALE))
  return Object.fromEntries(LOCALES.map((locale) => [locale, convertLocale(read(locale), entries)]))
}

if (import.meta.main) {
  const check = process.argv.includes('--check')
  const files: string[] = []
  let stale = false
  for (const [locale, content] of Object.entries(convertAll())) {
    const file = path.join(messagesDir, `${locale}.json`)
    if (!check) {
      writeFileSync(file, `${JSON.stringify(content, null, 2)}\n`)
      files.push(file)
      continue
    }
    let current: unknown = null
    try {
      current = JSON.parse(readFileSync(file, 'utf8'))
    } catch {}
    if (!isDeepStrictEqual(current, content)) {
      console.error(`messages/${locale}.json is out of date: run pnpm --filter @gekichumai/dxrating-web i18n:convert`)
      stale = true
    }
  }
  if (files.length) execFileSync('pnpm', ['exec', 'oxfmt', ...files], { cwd: webRoot, stdio: 'inherit' })
  if (stale) process.exit(1)
}