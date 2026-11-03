import { cloudSaveContract, privateContractRoutes } from '@gekichumai/api-contract'
import { oc } from '@orpc/contract'

/**
 * The session-only routes of first-party clients (`/me/features`, cloud saves), kept apart from the public contract
 * of `./contract` so pages that never use them do not load their schemas. Mirrors the private part of the backend's
 * `appContract`.
 */
export const privateAppContract = oc.router({
  ...privateContractRoutes,
  cloudSave: cloudSaveContract,
})