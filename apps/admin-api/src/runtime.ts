import { Layer, ManagedRuntime } from 'effect'
import { AccessVerifier, AccessVerifierLive } from './access'
import { RateLimiter, RateLimiterLive } from './rate-limit'
import { adminApiConfigLayer, type AdminApiConfig, AdminApiConfigService } from './config'

export type AdminApiServices = AdminApiConfigService | AccessVerifier | RateLimiter

export const adminApiLayer = (config: AdminApiConfig) => {
  const configLayer = adminApiConfigLayer(config)
  return Layer.mergeAll(configLayer, AccessVerifierLive.pipe(Layer.provide(configLayer)), RateLimiterLive)
}

export const makeAdminApiRuntime = (layer: Layer.Layer<AdminApiServices>) => ManagedRuntime.make(layer)