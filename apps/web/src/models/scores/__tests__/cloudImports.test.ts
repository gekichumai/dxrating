import { createHash } from 'node:crypto'
import { canonicalJson, type ImportJobDTO, ImportRecordSchema } from '@gekichumai/api-contract'
import { describe, expect, it } from 'vitest'
import type { PlayEntry } from '../../../components/rating/RatingCalculatorAddEntryForm'
import {
  canonicalSha256Hex,
  chunkImportRecords,
  chunkPayloadSha256,
  CLIENT_IMPORT_BODY_LIMIT_BYTES,
  clientImportBody,
  ImportTooLargeError,
  clientImportPlan,
  entriesToImportRecords,
  importInProgressJobId,
  isRetryableImportError,
  isSameServerImport,
} from '../cloudImports'

/** The backend's `canonicalSha256`: node:crypto over the shared `canonicalJson` */
const serverCanonicalSha256 = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex')

/**
 * Hashes the backend test pins for the same values (apps/backend/src/test/cloud-save-canonical-hash.test.ts), so a
 * change on either side that alters the bytes fails both
 */
const GOLDEN_CHUNK_SHA256 = '96ed5203f93af775e5355b41ac92f295508c208e8ed1e1474c276b06d20ad939'
const GOLDEN_NESTED_SHA256 = '2502e387e95e547fab446a7b2147d589ba621f0994994daf5ca9c692b7df22ce'

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
    const { records, skipped, duplicates } = entriesToImportRecords(
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
    expect(skipped).toBe(2)
    expect(duplicates).toBe(1)
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

  it('sends a best 50 hint only where the calculator honours it (Diving-Fish)', () => {
    const { records } = entriesToImportRecords(
      [
        { sheetId: 'dsht_e5nsvt8k2a', achievementRate: 99, source: { provider: 'lxns', best50Bucket: 'b15' } },
        { sheetId: 'dsht_5mk3yr8gme', achievementRate: 98, source: { provider: 'diving-fish', best50Bucket: 'b35' } },
      ],
      { source: 'dxrating-json', claimedSource: null },
    )
    expect(records.map((record) => [record.sheetId, record.best50Bucket])).toEqual([
      ['dsht_e5nsvt8k2a', null],
      ['dsht_5mk3yr8gme', 'b35'],
    ])
  })

  it('keeps the better flags of duplicates with an equal achievement, in either order', () => {
    const pick = (entries: PlayEntry[]) =>
      entriesToImportRecords(entries, { source: 'dxrating-json', claimedSource: null }).records.map((record) => [
        record.comboFlag,
        record.syncFlag,
      ])
    const fc: PlayEntry = { sheetId: 'dsht_e5nsvt8k2a', achievementRate: 100, comboFlag: 'fc' }
    const ap: PlayEntry = { sheetId: 'dsht_e5nsvt8k2a', achievementRate: 100, comboFlag: 'ap' }
    expect(pick([fc, ap])).toEqual([['ap', null]])
    expect(pick([ap, fc])).toEqual([['ap', null]])
    const fs: PlayEntry = { sheetId: 'dsht_e5nsvt8k2a', achievementRate: 100, syncFlag: 'fs' }
    const fsdp: PlayEntry = { sheetId: 'dsht_e5nsvt8k2a', achievementRate: 100, syncFlag: 'fsdp' }
    expect(pick([fs, fsdp])).toEqual([[null, 'fsdp']])
    expect(pick([fsdp, fs])).toEqual([[null, 'fsdp']])
  })

  it('never keeps an entry the server would reject, and counts it apart from the skipped ones', () => {
    const { records, skipped, rejected } = entriesToImportRecords(
      [
        { sheetId: 'dsht_e5nsvt8k2a', achievementRate: 99, dxScore: 100001 },
        { sheetId: 'dsht_5mk3yr8gme', achievementRate: 98, dxScore: 2400 },
        { sheetId: 'legacy__dx__master', achievementRate: 100 },
      ],
      { source: 'aqua-dx', claimedSource: null },
    )
    expect(records.map((record) => record.sheetId)).toEqual(['dsht_5mk3yr8gme'])
    expect(skipped).toBe(1)
    expect(rejected).toBe(1)
  })

  it('keeps a valid score of a chart whose best entry the server would reject', () => {
    const { records, rejected } = entriesToImportRecords(
      [
        { sheetId: 'dsht_e5nsvt8k2a', achievementRate: 100.5, dxScore: 100001 },
        { sheetId: 'dsht_e5nsvt8k2a', achievementRate: 99 },
      ],
      { source: 'aqua-dx', claimedSource: null },
    )
    expect(rejected).toBe(1)
    expect(records).toEqual([expect.objectContaining({ sheetId: 'dsht_e5nsvt8k2a', achievement: 990000 })])
  })
})

