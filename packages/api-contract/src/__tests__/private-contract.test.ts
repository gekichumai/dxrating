import { getOpenAPIMeta } from '@orpc/openapi'
import { ProcedureContract, type AnyContractRouter } from '@orpc/contract'
import { describe, expect, it } from 'vitest'
import { publicAppContract, publicContractRoutes } from '../contract.ts'
import { CloudSaveOptInInputSchema, privateContractRoutes } from '../private/index.ts'

const procedures = (router: AnyContractRouter, path: string[] = []): Array<[string, AnyContractRouter]> =>
  router instanceof ProcedureContract
    ? [[path.join('.'), router]]
    : Object.entries(router).flatMap(([key, value]) => procedures(value as AnyContractRouter, [...path, key]))

describe('privateContractRoutes', () => {
  it('tags every private route internal, and each with its own domain', () => {
    const entries = procedures(privateContractRoutes)
    expect(entries.map(([path]) => path)).toEqual([
      'features.get',
      'features.optInCloudSave',
      'cloudSave.saves.list',
      'cloudSave.saves.create',
      'cloudSave.saves.update',
      'cloudSave.saves.delete',
      'cloudSave.records.changes',
      'cloudSave.records.mutate',
      'cloudSave.records.events',
      'cloudSave.records.replace',
      'cloudSave.imports.client',
      'cloudSave.imports.lxns',
      'cloudSave.imports.divingFish',
      'cloudSave.imports.get',
      'cloudSave.imports.list',
      'cloudSave.snapshots.create',
      'cloudSave.snapshots.list',
      'cloudSave.export',
      'sessions.list',
      'sessions.revoke',
    ])
    for (const [path, procedure] of entries) {
      const domain = path.startsWith('sessions.') ? 'account' : 'cloud-save'
      expect(getOpenAPIMeta(procedure as never)?.tags).toEqual(expect.arrayContaining(['internal', domain]))
    }
  })

  it('stays out of the browser-callable public contract', () => {
    for (const key of Object.keys(privateContractRoutes)) {
      expect(key in publicContractRoutes).toBe(false)
      expect(key in publicAppContract).toBe(false)
    }
  })

  it('accepts only a consent version on opt-in', () => {
    expect(CloudSaveOptInInputSchema.parse({ consentVersion: '2026-11-01' })).toEqual({
      consentVersion: '2026-11-01',
    })
    expect(CloudSaveOptInInputSchema.safeParse({}).success).toBe(false)
    expect(CloudSaveOptInInputSchema.safeParse({ consentVersion: '' }).success).toBe(false)
    expect(CloudSaveOptInInputSchema.safeParse({ consentVersion: 'v1', source: 'admin' }).success).toBe(false)
    expect(CloudSaveOptInInputSchema.safeParse({ consentVersion: 'x'.repeat(65) }).success).toBe(false)
  })
})