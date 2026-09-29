import * as OtelTracer from '@effect/opentelemetry/OtelTracer'
import * as Resource from '@effect/opentelemetry/Resource'
import { context, trace } from '@opentelemetry/api'
import { Layer, type Effect } from 'effect'

// Sentry owns the global provider, processors, and exporters. Effect only adds
// its spans to that existing provider and follows the active request context.
export const TracingLive = OtelTracer.layerGlobal.pipe(
  Layer.provide(Resource.layer({ serviceName: 'dxrating-backend' })),
)

export const withActiveRequestSpan = <A, E, R>(effect: Effect.Effect<A, E, R>) => {
  const parent = trace.getSpanContext(context.active())
  return parent !== undefined && parent !== null ? OtelTracer.withSpanContext(effect, parent) : effect
}