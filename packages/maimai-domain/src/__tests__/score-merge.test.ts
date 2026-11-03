import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import manualMutationVectors from '../../test-vectors/manual-mutation.json'
import manualVerificationVectors from '../../test-vectors/manual-verification.json'
import mergeVectors from '../../test-vectors/score-merge.json'
import { buildVectors, serializeVectors } from '../../test-vectors/generate'
import {
  compareScore,
  decideImportMerge,
  decideManualMutation,
  manualVerification,
  type ExistingScoreRecord,
  type IncomingScoreRecord,
  type ManualMutation,
  type ScoreImportJob,
  type ScoreValue,
} from '../score-merge'
import { provenanceViolations, ProvenanceSchema } from '../score-provenance'

const label = <T extends { name: string }>(cases: T[]) => cases.map((vector) => [vector.name, vector] as const)

describe('test vectors', () => {
  it('are up to date with test-vectors/generate.ts', () => {
    for (const [file, vectors] of Object.entries(buildVectors())) {
      const checkedIn = readFileSync(new URL(`../../test-vectors/${file}`, import.meta.url), 'utf8')
      expect(checkedIn, `${file} is stale; run pnpm --filter @gekichumai/maimai-domain vectors`).toBe(
        serializeVectors(vectors),
      )
    }
  })

  it('only contain provenance the database accepts', () => {
    const provenances: unknown[] = []
    const collect = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(collect)
      else if (value !== null && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) {
          if (key === 'provenance') provenances.push(child)
          else collect(child)
        }
      }
    }
    collect([mergeVectors, manualMutationVectors, manualVerificationVectors])

    expect(provenances.length).toBeGreaterThan(100)
    for (const provenance of provenances) {
      const parsed = ProvenanceSchema.safeParse(provenance)
      expect(parsed.success, JSON.stringify(provenance)).toBe(true)
    }
  })
})

describe('compareScore', () => {
  it.each(label(mergeVectors.compareScore))('%s', (_name, vector) => {
    expect(compareScore(vector.a as ScoreValue, vector.b as ScoreValue)).toBe(vector.expected)
    expect(compareScore(vector.b as ScoreValue, vector.a as ScoreValue)).toBe(-vector.expected || 0)
  })

  it('treats missing flags as none', () => {
    expect(compareScore({ achievement: 1 }, { achievement: 1, comboFlag: null, syncFlag: null })).toBe(0)
  })
})

describe('decideImportMerge', () => {
  it.each(label(mergeVectors.decideImportMerge))('%s', (_name, vector) => {
    const decision = decideImportMerge(
      vector.existing as ExistingScoreRecord | null,
      vector.incoming as IncomingScoreRecord,
      vector.job as ScoreImportJob,
    )
    expect(decision).toEqual(vector.expected)
    if (decision.next) expect(provenanceViolations(decision.next.provenance)).toEqual([])
  })

  const job: ScoreImportJob = {
    id: 'dimp_x',
    source: 'lxns',
    fetchedBy: 'server',
    trigger: 'user',
    startedAt: '2026-11-03T00:00:00Z',
    fetchedAt: '2026-11-03T00:00:01Z',
    rawPayloadSha256: 'a'.repeat(64),
  }

  it('rejects jobs whose source cannot be fetched that way', () => {
    expect(() => decideImportMerge(null, { achievement: 1 }, { ...job, fetchedBy: 'client' })).toThrow()
    expect(() => decideImportMerge(null, { achievement: 1 }, { ...job, source: 'aqua-dx' })).toThrow()
  })

  it('rejects server jobs that could not produce verified provenance', () => {
    expect(() => decideImportMerge(null, { achievement: 1 }, { ...job, rawPayloadSha256: null })).toThrow()
    expect(() => decideImportMerge(null, { achievement: 1 }, { ...job, fetchedAt: undefined })).toThrow()
  })

  it('rejects achievements that are not integers in range', () => {
    expect(() => decideImportMerge(null, { achievement: 100.5 }, job)).toThrow(RangeError)
    expect(() => decideImportMerge(null, { achievement: 1010001 }, job)).toThrow(RangeError)
  })

  it('rejects invalid timestamps', () => {
    expect(() => decideImportMerge(null, { achievement: 1 }, { ...job, startedAt: 'yesterday' })).toThrow(RangeError)
  })
})

describe('manualVerification', () => {
  it.each(label(manualVerificationVectors.cases))('%s', (_name, vector) => {
    expect(manualVerification(vector.existing as ExistingScoreRecord | null)).toEqual(vector.expected)
  })
})

describe('decideManualMutation', () => {
  it.each(label(manualMutationVectors.cases))('%s', (_name, vector) => {
    const decision = decideManualMutation(
      vector.existing as ExistingScoreRecord | null,
      vector.mutation as unknown as ManualMutation,
    )
    expect(decision).toEqual(vector.expected)
    if (decision.next) expect(provenanceViolations(decision.next.provenance)).toEqual([])
  })
})