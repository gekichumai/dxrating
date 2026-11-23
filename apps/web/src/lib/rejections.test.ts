import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TelemetrySdk } from './telemetry'

let reload: ReturnType<typeof vi.fn>
let sdk: { captureException: ReturnType<typeof vi.fn> }

async function load() {
  vi.resetModules()
  const telemetry = await import('./telemetry')
  telemetry.attachTelemetrySdk(sdk as unknown as TelemetrySdk)
  return import('./rejections')
}

beforeEach(() => {
  sessionStorage.clear()
  reload = vi.fn()
  vi.stubGlobal('location', { ...window.location, reload })
  sdk = { captureException: vi.fn() }
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('reportRejection', () => {
  it('reloads the page for a chunk a deploy removed, without reporting it', async () => {
    const { reportRejection } = await load()
    reportRejection(new TypeError('Failed to fetch dynamically imported module: https://dxrating.net/assets/a-1.js'))
    expect(reload).toHaveBeenCalledOnce()
    expect(sdk.captureException).not.toHaveBeenCalled()
  })

  it('reports any other rejection', async () => {
    const { reportRejection } = await load()
    const error = new Error('update failed')
    reportRejection(error)
    expect(sdk.captureException).toHaveBeenCalledWith(error)
    expect(reload).not.toHaveBeenCalled()
  })
})

describe('asyncHandler', () => {
  it('passes the event to the handler and reports its rejection', async () => {
    const { asyncHandler } = await load()
    const error = new Error('request failed')
    const handler = vi.fn((_event: string) => Promise.reject(error))
    expect(asyncHandler(handler)('click')).toBeUndefined()
    expect(handler).toHaveBeenCalledWith('click')
    await vi.waitFor(() => expect(sdk.captureException).toHaveBeenCalledWith(error))
  })
})