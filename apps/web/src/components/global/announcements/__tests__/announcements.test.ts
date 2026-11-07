import type { PublicAnnouncement } from '@gekichumai/api-contract'
import { describe, expect, it } from 'vitest'
import {
  DISMISSED_ANNOUNCEMENTS_STORAGE_KEY,
  isSiteLink,
  localizeAnnouncement,
  readDismissed,
  visibleAnnouncements,
  writeDismissed,
} from '../announcements'

const NOW = Date.parse('2026-11-08T12:00:00Z')

const announcement = (overrides: Partial<PublicAnnouncement> = {}): PublicAnnouncement => ({
  id: 1,
  revision: 1,
  severity: 'info',
  title: { en: 'Maintenance', 'zh-Hans': '维护' },
  body: { en: 'Imports pause for an hour.' },
  link: null,
  startsAt: '2026-11-08T00:00:00Z',
  endsAt: null,
  platforms: [],
  regions: [],
  minAppVersion: null,
  maxAppVersion: null,
  dismissible: true,
  ...overrides,
})

const viewer = { platform: 'web' as const, region: 'jp', now: NOW, dismissed: {} }

describe('visibleAnnouncements', () => {
  it('shows a current announcement for everyone', () => {
    expect(visibleAnnouncements([announcement()], viewer)).toHaveLength(1)
  })

  it.each([
    ['not started', { startsAt: '2026-11-08T13:00:00Z' }],
    ['ended', { endsAt: '2026-11-08T11:59:00Z' }],
    ['for iOS only', { platforms: ['ios'] as PublicAnnouncement['platforms'] }],
    ['for another region', { regions: ['intl', 'cn'] as PublicAnnouncement['regions'] }],
  ])('hides one that is %s', (_case, overrides) => {
    expect(visibleAnnouncements([announcement(overrides)], viewer)).toEqual([])
  })

  it('shows one targeted at this platform and region', () => {
    const targeted = announcement({ platforms: ['web'], regions: ['jp'] })
    expect(visibleAnnouncements([targeted], viewer)).toEqual([targeted])
  })

  it('hides a dismissed revision and shows the next one again', () => {
    const dismissed = { 1: 1 }
    expect(visibleAnnouncements([announcement()], { ...viewer, dismissed })).toEqual([])
    expect(visibleAnnouncements([announcement({ revision: 2 })], { ...viewer, dismissed })).toHaveLength(1)
  })

  it('keeps showing a non-dismissible announcement even if a stale dismissal matches', () => {
    const critical = announcement({ severity: 'critical', dismissible: false })
    expect(visibleAnnouncements([critical], { ...viewer, dismissed: { 1: 1 } })).toEqual([critical])
  })

  it('shows at most two, in the server’s order', () => {
    const list = [announcement({ id: 3 }), announcement({ id: 2 }), announcement({ id: 1 })]
    expect(visibleAnnouncements(list, viewer).map((a) => a.id)).toEqual([3, 2])
  })
})

describe('localizeAnnouncement', () => {
  it('uses the viewer’s language, then its fallbacks, then English', () => {
    const fallbacks = { 'zh-Hant': ['zh-Hans'] }
    expect(localizeAnnouncement(announcement(), 'zh-Hant', fallbacks).title).toEqual({
      locale: 'zh-Hans',
      value: '维护',
    })
    expect(localizeAnnouncement(announcement(), 'ja', fallbacks).title).toEqual({ locale: 'en', value: 'Maintenance' })
    expect(localizeAnnouncement(announcement(), 'ja', fallbacks).linkLabel).toBeNull()
  })
})

describe('dismissal storage', () => {
  const memory = () => {
    const values = new Map<string, string>()
    return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
    }
  }

  it('round-trips and forgets announcements no longer served', () => {
    const storage = memory()
    const kept = writeDismissed(storage, { 1: 2, 9: 1 }, [announcement({ id: 1 })])
    expect(kept).toEqual({ 1: 2 })
    expect(readDismissed(storage)).toEqual({ 1: 2 })
  })

  it.each(['not json', '[1,2]', '{"1":"x"}', 'null'])('reads %s as nothing dismissed', (stored) => {
    const storage = memory()
    storage.setItem(DISMISSED_ANNOUNCEMENTS_STORAGE_KEY, stored)
    expect(readDismissed(storage)).toEqual({})
  })

  it('survives storage that throws', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(readDismissed(throwing)).toEqual({})
    expect(writeDismissed(throwing, { 1: 1 }, [announcement()])).toEqual({ 1: 1 })
  })
})

it('treats paths as site links and anything else as external', () => {
  expect(isSiteLink('/songs/dsng_x')).toBe(true)
  expect(isSiteLink('//evil.example')).toBe(false)
  expect(isSiteLink('https://example.com')).toBe(false)
})