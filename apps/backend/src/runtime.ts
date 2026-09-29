import { Layer, ManagedRuntime } from 'effect'
import { Authentication, AuthenticationLive } from './auth.js'
import { CatalogIdentities, CatalogIdentitiesLive } from './services/application.js'
import { BuildInformation, BuildInformationLive } from './version.js'
import { AppConfigLive, type AppConfig } from './config.js'
import { DatabaseLive, type Database } from './db/index.js'
import { createRequestRunner } from './request-runner.js'
import { ApplicationCacheLive, type ApplicationCache } from './services/cache.js'
import { HttpClientLive, type HttpClient } from './services/http-client.js'

export const ApplicationLive = Layer.mergeAll(
  AppConfigLive,
  DatabaseLive,
  ApplicationCacheLive,
  HttpClientLive,
  AuthenticationLive.pipe(Layer.provide(Layer.merge(AppConfigLive, DatabaseLive))),
  CatalogIdentitiesLive.pipe(Layer.provide(DatabaseLive)),
  BuildInformationLive.pipe(Layer.provide(HttpClientLive)),
)
export type ApplicationServices =
  | AppConfig
  | Database
  | ApplicationCache
  | HttpClient
  | Authentication
  | CatalogIdentities
  | BuildInformation
export const appRuntime = ManagedRuntime.make(ApplicationLive)

const requests = createRequestRunner(appRuntime)

/** The sole application runtime boundary used by HTTP and SDK adapters. */
export const runApp = requests.run
export const shutdownApp = requests.shutdown