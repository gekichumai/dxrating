import { context, ROOT_CONTEXT, trace, TraceFlags } from '@opentelemetry/api'
import { Effect, ManagedRuntime } from 'effect'
import { afterEach, expect, it, vi } from 'vitest'
import { TracingLive, withActiveRequestSpan } from '../tracing'

afterEach(() => vi.restoreAllMocks())

it('exports Effect spans through the existing provider and preserves the active request parent', async () => {
  const parent = {
    traceId: '11111111111111111111111111111111',
    spanId: '2222222222222222',
    traceFlags: TraceFlags.SAMPLED,
  }
  const span = trace.wrapSpanContext({ ...parent, spanId: '3333333333333333' })
  const end = vi.spyOn(span, 'end')
  const tracer = trace.getTracer('existing-sentry-provider')
  const startSpan = vi.spyOn(tracer, 'startSpan').mockReturnValue(span)
  const provider = { getTracer: vi.fn(() => tracer) }
  vi.spyOn(trace, 'getTracerProvider').mockReturnValue(provider)
  vi.spyOn(context, 'active').mockReturnValue(trace.setSpanContext(ROOT_CONTEXT, parent))

  const runtime = ManagedRuntime.make(TracingLive)
  try {
    await runtime.runPromise(Effect.void.pipe(Effect.withSpan('backend.test'), withActiveRequestSpan))
    expect(provider.getTracer).toHaveBeenCalledWith('dxrating-backend', undefined)
    expect(startSpan).toHaveBeenCalledTimes(1)
    expect(startSpan.mock.calls[0][0]).toBe('backend.test')
    expect(trace.getSpanContext(startSpan.mock.calls[0][2]!)).toMatchObject(parent)
    expect(end).toHaveBeenCalledTimes(1)
  } finally {
    await runtime.dispose()
  }
})