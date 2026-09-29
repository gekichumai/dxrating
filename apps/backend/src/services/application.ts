import { Context, Effect, Layer } from 'effect'
import { Database, type DatabaseError } from '../db/index'
import { createCatalogIdentityEffects } from './catalog-identities'

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