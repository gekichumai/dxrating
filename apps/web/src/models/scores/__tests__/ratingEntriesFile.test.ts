import { describe, expect, it } from 'vitest'
import { parseRatingFile } from '../ratingEntriesFile'

describe('parseRatingFile', () => {
  it('accepts an "all records" export as it was written, extra fields included', () => {
    const entries = [
      { sheetId: 'dsht_5mk3yr8gme', achievementRate: 99.1 },
      {
        sheetId: 'dsht_e5nsvt8k2a',
        identity: { songId: 'dsng_kkx38yfx4t', type: 'dx', difficulty: 'master' },
        achievementRate: 100.5432,
        comboFlag: 'ap',
        syncFlag: null,
        dxScore: 2345,
        source: { provider: 'maimai-net', providerSongName: '君の知らない物語', best50Bucket: 'b15' },
        providerConfig: { divingFish: { ratingEligibility: null } },
        somethingNewer: { kept: true },
      },
    ]
    expect(parseRatingFile(JSON.stringify(entries))).toEqual({ success: true, entries })
  })

  it('accepts a "Best 50" export and files from before public sheet IDs', () => {
    const entries = [
      { sheetId: 'dsht_5mk3yr8gme', achievementRate: 100 },
      {
        sheetId: '君の知らない物語__dxrt__dx__dxrt__master',
        identity: { songId: '君の知らない物語', type: 'dx', difficulty: 'master' },
        achievementRate: 0,
      },
    ]
    expect(parseRatingFile(JSON.stringify(entries))).toEqual({ success: true, entries })
  })

  it('keeps entries an earlier add form saved with an achievement out of range or not a number', () => {
    // `NaN` from an empty field is written as `null`; the range was not checked
    const entries = [
      { sheetId: 'dsht_5mk3yr8gme', achievementRate: null },
      { sheetId: 'dsht_e5nsvt8k2a', achievementRate: 150 },
      { sheetId: 'dsht_23456789ab', achievementRate: 101.5 },
      { sheetId: 'dsht_mpd82wyms9', achievementRate: -1 },
      { sheetId: 'dsht_5mk3yr8gme', achievementRate: 99.5 },
    ]
    expect(parseRatingFile(JSON.stringify(entries))).toEqual({ success: true, entries })
  })

  it('accepts an empty list', () => {
    expect(parseRatingFile('[]')).toEqual({ success: true, entries: [] })
  })

  it('drops malformed optional fields instead of rejecting the file', () => {
    const result = parseRatingFile(
      JSON.stringify([
        {
          sheetId: 'dsht_5mk3yr8gme',
          achievementRate: 99,
          comboFlag: '',
          syncFlag: 'fdx',
          identity: { songId: 'dsng_x' },
          dxScore: -3,
          source: 'lxns',
          providerConfig: { divingFish: { ratingEligibility: 'b50' } },
        },
      ]),
    )
    expect(result).toEqual({ success: true, entries: [{ sheetId: 'dsht_5mk3yr8gme', achievementRate: 99 }] })
  })

  it('rejects text that is not JSON', () => {
    expect(parseRatingFile('not json')).toMatchObject({ success: false, reason: 'invalid-json' })
  })

  it.each([
    ['an object', { entries: [] }],
    ['a string', 'dsht_5mk3yr8gme'],
    ['null', null],
    ['an AquaDX export', { userMusicDetailList: [{ musicId: 1, level: 3, achievement: 1005000 }] }],
    ['an entry without a sheet ID', [{ achievementRate: 99 }]],
    ['an empty sheet ID', [{ sheetId: '', achievementRate: 99 }]],
    ['an achievement as text', [{ sheetId: 'dsht_5mk3yr8gme', achievementRate: '99.5' }]],
    ['an entry without an achievement', [{ sheetId: 'dsht_5mk3yr8gme' }]],
    ['an entry that is not an object', [{ sheetId: 'dsht_5mk3yr8gme', achievementRate: 99 }, 42]],
  ])('rejects %s, importing nothing', (_, value) => {
    expect(parseRatingFile(JSON.stringify(value))).toMatchObject({ success: false, reason: 'invalid-structure' })
  })
})