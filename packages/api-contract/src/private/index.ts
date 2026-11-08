import { cloudSaveContract } from './cloud-save.ts'
import { featuresContract } from './features.ts'
import { sessionsContract } from './sessions.ts'

export * from './features.ts'
export * from './sessions.ts'

/**
 * Routes for signed-in first-party clients. They are part of the backend's
 * `appContract` but never of `publicContractRoutes`, and each one is tagged
 * `internal` so the public OpenAPI document leaves it out.
 */
export const privateContractRoutes = {
  features: featuresContract,
  cloudSave: cloudSaveContract,
  sessions: sessionsContract,
}