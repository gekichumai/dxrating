import { Layer, ManagedRuntime } from 'effect'
import { AccessVerifier, AccessVerifierLive } from './access'
import { adminApiConfigLayer, type AdminApiConfig, AdminApiConfigService } from './config'

export type AdminApiServices = AdminApiConfigService | AccessVerifier

export const adminApiLayer = (config: AdminApiConfig) => {
  const configLayer = adminApiConfigLayer(config)
  return Layer.merge(configLayer, AccessVerifierLive.pipe(Layer.provide(configLayer)))
}

export const makeAdminApiRuntime = (layer: Layer.Layer<AdminApiServices>) => ManagedRuntime.make(layer)