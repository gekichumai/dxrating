import { Context, Effect, Layer } from 'effect'
import { Database, type DatabaseError } from '../db/index'
import { createCatalogIdentityEffects } from './catalog-identities'
import { createPostgresDxdataEffects } from './dxdata'
import { createMcpCatalogLoader } from './mcp/loader'
import { Sentry } from '../lib/functions/sentry'

export class CatalogIdentities extends Context.Service<
  CatalogIdentities,
  ReturnType<typeof createCatalogIdentityEffects<DatabaseError, never>>
>()('dxrating/CatalogIdentities') {}

// Keep publication snapshots and in-flight loads shared for this application's lifetime.
export const CatalogIdentitiesLive = Layer.effect(
  CatalogIdentities,
  Effect.gen(function* () {
    const database = yield* Database
    return createCatalogIdentityEffects((text, values) => database.raw('CatalogIdentities.query', text, values))
  }),
)
export class McpCatalogSource extends Context.Service<
  McpCatalogSource,
  ReturnType<typeof createMcpCatalogLoader<DatabaseError, never>>
>()('dxrating/McpCatalogSource') {}

// One catalog in memory for the application's lifetime, shared by every MCP request.
export const McpCatalogSourceLive = Layer.effect(
  McpCatalogSource,
  Effect.gen(function* () {
    const database = yield* Database
    return createMcpCatalogLoader(
      createPostgresDxdataEffects((text, values) => database.raw('McpCatalog.query', text, values)),
      { reportError: (error) => Sentry.captureException(error, { tags: { component: 'mcp' } }) },
    )
  }),
)