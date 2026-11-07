import { Layer, ManagedRuntime } from 'effect'
import { AccessVerifier, AccessVerifierLive } from './access'
import { HttpClient, HttpClientLive } from '@gekichumai/backend/http-client'
import { AdminDatabase, AdminDatabaseLive } from './db'
import { RateLimiter, RateLimiterLive } from './rate-limit'
import { adminApiConfigLayer, type AdminApiConfig, AdminApiConfigService } from './config'

export type AdminApiServices = AdminApiConfigService | AccessVerifier | RateLimiter | AdminDatabase | HttpClient

export const adminApiLayer = (config: AdminApiConfig) => {
  const configLayer = adminApiConfigLayer(config)
  return Layer.mergeAll(
    configLayer,
    AccessVerifierLive.pipe(Layer.provide(configLayer)),
    RateLimiterLive,
    AdminDatabaseLive.pipe(Layer.provide(configLayer)),
    HttpClientLive,
  )
}

export const makeAdminApiRuntime = (layer: Layer.Layer<AdminApiServices>) => ManagedRuntime.make(layer)