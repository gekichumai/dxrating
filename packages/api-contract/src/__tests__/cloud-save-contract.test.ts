import { ProcedureContract, type AnyContractRouter } from '@orpc/contract'
import { getOpenAPIMeta, OpenAPIGenerator } from '@orpc/openapi'
import { ZodToJsonSchemaConverter } from '@orpc/zod'
import { describe, expect, it } from 'vitest'
import { publicAppContract, publicContractRoutes } from '../contract.ts'
import { isPublicSpecProcedure } from '../spec-filter.ts'
import {
  ChangesInputSchema,
  ClientImportInputSchema,
  CLOUD_SAVE_MAX_SNAPSHOT_DETAIL_LENGTH,
  cloudSaveContract,
  CreateSnapshotInputSchema,
  CreateSaveInputSchema,
  DivingFishImportInputSchema,
  ImportRecordSchema,
  MutationSchema,
  MutationsInputSchema,
  NetImportInputSchema,
  ReplaceInputSchema,
  SetValueSchema,
} from '../private/cloud-save.ts'

const procedures = (router: AnyContractRouter, path: string[] = []): Array<[string, AnyContractRouter]> =>
  router instanceof ProcedureContract
    ? [[path.join('.'), router]]
    : Object.entries(router).flatMap(([key, value]) => procedures(value as AnyContractRouter, [...path, key]))

const generateSpec = (router: AnyContractRouter, publicOnly: boolean) =>
  new OpenAPIGenerator({ converters: [new ZodToJsonSchemaConverter()] }).generate(router, {
    version: '3.1.1',
    base: { info: { title: 'DXRating API', version: '1.0.0' } },
    // The filter /spec.json uses in apps/backend/src/app.ts
    filter: publicOnly ? isPublicSpecProcedure : undefined,
  })

const saveId = 'dsav_test-save-1'
const sheetId = 'dsht_23456789ab'
const mutationId = '01927b5e-8f3a-7c2d-9e4f-0123456789ab'
const record = { sheetId, achievement: 1005432, comboFlag: 'fc', syncFlag: null }
const clientImport = {
  id: saveId,
  idempotencyKey: 'import-0192-7b5e',
  source: 'dxrating-json',
  trigger: 'user',
  records: [record],
}

describe('cloudSaveContract', () => {
  it('has every §5.1 route except /me/features, all tagged internal and cloud-save', () => {
    const entries = procedures(cloudSaveContract)
    expect(entries.map(([path, contract]) => `${getOpenAPIMeta(contract as never)?.method} ${path}`)).toEqual([
      'GET saves.list',
      'POST saves.create',
      'PATCH saves.update',
      'DELETE saves.delete',
      'GET records.changes',
      'POST records.mutate',
      'GET records.events',
      'POST records.replace',
      'POST imports.client',
      'POST imports.lxns',
      'POST imports.divingFish',
      'GET imports.get',
      'GET imports.list',
      'POST snapshots.create',
      'GET snapshots.list',
      'GET export',
    ])
    for (const [, contract] of entries) {
      expect(getOpenAPIMeta(contract as never)?.tags).toEqual(['internal', 'cloud-save'])
      expect(getOpenAPIMeta(contract as never)?.path).not.toMatch(/^\/me\/features/)
    }
  })

  it('stays out of the public contract', () => {
    expect('cloudSave' in publicContractRoutes).toBe(false)
    expect('cloudSave' in publicAppContract).toBe(false)
    const publicPaths = procedures(publicAppContract).map(([, contract]) => getOpenAPIMeta(contract as never)?.path)
    for (const path of publicPaths) expect(path).not.toMatch(/^\/(saves|imports|me\/export)/)
  })

  it('leaves no cloud-save path or tag in the public OpenAPI document', async () => {
    const router = { ...publicContractRoutes, cloudSave: cloudSaveContract }

    // Control: without the filter the routes are there, so the assertions below are not vacuous
    const full = JSON.stringify(await generateSpec(router, false))
    expect(full).toContain('"/saves/{id}/changes"')
    expect(full).toContain('cloud-save')

    const spec = await generateSpec(router, true)
    const paths = Object.keys(spec.paths ?? {})
    expect(paths.length).toBeGreaterThan(0)
    for (const path of paths) {
      expect(path).not.toMatch(/^\/(saves|imports|me\/export|me\/features)/)
    }
    expect(JSON.stringify(spec)).not.toContain('cloud-save')
    expect(JSON.stringify(spec)).not.toContain('"internal"')
  })
})

