import type { RecordDTO } from '@gekichumai/api-contract'
import { describe, expect, it } from 'vitest'
import {
  checksumOf,
  cloudRecordToPlayEntry,
  cloudRecordToScoreRecord,
  manualEntryToSetValue,
  providerOfSource,
  recordFromDTO,
} from '../cloudScoreMapping'
import { uuidv7 } from '../uuidv7'
import { manualProvenance, verifiedProvenance } from './fakeCloudSaveServer'

const IDENTITY = { songId: 'dsng_kkx38yfx4t', type: 'dx', difficulty: 'master' } as const

const dto = (overrides: Partial<RecordDTO> = {}): RecordDTO => ({
  sheetId: 'dsht_e5nsvt8k2a',
  achievement: 1005432,
  comboFlag: 'fcp',
  syncFlag: 'fsd',
  dxScore: 2345,
  best50Bucket: 'b15',
  providerRecordId: '12345',
  provenance: verifiedProvenance({ source: 'diving-fish', importJobId: 'dimp_df' }),
  revision: 7,
  valueChangedAt: '2026-11-03T00:00:00.000Z',
  clientEditedAt: null,
  deletedAt: null,
  ...overrides,
})

describe('cloud score mapping', () => {
  it('maps a RecordDTO to a ScoreRecord with the integer achievement and its provenance', () => {
    expect(cloudRecordToScoreRecord(recordFromDTO(dto()), IDENTITY)).toEqual({
      sheetId: 'dsht_e5nsvt8k2a',
      identity: IDENTITY,
      achievement: 1005432,
      achievementRate: 100.5432,
      comboFlag: 'fcp',
      syncFlag: 'fsd',
      dxScore: 2345,
      best50Bucket: 'b15',
      provenance: verifiedProvenance({ source: 'diving-fish', importJobId: 'dimp_df' }),
    })
  })

  it('keeps best 50 hints of Diving-Fish records only, as the calculator does', () => {
    const net = recordFromDTO(dto({ provenance: verifiedProvenance() }))
    expect(cloudRecordToScoreRecord(net, IDENTITY).best50Bucket).toBeNull()
    expect(cloudRecordToPlayEntry(net, IDENTITY).source).toEqual({ provider: 'maimai-net', providerId: '12345' })
  })

  it('maps a RecordDTO to the calculator entry format', () => {
    expect(cloudRecordToPlayEntry(recordFromDTO(dto()), IDENTITY)).toEqual({
      sheetId: 'dsht_e5nsvt8k2a',
      identity: IDENTITY,
      achievementRate: 100.5432,
      comboFlag: 'fcp',
      syncFlag: 'fsd',
      dxScore: 2345,
      source: { provider: 'diving-fish', providerId: '12345', best50Bucket: 'b15' },
    })
    expect(
      cloudRecordToPlayEntry(
        recordFromDTO(dto({ provenance: manualProvenance(), dxScore: null, providerRecordId: null })),
        null,
      ),
    ).toEqual({ sheetId: 'dsht_e5nsvt8k2a', achievementRate: 100.5432, comboFlag: 'fcp', syncFlag: 'fsd' })
  })

  it('names the provider of import sources and none of manual or file sources', () => {
    expect(providerOfSource('maimai-net-intl')).toBe('maimai-net')
    expect(providerOfSource('lxns')).toBe('lxns')
    expect(providerOfSource('aqua-sqlite')).toBe('aqua-sqlite')
    expect(providerOfSource('manual')).toBeUndefined()
    expect(providerOfSource('dxrating-json')).toBeUndefined()
    expect(providerOfSource('legacy-local')).toBeUndefined()
  })

  it('turns a manual entry into a set value with an integer achievement', () => {
    expect(manualEntryToSetValue({ sheetId: 'dsht_e5nsvt8k2a', achievementRate: 100.5432 })).toEqual({
      achievement: 1005432,
      comboFlag: null,
      syncFlag: null,
      dxScore: null,
    })
    // Float noise of a typed rate is rounded to the integer grid
    expect(manualEntryToSetValue({ sheetId: 'x', achievementRate: 99.0001, comboFlag: 'ap', dxScore: 10 })).toEqual({
      achievement: 990001,
      comboFlag: 'ap',
      syncFlag: null,
      dxScore: 10,
    })
    expect(() => manualEntryToSetValue({ sheetId: 'x', achievementRate: -1 })).toThrow(RangeError)
    expect(() => manualEntryToSetValue({ sheetId: 'x', achievementRate: Number.NaN })).toThrow(RangeError)
  })

  it('checksums live records only', () => {
    expect(
      checksumOf([
        { achievement: 1000000, deletedAt: null },
        { achievement: 990000, deletedAt: '2026-11-03T00:00:00.000Z' },
        { achievement: 5, deletedAt: null },
      ]),
    ).toEqual({ count: 2, sumAchievement: 1000005 })
  })
})

describe('uuidv7', () => {
  it('encodes the time in the first 48 bits with the version and variant set', () => {
    const id = uuidv7(0x0123456789ab, (bytes) => bytes.fill(0xff))
    expect(id).toBe('01234567-89ab-7fff-bfff-ffffffffffff')
    expect(uuidv7()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('sorts by creation time', () => {
    expect(uuidv7(1000) < uuidv7(2000)).toBe(true)
  })
})