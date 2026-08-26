import { createHash } from 'node:crypto'
import { OpenAPIGenerator } from '@orpc/openapi'
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4'
import { adminContract } from './contract.js'

const generator = new OpenAPIGenerator({
  schemaConverters: [new ZodToJsonSchemaConverter()],
})

export const generateAdminOpenApiDocument = () =>
  generator.generate(adminContract, {
    info: {
      title: 'DXRating Administrator API',
      version: 'unstable',
      description: 'Private, unstable contract for the first-party DXRating administrator application.',
    },
    servers: [{ url: '/api/admin' }],
  })

const canonicalize = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalize(nested)}`)
  return `{${entries.join(',')}}`
}

export const computeAdminContractCompatibilityId = async () => {
  const document = await generateAdminOpenApiDocument()
  const digest = createHash('sha256').update(canonicalize(document)).digest('hex')
  return `sha256:${digest}` as const
}