describe('provenance claims are never trusted', () => {
  it('rejects provenance fields on records, set values and requests', () => {
    expect(ImportRecordSchema.safeParse(record).success).toBe(true)
    for (const key of ['fetchedBy', 'verification', 'source', 'importJobId', 'rawPayloadSha256', 'entryMethod']) {
      expect(ImportRecordSchema.safeParse({ ...record, [key]: 'server' }).success, key).toBe(false)
      expect(
        SetValueSchema.safeParse({ achievement: 1000000, comboFlag: null, syncFlag: null, [key]: 'x' }).success,
        key,
      ).toBe(false)
    }
    expect(ClientImportInputSchema.safeParse(clientImport).success).toBe(true)
    expect(ClientImportInputSchema.safeParse({ ...clientImport, fetchedBy: 'server' }).success).toBe(false)
    expect(ClientImportInputSchema.safeParse({ ...clientImport, verification: 'verified' }).success).toBe(false)
    expect(
      MutationsInputSchema.safeParse({
        id: saveId,
        mutations: [
          {
            mutationId,
            op: 'set',
            sheetId,
            entryMethod: 'typed',
            value: { achievement: 1000000, comboFlag: null, syncFlag: null },
            verification: 'verified',
          },
        ],
      }).success,
    ).toBe(false)
    expect(
      ReplaceInputSchema.safeParse({
        id: saveId,
        ifRevision: 3,
        idempotencyKey: 'replace-0001',
        source: 'dxrating-json',
        records: [{ ...record, fetchedBy: 'server' }],
      }).success,
    ).toBe(false)
  })

  it('accepts only client sources on client-imports, storing claimed providers separately', () => {
    for (const source of ['aqua-dx', 'mu-net', 'aqua-sqlite', 'dxrating-json', 'legacy-local']) {
      expect(ClientImportInputSchema.safeParse({ ...clientImport, source }).success, source).toBe(true)
    }
    for (const source of ['demo', 'maimai-net-jp', 'maimai-net-intl', 'lxns', 'diving-fish', 'manual', 'maimai-net']) {
      expect(ClientImportInputSchema.safeParse({ ...clientImport, source }).success, source).toBe(false)
      expect(
        ReplaceInputSchema.safeParse({ id: saveId, ifRevision: 0, idempotencyKey: 'replace-0001', source, records: [] })
          .success,
        source,
      ).toBe(false)
    }
    // demo data is never synced, not even as a claimed provider (§9.5)
    for (const claimedSource of ['demo', 'Demo']) {
      const demo = { ...record, claimedSource }
      expect(ImportRecordSchema.safeParse(demo).success, claimedSource).toBe(false)
    }
    const claimed = ClientImportInputSchema.parse({ ...clientImport, records: [{ ...record, claimedSource: 'lxns' }] })
    expect(claimed.records[0]?.claimedSource).toBe('lxns')
    expect(claimed.source).toBe('dxrating-json')
  })
})

