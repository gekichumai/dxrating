import { ProcedureContract, type AnyProcedureContract } from '@orpc/contract'
import { getOpenAPIMeta, OpenAPIGenerator } from '@orpc/openapi'
import type * as OpenAPI from '@openapi-spec/types/v3.1'
import { ZodToJsonSchemaConverter } from '@orpc/zod'
import { describe, expect, it } from 'vitest'
import { appContract } from '../contract'
import { addPublishedDxdataToOpenApi } from './dxdata-openapi'
import { addPublicApiExamplesToOpenApi, publicApiOperationExamples } from './openapi-examples'

const httpMethods = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const

const isReference = (value: object): value is OpenAPI.ReferenceObject => '$ref' in value

const getExampleValues = (examples: Record<string, OpenAPI.ReferenceObject | OpenAPI.ExampleObject> | undefined) =>
  Object.values(examples ?? {}).flatMap((example) => (isReference(example) ? [] : [example.value]))

const assertMeaningfulValue = (value: unknown) => {
  if (typeof value === 'string') {
    expect(value.trim()).not.toBe('')
    expect(value.trim().toLowerCase()).not.toBe('string')
    return
  }
  if (Array.isArray(value)) {
    expect(value.length).toBeLessThanOrEqual(3)
    for (const item of value) assertMeaningfulValue(item)
    return
  }
  if (value && typeof value === 'object') {
    for (const nested of Object.values(value)) assertMeaningfulValue(nested)
  }
}

const generateDocument = async () => {
  const generator = new OpenAPIGenerator({
    converters: [new ZodToJsonSchemaConverter()],
  })
  const generated = await generator.generate(appContract, {
    version: '3.1.1',
    base: { info: { title: 'DXRating API', version: '1.0.0' } },
    filter: (contract) => !getOpenAPIMeta(contract)?.tags?.includes('internal'),
  })
  return addPublicApiExamplesToOpenApi(addPublishedDxdataToOpenApi(generated))
}

const collectPublicProcedures = (
  value: unknown,
  path: string[] = [],
  procedures = new Map<string, AnyProcedureContract>(),
) => {
  if (value instanceof ProcedureContract) {
    if (!getOpenAPIMeta(value)?.tags?.includes('internal')) procedures.set(path.join('.'), value)
    return procedures
  }
  if (!value || typeof value !== 'object') return procedures

  for (const [key, nested] of Object.entries(value)) collectPublicProcedures(nested, [...path, key], procedures)
  return procedures
}

const expectSchemaAccepts = async (schema: unknown, value: unknown, label: string) => {
  const standardSchema = schema as {
    '~standard': {
      validate: (
        input: unknown,
      ) =>
        | { value: unknown; issues?: undefined }
        | { issues: ReadonlyArray<{ message: string }> }
        | Promise<{ value: unknown; issues?: undefined } | { issues: ReadonlyArray<{ message: string }> }>
    }
  }
  const result = await standardSchema['~standard'].validate(value)
  expect(result.issues, `${label}: ${JSON.stringify(result.issues)}`).toBeUndefined()
}

