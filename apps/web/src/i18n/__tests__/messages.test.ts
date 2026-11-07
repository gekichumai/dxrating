import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { m } from '@/paraglide/messages'
import { SUPPORTED_LOCALES } from '@/setup/locale'

type Variant = { match: Record<string, string> }
type MessageFile = Record<string, string | Variant[]>

const read = (locale: string): MessageFile =>
  JSON.parse(readFileSync(path.resolve(__dirname, `../../../messages/${locale}.json`), 'utf8'))

/** Every pattern of a message: the string, or each plural form */
const patterns = (value: string | Variant[]) =>
  typeof value === 'string' ? [value] : value.flatMap((variant) => Object.values(variant.match))

describe('messages/*.json', () => {
  it('translates every message in every locale, with no blank text', () => {
    const ids = Object.keys(read('en')).sort()
    for (const locale of SUPPORTED_LOCALES) {
      const file = read(locale)
      expect(Object.keys(file).sort(), `${locale} has missing or extra messages`).toEqual(ids)
      const blank = Object.entries(file)
        .filter(([id]) => id !== '$schema')
        .filter(([, value]) => patterns(value).some((pattern) => pattern.trim() === ''))
        .map(([id]) => id)
      expect(blank, `${locale} has blank messages`).toEqual([])
    }
  })

  it('uses only the placeholders and markup tags the English message has', () => {
    const en = read('en')
    const tokens = (pattern: string) => pattern.match(/\{[^}]*\}/g) ?? []
    for (const locale of SUPPORTED_LOCALES) {
      const file = read(locale)
      const unknown = Object.entries(file)
        .filter(([id]) => id !== '$schema')
        .flatMap(([id, value]) => {
          const known = new Set(patterns(en[id]).flatMap(tokens))
          return patterns(value)
            .flatMap(tokens)
            .filter((token) => !known.has(token))
            .map((token) => `${id}: ${token}`)
        })
      expect(unknown, `${locale} has placeholders or tags English doesn't`).toEqual([])
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