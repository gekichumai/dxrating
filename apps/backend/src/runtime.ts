import { Layer, ManagedRuntime } from 'effect'
import { Authentication, AuthenticationLive } from './auth'
import { CatalogIdentities, CatalogIdentitiesLive } from './services/application'
import { BuildInformation, BuildInformationLive } from './version'
import { AppConfigLive, type AppConfig } from './config'
import { DatabaseLive, type Database } from './db/index'
import { createRequestRunner } from './request-runner'
import { ApplicationCacheLive, type ApplicationCache } from './services/cache'
import { HttpClientLive, type HttpClient } from './services/http-client'
import { TracingLive, withActiveRequestSpan } from './tracing'

export const ApplicationLive = Layer.mergeAll(
  AppConfigLive,
  DatabaseLive,
  ApplicationCacheLive,
  HttpClientLive,
  AuthenticationLive.pipe(Layer.provide(Layer.merge(AppConfigLive, DatabaseLive))),
  CatalogIdentitiesLive.pipe(Layer.provide(DatabaseLive)),
  BuildInformationLive.pipe(Layer.provide(HttpClientLive)),
).pipe(Layer.provideMerge(TracingLive))
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
export const runApp: typeof requests.run = (effect, options) => requests.run(withActiveRequestSpan(effect), options)
export const superviseApp: typeof requests.supervise = (effect) => requests.supervise(withActiveRequestSpan(effect))
export const shutdownApp = requests.shutdown