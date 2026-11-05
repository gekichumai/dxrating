import { describe, expect, it } from 'vitest'
import {
  CLIENT_IMPORT_SOURCES,
  fetchedByForSource,
  IMPORT_SOURCES,
  ImportSourceSchema,
  ProvenanceSchema,
  ProvenanceShapeSchema,
  SCORE_SOURCES,
  ScoreSourceSchema,
  SERVER_IMPORT_SOURCES,
} from '../score-provenance'

const verified = {
  source: 'maimai-net-jp',
  fetchedBy: 'server',
  verification: 'verified',
  entryMethod: 'import',
  importJobId: 'dimp_1',
  rawPayloadSha256: 'a'.repeat(64),
  fetchedAt: '2026-11-03T00:00:00.000Z',
} as const

describe('score provenance', () => {
  it('splits import sources into server and client sources', () => {
    expect(IMPORT_SOURCES).toEqual([...SERVER_IMPORT_SOURCES, ...CLIENT_IMPORT_SOURCES])
    expect(new Set(IMPORT_SOURCES).size).toBe(IMPORT_SOURCES.length)
    expect(SCORE_SOURCES).toContain('manual')
    expect(ImportSourceSchema.safeParse('manual').success).toBe(false)
    expect(ScoreSourceSchema.safeParse('demo').success).toBe(false)
    expect(SERVER_IMPORT_SOURCES.map(fetchedByForSource)).toEqual(SERVER_IMPORT_SOURCES.map(() => 'server'))
    expect(CLIENT_IMPORT_SOURCES.map(fetchedByForSource)).toEqual(CLIENT_IMPORT_SOURCES.map(() => 'client'))
  })

  it('fills omitted optional fields with null', () => {
    expect(ProvenanceSchema.parse(verified)).toEqual({
      ...verified,
      claimedSource: null,
      sourceAccountId: null,
      editedFromJobId: null,
    })
  })

  it('enforces the database invariants of verified provenance', () => {
    expect(ProvenanceSchema.safeParse({ ...verified, fetchedBy: 'client' }).success).toBe(false)
    expect(ProvenanceSchema.safeParse({ ...verified, importJobId: null }).success).toBe(false)
    expect(ProvenanceSchema.safeParse({ ...verified, rawPayloadSha256: undefined }).success).toBe(false)
    expect(ProvenanceSchema.safeParse({ ...verified, fetchedAt: null }).success).toBe(false)
    expect(ProvenanceSchema.safeParse({ ...verified, source: 'aqua-dx' }).success).toBe(false)
    expect(ProvenanceSchema.safeParse({ ...verified, source: 'manual' }).success).toBe(false)
    expect(ProvenanceShapeSchema.safeParse({ ...verified, fetchedBy: 'client' }).success).toBe(true)
  })

  it('accepts client-reported and user-edited provenance', () => {
    expect(
      ProvenanceSchema.safeParse({
        source: 'dxrating-json',
        claimedSource: 'lxns',
        fetchedBy: 'client',
        verification: 'client_reported',
        entryMethod: 'file',
      }).success,
    ).toBe(true)
    expect(
      ProvenanceSchema.safeParse({
        source: 'manual',
        fetchedBy: 'client',
        verification: 'user_edited',
        entryMethod: 'keypad',
        editedFromJobId: 'dimp_1',
      }).success,
    ).toBe(true)
  })

  it('rejects unknown values and malformed hashes', () => {
    expect(ProvenanceSchema.safeParse({ ...verified, entryMethod: 'scan' }).success).toBe(false)
    expect(ProvenanceSchema.safeParse({ ...verified, rawPayloadSha256: 'ABC' }).success).toBe(false)
    expect(ProvenanceSchema.safeParse({ ...verified, fetchedAt: 'yesterday' }).success).toBe(false)
  })
})