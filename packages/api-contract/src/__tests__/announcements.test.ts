import { describe, expect, it } from 'vitest'
import { AnnouncementCreateInputSchema, AnnouncementUpdateInputSchema } from '../announcements'

// The admin API validates writes with these schemas
const fields = (overrides: Record<string, unknown> = {}) => ({
  severity: 'warning',
  title: { en: 'Scheduled maintenance', ja: 'メンテナンス' },
  body: { en: 'Imports pause for an hour.' },
  link: { url: '/developers', label: { en: 'Details' } },
  startsAt: null,
  endsAt: null,
  platforms: [],
  regions: [],
  minAppVersion: null,
  maxAppVersion: null,
  dismissible: true,
  ...overrides,
})

describe('announcement write schemas', () => {
  it('accepts a complete announcement', () => {
    expect(AnnouncementCreateInputSchema.safeParse(fields()).success).toBe(true)
    expect(AnnouncementUpdateInputSchema.safeParse({ ...fields(), id: 3 }).success).toBe(true)
  })

  it('targets every dxdata server, USA included', () => {
    const parsed = AnnouncementCreateInputSchema.parse(
      fields({ regions: ['jp', 'intl', 'usa', 'cn'], platforms: ['ios'] }),
    )
    expect(parsed.regions).toEqual(['jp', 'intl', 'usa', 'cn'])
  })

  it('drops blank translations and trims the rest', () => {
    const parsed = AnnouncementCreateInputSchema.parse(fields({ title: { en: ' Hi ', ja: '   ' } }))
    expect(parsed.title).toEqual({ en: 'Hi' })
  })

  it.each([
    ['without English', { title: { ja: 'お知らせ' } }],
    ['with only blank English', { title: { en: '  ' } }],
    ['with an unknown language tag', { title: { en: 'Hi', 'xx-YY': 'Hi' } }],
    ['with a script link', { link: { url: 'javascript:alert(1)', label: null } }],
    ['with an http link', { link: { url: 'http://example.com', label: null } }],
    ['with a protocol-relative link', { link: { url: '//evil.example', label: null } }],
    ['ending before it starts', { startsAt: '2030-01-02T00:00:00Z', endsAt: '2030-01-01T00:00:00Z' }],
    ['with inverted app versions', { minAppVersion: '1.10', maxAppVersion: '1.9' }],
    ['with a malformed version', { minAppVersion: '1.x' }],
    ['with an unknown platform', { platforms: ['android'] }],
    ['with an unknown region', { regions: ['eu'] }],
    ['with an unknown field', { createdBy: 'someone' }],
    ['with a title too long', { title: { en: 'x'.repeat(81) } }],
  ])('rejects one %s', (_case, overrides) => {
    expect(AnnouncementCreateInputSchema.safeParse(fields(overrides)).success).toBe(false)
  })
})