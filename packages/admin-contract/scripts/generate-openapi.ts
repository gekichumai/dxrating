import { generateAdminOpenApiDocument } from '../src/openapi.js'

const document = await generateAdminOpenApiDocument()
process.stdout.write(`${JSON.stringify(document, null, 2)}\n`)