import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  attachTelemetrySdk,
  captureException,
  discardTelemetryQueue,
  logger,
  metrics,
  resetTelemetryForTests,
  type TelemetrySdk,
} from './telemetry'

function fakeSdk() {
  return {
    metrics: { count: vi.fn(), distribution: vi.fn(), gauge: vi.fn() },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    captureException: vi.fn(),
  }
}

const asSdk = (sdk: ReturnType<typeof fakeSdk>) => sdk as unknown as TelemetrySdk

describe('telemetry', () => {
  afterEach(() => {
    resetTelemetryForTests()
  })

  it('queues calls made before the SDK loads and sends them once it does', () => {
    metrics.distribution('sheet_search.duration', 12, { unit: 'millisecond' })
    logger.warn('Catalog API unavailable', { error: 'offline' })
    const error = new Error('early')
    captureException(error)

    const sdk = fakeSdk()
    attachTelemetrySdk(asSdk(sdk))

    expect(sdk.metrics.distribution).toHaveBeenCalledWith('sheet_search.duration', 12, { unit: 'millisecond' })
    expect(sdk.logger.warn).toHaveBeenCalledWith('Catalog API unavailable', { error: 'offline' })
    expect(sdk.captureException).toHaveBeenCalledWith(error)
  })

  it('calls the SDK directly once it is attached', () => {
    const sdk = fakeSdk()
    attachTelemetrySdk(asSdk(sdk))

    metrics.count('net_import.failure', 1)

    expect(sdk.metrics.count).toHaveBeenCalledWith('net_import.failure', 1)
  })

  it('drops queued calls when the SDK cannot load', () => {
    metrics.count('lxns_import.failure', 1)
    discardTelemetryQueue()
    metrics.count('lxns_import.failure', 1)

    const sdk = fakeSdk()
    attachTelemetrySdk(asSdk(sdk))

    expect(sdk.metrics.count).not.toHaveBeenCalled()
  })

  it('keeps a failing queued call from stopping the rest', () => {
    metrics.count('first', 1)
    metrics.count('second', 1)

    const sdk = fakeSdk()
    sdk.metrics.count.mockImplementationOnce(() => {
      throw new Error('SDK error')
    })
    attachTelemetrySdk(asSdk(sdk))

    expect(sdk.metrics.count).toHaveBeenLastCalledWith('second', 1)
  })
})