describe('chunkImportRecords', () => {
  const envelope = {
    id: 'dsav_one',
    idempotencyKey: 'key-1',
    source: 'dxrating-json',
    trigger: 'user',
    sourceAccountId: null,
  }
  const record = (index: number, providerRecordId: string | null = null) =>
    ImportRecordSchema.parse({
      sheetId: `dsht_${index
        .toString(36)
        .padStart(10, '2')
        .replace(/[01ilou]/g, '2')}`,
      achievement: 1000000,
      comboFlag: null,
      syncFlag: null,
      dxScore: null,
      best50Bucket: null,
      providerRecordId,
      claimedSource: null,
    })
  const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength

  it('keeps every exact request body under the limit, deterministically', () => {
    const records = Array.from({ length: 5000 }, (_, index) => record(index, '譜'.repeat(128)))
    const chunks = chunkImportRecords(records, envelope)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.flat()).toEqual(records)
    for (const [chunkIndex, chunk] of chunks.entries()) {
      const body = clientImportBody(
        { ...envelope, rawPayloadSha256: 'f'.repeat(64) },
        { chunkIndex, chunkCount: chunks.length, records: chunk },
      )
      expect(bytes(body)).toBeLessThanOrEqual(CLIENT_IMPORT_BODY_LIMIT_BYTES)
    }
    // A retry of the same key sends the same chunks
    expect(chunkImportRecords(records, envelope)).toEqual(chunks)
  })

  it('still splits at 5000 records when the bodies are small', () => {
    const records = Array.from({ length: 5001 }, (_, index) => record(index))
    expect(chunkImportRecords(records, envelope).map((chunk) => chunk.length)).toEqual([5000, 1])
  })

  it('throws before anything is sent for a record alone over the limit, or too many chunks', () => {
    const records = [record(1, '譜'.repeat(128))]
    const envelopeBytes = bytes(
      clientImportBody(
        { ...envelope, rawPayloadSha256: 'f'.repeat(64) },
        { chunkIndex: 9, chunkCount: 10, records: [] },
      ),
    )
    expect(() => chunkImportRecords(records, envelope, envelopeBytes + 10)).toThrow(
      expect.objectContaining({ reason: 'record-too-large' }),
    )
    const many = Array.from({ length: 11 }, (_, index) => record(index))
    const oneRecordEach = envelopeBytes + bytes(many[0])
    expect(() => chunkImportRecords(many, envelope, oneRecordEach)).toThrow(ImportTooLargeError)
    expect(() => chunkImportRecords(many, envelope, oneRecordEach)).toThrow(
      expect.objectContaining({ reason: 'too-many-chunks' }),
    )
  })
})

describe('rawPayloadSha256 (cross-check with the server)', () => {
  const entries: PlayEntry[] = [
    {
      sheetId: 'dsht_e5nsvt8k2a',
      achievementRate: 100.5,
      comboFlag: 'ap',
      dxScore: 2400,
      source: { provider: 'diving-fish', providerId: '譜面-🎵-ß', best50Bucket: 'b15' },
    },
    { sheetId: 'dsht_5mk3yr8gme', achievementRate: 98 },
  ]

  it('hashes a chunk exactly as the server hashes its accepted records', async () => {
    const { records } = entriesToImportRecords(entries, { source: 'dxrating-json', claimedSource: null })
    // What the server hashes: each record as ImportRecordSchema parses it, in the order sent
    const serverRecords = records.map((record) => ImportRecordSchema.parse(JSON.parse(JSON.stringify(record))))
    const hash = await chunkPayloadSha256(records)
    expect(hash).toBe(serverCanonicalSha256(serverRecords))
    expect(hash).toBe(GOLDEN_CHUNK_SHA256)
    // Nulls stay, keys are sorted, unicode is hashed as UTF-8
    expect(canonicalJson(records)).toBe(
      '[{"achievement":1005000,"best50Bucket":"b15","claimedSource":"diving-fish","comboFlag":"ap","dxScore":2400,' +
        '"providerRecordId":"譜面-🎵-ß","sheetId":"dsht_e5nsvt8k2a","syncFlag":null},{"achievement":980000,' +
        '"best50Bucket":null,"claimedSource":null,"comboFlag":null,"dxScore":null,"providerRecordId":null,' +
        '"sheetId":"dsht_5mk3yr8gme","syncFlag":null}]',
    )
  })

  it('keeps the records in the order sent, as the server does', async () => {
    const { records } = entriesToImportRecords(entries, { source: 'dxrating-json', claimedSource: null })
    const reversed = [...records].reverse()
    expect(await chunkPayloadSha256(reversed)).toBe(serverCanonicalSha256(reversed))
    expect(await chunkPayloadSha256(reversed)).not.toBe(await chunkPayloadSha256(records))
  })

  it('hashes nested objects, nulls, undefined and unicode like the server', async () => {
    const nested = { z: { b: [3, { y: null, x: 'é' }], a: '譜面 "quoted" \\ \u2028' }, a: 1, u: undefined }
    expect(await canonicalSha256Hex(nested)).toBe(serverCanonicalSha256(nested))
    expect(await canonicalSha256Hex(nested)).toBe(GOLDEN_NESTED_SHA256)
  })
})

describe('isSameServerImport', () => {
  const job = (overrides: Partial<ImportJobDTO>) =>
    ({ trigger: 'user', sourceAccountId: null, sourceAccountKind: null, ...overrides }) as ImportJobDTO

  it('adopts a job only for the same trigger and source account', () => {
    const identity = { trigger: 'user', account: { kind: 'df_username', id: 'alice' } } as const
    expect(isSameServerImport(job({ sourceAccountKind: 'df_username', sourceAccountId: 'alice' }), identity)).toBe(true)
    expect(isSameServerImport(job({ sourceAccountKind: 'df_username', sourceAccountId: 'bob' }), identity)).toBe(false)
    expect(isSameServerImport(job({ sourceAccountKind: 'df_qq', sourceAccountId: 'alice' }), identity)).toBe(false)
    expect(
      isSameServerImport(
        job({ trigger: 'auto', sourceAccountKind: 'df_username', sourceAccountId: 'alice' }),
        identity,
      ),
    ).toBe(false)
    // Not known yet: never adopted
    expect(isSameServerImport(job({}), identity)).toBe(false)
    expect(isSameServerImport(job({}), { trigger: 'user', account: null })).toBe(false)
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