import { describe, expect, it } from 'vitest'
import {
  canonicalImportBody,
  clientImportPlan,
  entriesToImportRecords,
  importInProgressJobId,
  isRetryableImportError,
} from '../cloudImports'

describe('clientImportPlan', () => {
  it('maps files to the client vocabulary and server sources to nothing while the server imports them', () => {
    expect(clientImportPlan('aqua-dx', true)).toEqual({ source: 'aqua-dx', claimedSource: null })
    expect(clientImportPlan('mu-net', true)).toEqual({ source: 'mu-net', claimedSource: null })
    expect(clientImportPlan('aqua-sqlite', true)).toEqual({ source: 'aqua-sqlite', claimedSource: null })
    expect(clientImportPlan('dxrating-json', true)).toEqual({ source: 'dxrating-json', claimedSource: null })
    expect(clientImportPlan('maimai-net', true)).toBeNull()
    expect(clientImportPlan('lxns', true)).toBeNull()
    expect(clientImportPlan('diving-fish', true)).toBeNull()
    expect(clientImportPlan('maimai-net', false)).toEqual({ source: 'legacy-local', claimedSource: 'maimai-net' })
  })
})

describe('entriesToImportRecords', () => {
  it('keeps one record per chart (the best), public sheet IDs and valid achievements only', () => {
    const { records, skipped } = entriesToImportRecords(
      [
        { sheetId: 'dsht_e5nsvt8k2a', achievementRate: 99 },
        { sheetId: 'dsht_e5nsvt8k2a', achievementRate: 100.5, comboFlag: 'ap', dxScore: 2400 },
        { sheetId: 'legacy__dx__master', achievementRate: 100 },
        { sheetId: 'dsht_5mk3yr8gme', achievementRate: 120 },
        {
          sheetId: 'dsht_5mk3yr8gme',
          achievementRate: 98,
          source: { provider: 'diving-fish', providerId: 42, best50Bucket: 'b35' },
        },
      ],
      { source: 'dxrating-json', claimedSource: null },
    )
    expect(skipped).toBe(3)
    expect(records).toEqual([
      {
        sheetId: 'dsht_e5nsvt8k2a',
        achievement: 1005000,
        comboFlag: 'ap',
        syncFlag: null,
        dxScore: 2400,
        best50Bucket: null,
        providerRecordId: null,
        claimedSource: null,
      },
      {
        sheetId: 'dsht_5mk3yr8gme',
        achievement: 980000,
        comboFlag: null,
        syncFlag: null,
        dxScore: null,
        best50Bucket: 'b35',
        providerRecordId: '42',
        claimedSource: 'diving-fish',
      },
    ])
  })

  it('hashes the same body whatever the order of the records', () => {
    const [a, b] = entriesToImportRecords(
      [
        { sheetId: 'dsht_e5nsvt8k2a', achievementRate: 99 },
        { sheetId: 'dsht_5mk3yr8gme', achievementRate: 98 },
      ],
      { source: 'aqua-dx', claimedSource: null },
    ).records
    expect(canonicalImportBody([a!, b!])).toBe(canonicalImportBody([b!, a!]))
  })
})

describe('import errors', () => {
  it('reads the running job of a 409 IMPORT_IN_PROGRESS', () => {
    expect(
      importInProgressJobId({ status: 409, code: 'CONFLICT', data: { reason: 'IMPORT_IN_PROGRESS', jobId: 'dimp_1' } }),
    ).toBe('dimp_1')
    expect(importInProgressJobId({ status: 409, data: { reason: 'SAVE_LIMIT', limit: 10 } })).toBeNull()
    expect(importInProgressJobId(new Error('x'))).toBeNull()
  })

  it('retries no answer, 5xx and 429, never another 4xx', () => {
    expect(isRetryableImportError(new TypeError('Failed to fetch'))).toEqual({ retry: true })
    expect(isRetryableImportError({ status: 502 })).toEqual({ retry: true })
    expect(isRetryableImportError({ status: 429, data: { retryAfterSeconds: 3 } })).toEqual({
      retry: true,
      afterMs: 3000,
    })
    expect(isRetryableImportError({ status: 400 })).toEqual({ retry: false })
    expect(isRetryableImportError({ status: 409 })).toEqual({ retry: false })
  })
})