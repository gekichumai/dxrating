import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { m } from '@/paraglide/messages'
import { SUPPORTED_LOCALES } from '@/setup/locale'

type Variant = { match: Record<string, string> }
type MessageFile = Record<string, string | Variant[]>

const read = (locale: string): MessageFile =>
  JSON.parse(readFileSync(path.resolve(__dirname, `../../../messages/${locale}.json`), 'utf8'))

const variants = (value: string | Variant[]): [string, string][] =>
  typeof value === 'string' ? [['*', value]] : value.flatMap((variant) => Object.entries(variant.match))

const DROPPED_ON_PURPOSE = [
  {
    id: 'song_seo_title',
    placeholder: '{level}',
    locales: ['ja', 'ko', 'zh-Hans', 'zh-Hant'],
    reason: '#406 chose CJK chart page titles that show the internal level alone (譜面定数14.7)',
  },
]

describe('messages/*.json', () => {
  it('translates every message in every locale, with no blank text', () => {
    const ids = Object.keys(read('en')).sort()
    for (const locale of SUPPORTED_LOCALES) {
      const file = read(locale)
      expect(Object.keys(file).sort(), `${locale} has missing or extra messages`).toEqual(ids)
      const blank = Object.entries(file)
        .filter(([id]) => id !== '$schema')
        .filter(([, value]) => variants(value).some(([, pattern]) => pattern.trim() === ''))
        .map(([id]) => id)
      expect(blank, `${locale} has blank messages`).toEqual([])
    }
  })

  it('keeps the count in `one` variants of locales whose `one` covers more than 1', () => {
    // CLDR's `one` is not `count === 1` everywhere: Filipino's covers 0, 2, 3, 5, 10, 50… So a `one` variant that says
    // "1 record" would misreport those counts there; it must print {count} whenever the `*` variant does
    for (const locale of SUPPORTED_LOCALES) {
      const rules = new Intl.PluralRules(locale)
      if (![0, 2, 3, 5, 21].some((n) => rules.select(n) === 'one')) continue
      const literal = Object.entries(read(locale))
        .filter((entry): entry is [string, Variant[]] => Array.isArray(entry[1]))
        .filter(([, variants]) =>
          variants.some(
            ({ match }) =>
              match['countPlural=*']?.includes('{count}') && !match['countPlural=one']?.includes('{count}'),
          ),
        )
        .map(([id]) => id)
      expect(literal, `${locale} has \`one\` variants without {count}`).toEqual([])
    }
  })

  it('uses exactly the placeholders and markup tags the English message has', () => {
    const en = read('en')
    // English `one` says "1 record", a translation's may print {count}; the test above says where it must
    const tokens = (key: string, ignored: string[], pattern = '') =>
      [...new Set(pattern.match(/\{[^}]*\}/g))]
        .filter((token) => key !== 'countPlural=one' || token !== '{count}')
        .filter((token) => !ignored.includes(token))
        .sort()
    for (const locale of SUPPORTED_LOCALES) {
      const mismatched = Object.entries(read(locale))
        .filter(([id]) => id !== '$schema')
        .flatMap(([id, value]) => {
          const english = Object.fromEntries(variants(en[id]))
          const ignored = DROPPED_ON_PURPOSE.filter((drop) => drop.id === id && drop.locales.includes(locale)).map(
            (drop) => drop.placeholder,
          )
          return variants(value)
            .map(([key, pattern]) => ({
              key,
              has: tokens(key, ignored, pattern),
              expected: tokens(key, ignored, english[key] ?? english['countPlural=*']),
            }))
            .filter(({ has, expected }) => has.join() !== expected.join())
            .map(
              ({ key, has, expected }) =>
                `${id} [${key}]: has ${has.join(' ') || 'none'}, English has ${expected.join(' ') || 'none'}`,
            )
        })
      expect(mismatched, `${locale} drops or adds placeholders or tags; use exactly the English ones`).toEqual([])
    }
  })

  it('uses reviewed Korean copy for creating and binding a SEGA ID', () => {
    expect(m.ratingCalculator_io_import_netRecords_dialog_help_register_title({}, { locale: 'ko' })).toBe(
      'SEGA ID가 아직 없어요',
    )
    expect(m.ratingCalculator_io_import_netRecords_dialog_help_register_step2({}, { locale: 'ko' })).toBe(
      '해당 SEGA ID로 maimai NET에 로그인한 뒤, 플레이에 사용하는 Aime 카드를 등록하세요.',
    )
  })

  it('uses reviewed image alt copy across locales', () => {
    expect(m.settings_versionAndRegion_logoAlt({ version: 'PRiSM PLUS' }, { locale: 'en' })).toBe('PRiSM PLUS logo')
    expect(m.sheet_versionTitleAlt({ version: 'PRiSM PLUS' }, { locale: 'en' })).toBe('PRiSM PLUS version logo')
    expect(m.about_version_logoAlt({ version: 'PRiSM PLUS' }, { locale: 'en' })).toBe('PRiSM PLUS logo')
    expect(m.global_dxRankAlt({ rank: 'SSS' }, { locale: 'en' })).toBe('Rank SSS')
    expect(m.sheet_coverArtAlt({ title: 'Song Title' }, { locale: 'zh-Hans' })).toBe('「Song Title」封面图')
    expect(m.sheet_versionTitleAlt({ version: 'PRiSM PLUS' }, { locale: 'zh-Hans' })).toBe('PRiSM PLUS 版本标志')
    expect(m.sheet_coverArtAlt({ title: 'Song Title' }, { locale: 'zh-Hant' })).toBe('「Song Title」封面圖')
    expect(m.sheet_versionTitleAlt({ version: 'PRiSM PLUS' }, { locale: 'zh-Hant' })).toBe('PRiSM PLUS 版本標誌')
  })

  it('pluralizes on count: one/other in English', () => {
    expect(m.toplists_count({ count: 1 }, { locale: 'en' })).toBe('1 chart')
    expect(m.toplists_count({ count: 2 }, { locale: 'en' })).toBe('2 charts')
    expect(m.toplists_count({ count: 0 }, { locale: 'en' })).toBe('0 charts')
  })
})