describe('input validation', () => {
  it('validates sheet IDs and integer achievements', () => {
    for (const bad of ['dsht_1234567890', 'dsht_23456789a', 'song__dxrt__dx__master', '']) {
      expect(ImportRecordSchema.safeParse({ ...record, sheetId: bad }).success, bad).toBe(false)
    }
    for (const achievement of [0, 1010000]) {
      expect(ImportRecordSchema.safeParse({ ...record, achievement }).success).toBe(true)
    }
    for (const achievement of [-1, 1010001, 100.5432, Number.NaN]) {
      expect(ImportRecordSchema.safeParse({ ...record, achievement }).success, String(achievement)).toBe(false)
    }
    expect(ImportRecordSchema.safeParse({ ...record, comboFlag: 'fdx' }).success).toBe(false)
  })

  it('refuses U+0000 and lone surrogates, which PostgreSQL text and JSONB cannot store', () => {
    expect(ImportRecordSchema.safeParse({ ...record, providerRecordId: '123' }).success).toBe(true)
    expect(ImportRecordSchema.safeParse({ ...record, providerRecordId: '1\u00002' }).success).toBe(false)
    expect(ImportRecordSchema.safeParse({ ...record, providerRecordId: '1\ud800' }).success).toBe(false)
    expect(ImportRecordSchema.safeParse({ ...record, providerRecordId: '\udc00' }).success).toBe(false)
    expect(ImportRecordSchema.safeParse({ ...record, providerRecordId: '\ud83c\udfb5' }).success).toBe(true)
  })

  it('limits mutations to 500 and requires UUIDv7 IDs', () => {
    const del = (i: number) => ({
      mutationId: `01927b5e-8f3a-7c2d-9e4f-${i.toString(16).padStart(12, '0')}`,
      op: 'delete',
      sheetId,
    })
    expect(
      MutationsInputSchema.safeParse({ id: saveId, mutations: Array.from({ length: 500 }, (_, i) => del(i)) }).success,
    ).toBe(true)
    expect(
      MutationsInputSchema.safeParse({ id: saveId, mutations: Array.from({ length: 501 }, (_, i) => del(i)) }).success,
    ).toBe(false)
    expect(MutationsInputSchema.safeParse({ id: saveId, mutations: [] }).success).toBe(false)
    expect(MutationSchema.safeParse(del(0)).success).toBe(true)
    expect(MutationSchema.safeParse({ ...del(0), mutationId: crypto.randomUUID() }).success).toBe(false)
  })

  it('accepts a batch with malformed mutations, which the handler rejects one by one (§5.4)', () => {
    const valid = { mutationId, op: 'delete', sheetId }
    const malformed = [
      { ...valid, mutationId: crypto.randomUUID() },
      { ...valid, sheetId: 'song__dxrt__dx__master' },
      { ...valid, op: 'set', entryMethod: 'typed', value: { achievement: 1010001, comboFlag: null, syncFlag: null } },
      { ...valid, op: 'set', entryMethod: 'import', value: { achievement: 1, comboFlag: null, syncFlag: null } },
      { ...valid, op: 'set', entryMethod: 'typed', value: { achievement: 1, comboFlag: 'fdx', syncFlag: null } },
      { ...valid, op: 'set', entryMethod: 'typed' },
      { ...valid, basedOnRevision: -1 },
      // Wrong-typed or missing values are per-item too, so a bad queued mutation can't block its siblings
      { ...valid, op: 'upsert' },
      { ...valid, sheetId: 42 },
      { ...valid, basedOnRevision: '5' },
      { ...valid, op: 'set', entryMethod: 'typed', value: { achievement: '1005432', comboFlag: null, syncFlag: null } },
      { ...valid, op: 'set', entryMethod: 'typed', value: { comboFlag: null, syncFlag: null } },
      { ...valid, op: 'set', entryMethod: 'typed', value: null },
      { ...valid, op: 'set', entryMethod: 'typed', value: 'broken' },
      { ...valid, op: 'set', entryMethod: 'typed', value: [] },
    ]
    const input = MutationsInputSchema.parse({ id: saveId, mutations: [...malformed, valid] })
    expect(input.mutations.map((mutation) => MutationSchema.safeParse(mutation).success)).toEqual([
      ...malformed.map(() => false),
      true,
    ])
    // Unknown keys, provenance claims among them, still fail the batch
    for (const key of ['verification', 'fetchedBy', 'source']) {
      expect(MutationsInputSchema.safeParse({ id: saveId, mutations: [valid, { ...valid, [key]: 'x' }] }).success).toBe(
        false,
      )
    }
    expect(MutationsInputSchema.safeParse({ id: saveId, mutations: [{ ...valid, mutationId: 42 }] }).success).toBe(
      false,
    )
    // A provenance claim inside the value object fails the request too
    const claimed = { ...valid, op: 'set', entryMethod: 'typed', value: { achievement: 1, verification: 'verified' } }
    expect(MutationsInputSchema.safeParse({ id: saveId, mutations: [valid, claimed] }).success).toBe(false)
  })

  it('accepts uploads with malformed records, which the handler counts as rejected', () => {
    const malformed = [
      { ...record, sheetId: 'dsht_1234567890' },
      { ...record, achievement: 1010001 },
      { ...record, achievement: 100.5432 },
      { ...record, comboFlag: 'fdx' },
      { ...record, claimedSource: 'demo' },
      { ...record, achievement: null },
      { ...record, achievement: '1005432' },
      { ...record, sheetId: undefined },
      { ...record, dxScore: 'x' },
    ]
    const input = ClientImportInputSchema.parse({ ...clientImport, records: [...malformed, record] })
    expect(input.records.map((r) => ImportRecordSchema.safeParse(r).success)).toEqual([
      ...malformed.map(() => false),
      true,
    ])
    const replace = { id: saveId, ifRevision: 3, idempotencyKey: 'replace-0001', source: 'dxrating-json' }
    expect(ReplaceInputSchema.safeParse({ ...replace, records: [...malformed, record] }).success).toBe(true)
    // Unknown keys still fail the upload
    expect(
      ClientImportInputSchema.safeParse({ ...clientImport, records: [{ ...record, verification: 'x' }] }).success,
    ).toBe(false)
  })

  it('lets replace carry a whole save in one request', () => {
    const replace = { id: saveId, ifRevision: 3, idempotencyKey: 'replace-0001', source: 'dxrating-json' }
    const records = (n: number) => Array.from({ length: n }, () => record)
    expect(ReplaceInputSchema.safeParse({ ...replace, records: records(10000) }).success).toBe(true)
    expect(ReplaceInputSchema.safeParse({ ...replace, records: records(10001) }).success).toBe(false)
  })

  it('limits client-import chunks to 5000 records', () => {
    const records = (n: number) => Array.from({ length: n }, () => record)
    expect(ClientImportInputSchema.safeParse({ ...clientImport, records: records(5000) }).success).toBe(true)
    expect(ClientImportInputSchema.safeParse({ ...clientImport, records: records(5001) }).success).toBe(false)
    expect(ClientImportInputSchema.parse(clientImport)).toMatchObject({ chunkIndex: 0, chunkCount: 1 })
    expect(ClientImportInputSchema.safeParse({ ...clientImport, chunkIndex: 2, chunkCount: 4 }).success).toBe(true)
    expect(ClientImportInputSchema.safeParse({ ...clientImport, chunkIndex: 4, chunkCount: 4 }).success).toBe(false)
  })

  it('bounds the depth and size of snapshot details without overflowing the stack', () => {
    const snapshot = { id: saveId, atRevision: 3, b15Sum: 1, b35Sum: 2, b50Sum: 3, recordCount: 4, gameVersion: '25' }
    const nested = (depth: number) => {
      let value: unknown = 1
      for (let i = 0; i < depth; i++) value = [value]
      return value
    }
    expect(CreateSnapshotInputSchema.safeParse(snapshot).success).toBe(true)
    const b50 = { entries: Array.from({ length: 50 }, (_, i) => ({ sheetId, rating: 300 + i, achievement: 1005000 })) }
    expect(CreateSnapshotInputSchema.safeParse({ ...snapshot, detail: b50 }).success).toBe(true)
    expect(CreateSnapshotInputSchema.safeParse({ ...snapshot, detail: { a: nested(15) } }).success).toBe(true)
    expect(CreateSnapshotInputSchema.safeParse({ ...snapshot, detail: { a: nested(16) } }).success).toBe(false)
    // 200k levels deep: rejected, not a RangeError
    expect(CreateSnapshotInputSchema.safeParse({ ...snapshot, detail: { a: nested(200_000) } }).success).toBe(false)
    const long = (n: number) => ({ a: 'x'.repeat(n - '{"a":""}'.length) })
    expect(
      CreateSnapshotInputSchema.safeParse({ ...snapshot, detail: long(CLOUD_SAVE_MAX_SNAPSHOT_DETAIL_LENGTH) }).success,
    ).toBe(true)
    expect(
      CreateSnapshotInputSchema.safeParse({ ...snapshot, detail: long(CLOUD_SAVE_MAX_SNAPSHOT_DETAIL_LENGTH + 1) })
        .success,
    ).toBe(false)
    expect(
      CreateSnapshotInputSchema.safeParse({ ...snapshot, detail: { a: Array.from({ length: 100_000 }, () => 0) } })
        .success,
    ).toBe(false)
    expect(CreateSnapshotInputSchema.safeParse({ ...snapshot, detail: [1] }).success).toBe(false)
  })

  it('takes a changes mode, incremental by default', () => {
    expect(ChangesInputSchema.parse({ id: saveId, since: '3' })).toMatchObject({ since: 3, mode: 'incremental' })
    expect(ChangesInputSchema.parse({ id: saveId, since: '3', mode: 'full' })).toMatchObject({ mode: 'full' })
    expect(ChangesInputSchema.safeParse({ id: saveId, mode: 'all' }).success).toBe(false)
  })

  it('validates idempotency keys', () => {
    for (const key of ['auto-net-dsav_abc-1730620800', 'migrate-device1-preset-japan', crypto.randomUUID()]) {
      expect(ClientImportInputSchema.safeParse({ ...clientImport, idempotencyKey: key }).success, key).toBe(true)
    }
    for (const key of ['', 'short', 'has space in it', '-leading-dash', 'x'.repeat(129)]) {
      expect(ClientImportInputSchema.safeParse({ ...clientImport, idempotencyKey: key }).success, key).toBe(false)
    }
  })

  it('validates server import and save inputs', () => {
    const df = { id: saveId, idempotencyKey: 'import-df-0001', trigger: 'user' }
    expect(DivingFishImportInputSchema.safeParse({ ...df, username: 'player' }).success).toBe(true)
    expect(DivingFishImportInputSchema.safeParse({ ...df, qq: '123456' }).success).toBe(true)
    expect(DivingFishImportInputSchema.safeParse(df).success).toBe(false)
    expect(DivingFishImportInputSchema.safeParse({ ...df, username: 'player', qq: '123456' }).success).toBe(false)
    expect(DivingFishImportInputSchema.safeParse({ ...df, username: 'player', trigger: 'migration' }).success).toBe(
      false,
    )

    const net = { idempotencyKey: 'import-net-0001', trigger: 'user', region: 'jp', id: 'segaid', password: 'secret' }
    expect(NetImportInputSchema.safeParse(net).success).toBe(true)
    expect(NetImportInputSchema.safeParse({ ...net, region: 'cn' }).success).toBe(false)
    expect(NetImportInputSchema.safeParse({ ...net, fetchedBy: 'server' }).success).toBe(false)

    expect(CreateSaveInputSchema.safeParse({ name: 'Main', region: 'jp' }).success).toBe(true)
    expect(CreateSaveInputSchema.safeParse({ name: 'Main', region: 'kr' }).success).toBe(false)
    expect(CreateSaveInputSchema.safeParse({ name: ' ', region: 'jp' }).success).toBe(false)
    expect(CreateSaveInputSchema.safeParse({ name: 'Main', region: 'jp', revision: 5 }).success).toBe(false)
  })
})