describe('public OpenAPI examples', () => {
  it('provides concise meaningful examples for every public operation surface', async () => {
    const document = await generateDocument()
    const operationIds: string[] = []
    const exampleValues: unknown[] = []

    for (const pathItem of Object.values(document.paths ?? {})) {
      if (!pathItem || isReference(pathItem)) continue

      for (const method of httpMethods) {
        const operation = pathItem[method]
        if (!operation) continue

        expect(operation.operationId).toBeDefined()
        operationIds.push(operation.operationId!)

        for (const parameterOrReference of operation.parameters ?? []) {
          if (isReference(parameterOrReference)) continue
          const values =
            parameterOrReference.example === undefined
              ? getExampleValues(parameterOrReference.examples)
              : [parameterOrReference.example]
          expect(values.length, `${operation.operationId}.${parameterOrReference.name}`).toBeGreaterThan(0)
          exampleValues.push(...values)
        }

        if (operation.requestBody && !isReference(operation.requestBody)) {
          for (const [mediaType, media] of Object.entries<OpenAPI.MediaTypeObject>(operation.requestBody.content)) {
            if (!/^application\/json(?:;|$)/i.test(mediaType)) continue
            const values = getExampleValues(media.examples)
            expect(values.length, `${operation.operationId} request`).toBeGreaterThan(0)
            exampleValues.push(...values)
          }
        }

        for (const status of Object.keys(operation.responses ?? {})) {
          if (!/^[1-5][0-9X]{2}$/.test(status) && status !== 'default') continue
          const responseOrReference = operation.responses?.[status as `${number}`]
          if (!responseOrReference || isReference(responseOrReference)) continue
          for (const [mediaType, media] of Object.entries<OpenAPI.MediaTypeObject>(responseOrReference.content ?? {})) {
            if (!/^application\/json(?:;|$)/i.test(mediaType)) continue
            const values = getExampleValues(media.examples)
            expect(values.length, `${operation.operationId} response ${status}`).toBeGreaterThan(0)
            exampleValues.push(...values)
          }

          for (const headerOrReference of Object.values<OpenAPI.HeaderObject | OpenAPI.ReferenceObject>(
            responseOrReference.headers ?? {},
          )) {
            if (isReference(headerOrReference) || headerOrReference.example === undefined) continue
            exampleValues.push(headerOrReference.example)
          }
        }
      }
    }

    expect(operationIds.sort()).toEqual(
      [
        ...collectPublicProcedures(appContract).keys(),
        'getPublishedDxdataCatalog',
        'headPublishedDxdataCatalog',
      ].sort(),
    )
    expect(exampleValues.length).toBeGreaterThan(operationIds.length)
    for (const value of exampleValues) assertMeaningfulValue(value)
  })

  it('keeps examples attached to the generated request and response media types', async () => {
    const document = await generateDocument()
    const createComment = document.paths?.['/comments']
    if (!createComment || isReference(createComment)) throw new Error('Missing /comments path')

    const requestBody = createComment.post?.requestBody
    if (!requestBody || isReference(requestBody)) throw new Error('Missing comments.create request body')
    expect(getExampleValues(requestBody.content['application/json']?.examples)[0]).toMatchObject({
      songId: 'dsng_d9dbdcaw9v',
      sheetId: 'dsht_jxnmx39rwt',
      content: 'The delayed star slide is the key to this chart.',
    })

    const venueResponse = document.paths?.['/arcades/venues/{id}']
    if (!venueResponse || isReference(venueResponse)) throw new Error('Missing arcade venue path')
    const response = venueResponse.get?.responses?.['200']
    if (!response || isReference(response)) throw new Error('Missing arcade venue response')
    expect(getExampleValues(response.content?.['application/json']?.examples)[0]).toMatchObject({
      id: 'dven_ctwf8yjqy6',
      name: 'ＧｉＧＯ　ＢＬｉＸ茅ヶ崎',
    })
  })

  it('validates every operation example against its oRPC schemas', async () => {
    const procedures = collectPublicProcedures(appContract)

    for (const [operationId, procedure] of procedures) {
      const examples = publicApiOperationExamples[operationId as keyof typeof publicApiOperationExamples]
      if (!examples) throw new Error(`Missing examples for contract procedure ${operationId}`)

      for (const inputSchema of procedure['~orpc'].inputSchemas ?? []) {
        const input =
          'request' in examples
            ? { ...('parameters' in examples ? examples.parameters : {}), ...examples.request }
            : 'parameters' in examples
              ? examples.parameters
              : undefined
        await expectSchemaAccepts(inputSchema, input, `${operationId} input`)
      }
      for (const outputSchema of procedure['~orpc'].outputSchemas ?? []) {
        await expectSchemaAccepts(outputSchema, examples.response, `${operationId} output`)
      }
    }
  })
})