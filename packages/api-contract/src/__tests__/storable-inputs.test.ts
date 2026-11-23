import { ProcedureContract, type AnyContractRouter } from '@orpc/contract'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  ImportRecordInputSchema,
  ImportRecordSchema,
  MutationItemInputSchema,
  MutationSchema,
  NetImportInputSchema,
  NetImportParamsSchema,
} from '../private/cloud-save.ts'
import { privateContractRoutes } from '../private/index.ts'
import { PgBigint } from '../private/storable.ts'

const routeInputs = (router: AnyContractRouter, path: string[] = []): Array<[string, z.ZodType]> =>
  router instanceof ProcedureContract
    ? (router['~orpc'].inputSchemas ?? []).map((schema) => [path.join('.'), schema as z.ZodType])
    : Object.entries(router).flatMap(([key, value]) => routeInputs(value as AnyContractRouter, [...path, key]))

const PRIVATE_INPUTS: Array<[string, z.ZodType]> = [
  ...routeInputs(privateContractRoutes),
  ['netImport.params', NetImportParamsSchema],
  ['netImport.body', NetImportInputSchema],
]

/** Batch items the route accepts loosely, and the schema the handler then parses each one with */
const PARSED_PER_ITEM = new Map<z.ZodType, z.ZodType>([
  [MutationItemInputSchema, MutationSchema],
  [ImportRecordInputSchema, ImportRecordSchema],
])

const UNSTORABLE = [
  'a\u0000b',
  '\ud800',
  'x\udc00',
  0.5,
  2 ** 53,
  -(2 ** 53),
  { 'a\u0000': 1 },
  { a: 'b\u0000' },
  { a: [{ b: '\ud800' }] },
]
const BEYOND_INTEGER_COLUMN = [2 ** 31, -(2 ** 31) - 1]
const BEYOND_TIMESTAMPTZ = ['0000-01-01T00:00:00Z', '0001-01-01T00:30:00+01:00', '9999-12-31T23:30:00-01:00']

interface Def {
  type: string
  format?: string
  shape?: Record<string, z.ZodType>
  innerType?: z.ZodType
  element?: z.ZodType
  options?: z.ZodType[]
  keyType?: z.ZodType
  valueType?: z.ZodType
  left?: z.ZodType
  right?: z.ZodType
  in?: z.ZodType
  out?: z.ZodType
  items?: z.ZodType[]
  rest?: z.ZodType | null
  getter?: () => z.ZodType
}
const defOf = (schema: z.ZodType) => schema.def as unknown as Def

const children = (def: Def, path: string): Array<[string, z.ZodType]> => {
  switch (def.type) {
    case 'object':
      return Object.entries(def.shape!).map(([key, value]) => [`${path}.${key}`, value])
    case 'array':
      return [[`${path}[]`, def.element!]]
    case 'union':
      return def.options!.map((option) => [path, option])
    case 'record':
      return [
        [`${path}{key}`, def.keyType!],
        [`${path}{value}`, def.valueType!],
      ]
    case 'intersection':
      return [
        [path, def.left!],
        [path, def.right!],
      ]
    case 'pipe':
      return children(defOf(def.in!), path).length > 0 ? [[path, def.in!]] : []
    case 'tuple':
      return [...def.items!, ...(def.rest ? [def.rest] : [])].map((item, index) => [`${path}[${index}]`, item])
    case 'lazy':
      return [[path, def.getter!()]]
    default:
      return def.innerType ? [[path, def.innerType]] : []
  }
}

const leaves = (schema: z.ZodType, path: string): Array<[string, z.ZodType]> => {
  const parsedPerItem = PARSED_PER_ITEM.get(schema)
  if (parsedPerItem) return leaves(parsedPerItem, path)
  const inner = children(defOf(schema), path)
  return inner.length === 0 ? [[path, schema]] : inner.flatMap(([childPath, child]) => leaves(child, childPath))
}

const isBigintColumn = (schema: z.ZodType): boolean => {
  const out = defOf(schema).type === 'pipe' ? defOf(schema).out! : schema
  // oxlint-disable-next-line no-underscore-dangle -- Zod 4 exposes the brand parent chain only on _zod
  for (let current: z.core.$ZodType | undefined = out; current; current = current._zod.parent) {
    if (current === PgBigint) return true
  }
  return false
}

/** Every `path` under `schema` that accepts a value PostgreSQL cannot store, with that value */
const unstorable = (schema: z.ZodType, root = '') =>
  leaves(schema, root).flatMap(([path, leaf]) =>
    [
      ...UNSTORABLE,
      ...(isBigintColumn(leaf) ? [] : BEYOND_INTEGER_COLUMN),
      ...(defOf(leaf).format === 'datetime' ? BEYOND_TIMESTAMPTZ : []),
    ]
      .filter((value) => leaf.safeParse(value).success)
      .map((value) => `${path} accepts ${JSON.stringify(value)}`),
  )

describe('private contract inputs', () => {
  it('refuse every value PostgreSQL cannot store, in every route', () => {
    expect(PRIVATE_INPUTS.length).toBeGreaterThan(15)
    expect(PRIVATE_INPUTS.flatMap(([route, schema]) => unstorable(schema, route))).toEqual([])
  })

  it('are caught when a field uses a bare primitive', () => {
    const input = z.strictObject({
      name: z.string().max(64),
      count: z.number().int().nonnegative(),
      at: z.iso.datetime({ offset: true }),
      revision: PgBigint.nonnegative().optional(),
      loose: z.unknown(),
      piped: z.strictObject({ id: z.string() }).transform((value) => value),
      pair: z.tuple([z.string()]),
    })
    expect(unstorable(input)).toEqual([
      '.name accepts "a\\u0000b"',
      '.name accepts "\\ud800"',
      '.name accepts "x\\udc00"',
      '.count accepts 2147483648',
      '.at accepts "0000-01-01T00:00:00Z"',
      '.at accepts "0001-01-01T00:30:00+01:00"',
      '.at accepts "9999-12-31T23:30:00-01:00"',
      ...[...UNSTORABLE, ...BEYOND_INTEGER_COLUMN].map((value) => `.loose accepts ${JSON.stringify(value)}`),
      '.piped.id accepts "a\\u0000b"',
      '.piped.id accepts "\\ud800"',
      '.piped.id accepts "x\\udc00"',
      '.pair[0] accepts "a\\u0000b"',
      '.pair[0] accepts "\\ud800"',
      '.pair[0] accepts "x\\udc00"',
    ])
  })
})