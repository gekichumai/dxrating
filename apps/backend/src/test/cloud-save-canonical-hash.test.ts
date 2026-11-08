import { ImportRecordSchema } from '@gekichumai/api-contract'
import { describe, expect, it } from 'vitest'
import { canonicalSha256 } from '../services/cloud-save/jobs'

/**
 * The bytes `raw_payload_sha256` covers, pinned: the web client hashes the same values to the same hashes
 * (apps/web/src/models/scores/__tests__/cloudImports.test.ts) through the shared `canonicalJson`, so a change that
 * alters them on either side fails both
 */
describe('canonicalSha256 (shared with the web client)', () => {
  it('hashes a client-imports chunk of accepted records as the web client does', () => {
    const chunk = [
      {
        sheetId: 'dsht_e5nsvt8k2a',
        achievement: 1005000,
        comboFlag: 'ap',
        syncFlag: null,
        dxScore: 2400,
        best50Bucket: 'b15',
        providerRecordId: '譜面-🎵-ß',
        claimedSource: 'lxns',
      },
      {
        sheetId: 'dsht_5mk3yr8gme',
        achievement: 980000,
        comboFlag: null,
        syncFlag: null,
        dxScore: null,
        best50Bucket: null,
        providerRecordId: null,
        claimedSource: null,
      },
    ].map((record) => ImportRecordSchema.parse(record))
    expect(canonicalSha256(chunk)).toBe('d9e30a9e44e80eab99c2b4a2a8bcd50e4c49a1c33fa44f02d7327dd3b1773a88')
  })

  it('hashes nested objects, nulls, undefined and unicode as the web client does', () => {
    const nested = { z: { b: [3, { y: null, x: 'é' }], a: '譜面 "quoted" \\  ' }, a: 1, u: undefined }
    expect(canonicalSha256(nested)).toBe('2502e387e95e547fab446a7b2147d589ba621f0994994daf5ca9c692b7df22ce')
  })
})