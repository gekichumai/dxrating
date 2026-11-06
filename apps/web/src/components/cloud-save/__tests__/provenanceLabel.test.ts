import type { Provenance } from '@gekichumai/maimai-domain'
import i18n from 'i18next'
import { beforeAll, describe, expect, it } from 'vitest'
import { initI18n } from '@/setup/init-i18n'
import { describeProvenance, labelSeparator, shortAccountId } from '../provenanceLabel'

const base: Provenance = {
  source: 'manual',
  claimedSource: null,
  fetchedBy: 'client',
  verification: 'client_reported',
  entryMethod: 'typed',
  sourceAccountId: null,
  importJobId: null,
  rawPayloadSha256: null,
  fetchedAt: null,
  editedFromJobId: null,
}

const verified = (overrides: Partial<Provenance>): Provenance => ({
  ...base,
  source: 'maimai-net-jp',
  fetchedBy: 'server',
  verification: 'verified',
  entryMethod: 'import',
  importJobId: 'dimp_1',
  rawPayloadSha256: 'a'.repeat(64),
  // Midday UTC: the same calendar day in every time zone the tests run in
  fetchedAt: '2026-11-02T12:00:00.000Z',
  ...overrides,
})

describe('describeProvenance', () => {
  beforeAll(async () => {
    initI18n()
    await i18n.changeLanguage('en')
  })
  const t = (...args: Parameters<typeof i18n.t>) => i18n.t(...args)

  it('reads a verified maimai NET record with a short friend code and the fetch date', () => {
    expect(describeProvenance(verified({ sourceAccountId: '123456789012345' }), t as never)).toEqual({
      kind: 'verified',
      text: 'Verified · maimai NET (JP) · friend code 1234… · fetched 2026-11-02',
    })
  })

  it('names LXNS and Diving-Fish accounts, and hides hashed account IDs', () => {
    expect(describeProvenance(verified({ source: 'lxns', sourceAccountId: '987654321' }), t as never).text).toBe(
      'Verified · LXNS · friend code 9876… · fetched 2026-11-02',
    )
    expect(describeProvenance(verified({ source: 'diving-fish', sourceAccountId: 'player' }), t as never).text).toBe(
      'Verified · Diving-Fish · account play… · fetched 2026-11-02',
    )
    expect(describeProvenance(verified({ sourceAccountId: 'f'.repeat(64) }), t as never).text).toBe(
      'Verified · maimai NET (JP) · fetched 2026-11-02',
    )
  })

  it('reads a claimed source as claimed and not verified, never as verified', () => {
    const claimed = { ...base, source: 'dxrating-json', claimedSource: 'lxns', entryMethod: 'file' } as const
    expect(describeProvenance(claimed, t as never)).toEqual({
      kind: 'file',
      text: 'From file (claimed: LXNS) · not verified',
    })
    expect(describeProvenance({ ...base, source: 'aqua-dx', entryMethod: 'file' }, t as never).text).toBe(
      'From file (AquaDX) · not verified',
    )
    expect(
      describeProvenance(
        { ...base, source: 'legacy-local', claimedSource: 'maimai-net', entryMethod: 'migration' },
        t as never,
      ).text,
    ).toBe('From this device (claimed: maimai NET) · not verified')
  })

  it('only verification === verified reads as verified', () => {
    // A server source the client reported (the §7.4 fallback never produces this, but nothing may upgrade it)
    const reported = { ...verified({}), verification: 'client_reported', fetchedBy: 'client' } as const
    expect(describeProvenance(reported, t as never).kind).toBe('file')
    expect(describeProvenance(reported, t as never).text).not.toMatch(/Verified/)
  })

  it('reads manual and edited records', () => {
    expect(describeProvenance(base, t as never)).toEqual({ kind: 'manual', text: 'Manual' })
    expect(describeProvenance({ ...base, verification: 'user_edited', editedFromJobId: 'dimp_1' }, t as never)).toEqual(
      { kind: 'edited', text: 'Edited (originally imported)' },
    )
  })

  it('translates the wording, joined with the full-width middle dot in Japanese and Chinese', async () => {
    await i18n.changeLanguage('zh-Hans')
    expect(describeProvenance(verified({ sourceAccountId: '123456789' }), t as never, 'zh-Hans').text).toBe(
      '已验证・maimai NET (JP)・好友码 1234…・2026-11-02 抓取',
    )
    await i18n.changeLanguage('ja')
    // No space after the full-width bracket: the bracket and the dot carry their own spacing
    expect(
      describeProvenance(
        { ...base, source: 'dxrating-json', claimedSource: 'lxns', entryMethod: 'file' },
        t as never,
        'ja',
      ).text,
    ).toBe('ファイルから（自己申告：LXNS）・未検証')
    await i18n.changeLanguage('zh-Hant')
    expect(describeProvenance({ ...base, source: 'aqua-dx', entryMethod: 'file' }, t as never, 'zh-Hant').text).toBe(
      '來自檔案（AquaDX）・未驗證',
    )
    await i18n.changeLanguage('en')
  })
})

describe('labelSeparator', () => {
  it('spaces a middle dot in Latin and Korean text', () => {
    expect(labelSeparator('en')).toBe(' · ')
    expect(labelSeparator('ko')).toBe(' · ')
    expect(labelSeparator(undefined)).toBe(' · ')
  })

  it('uses the full-width middle dot, unspaced, in Japanese and Chinese', () => {
    for (const language of ['ja', 'ja-JP', 'zh-Hans', 'zh-Hant', 'zh']) expect(labelSeparator(language)).toBe('・')
  })

  it('does not mistake other languages for CJK', () => {
    expect(labelSeparator('jav')).toBe(' · ')
    expect(labelSeparator('zha')).toBe(' · ')
  })
})

describe('shortAccountId', () => {
  it('keeps a short prefix only', () => {
    expect(shortAccountId('123456789012345')).toBe('1234…')
    expect(shortAccountId(null)).toBeNull()
  })
})