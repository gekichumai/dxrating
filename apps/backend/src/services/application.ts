import { Context, Effect, Layer } from 'effect'
import { Database, type DatabaseError } from '../db/index.js'
import { createCatalogIdentityEffects } from './catalog-identities.js'

export class CatalogIdentities extends Context.Tag('dxrating/CatalogIdentities')<
  CatalogIdentities,
  ReturnType<typeof createCatalogIdentityEffects<DatabaseError, never>>
>() {}

// Keep publication snapshots and in-flight loads shared for this application's lifetime.
export const CatalogIdentitiesLive = Layer.effect(
  CatalogIdentities,
  Effect.gen(function* () {
    const database = yield* Database
    return createCatalogIdentityEffects((text, values) =>
      database.query('CatalogIdentities.query', () => database.pool.query(text, values)),
    )
  }),
)