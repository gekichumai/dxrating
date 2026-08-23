import { describe, expect, it, vi } from 'vitest'
import { createSafeAdminTelemetryError, reportAdminExceptionTo } from './observability.js'

describe('administrator observability redaction', () => {
  it('creates telemetry errors without privileged exception contents', () => {
    const secret = 'private moderation reason and credential'
    const original = new Error(secret)
    const sanitized = createSafeAdminTelemetryError()

    expect(sanitized).not.toBe(original)
    expect(sanitized.message).toBe('Administrator request failed')
    expect(sanitized.stack).not.toContain(secret)
    expect(Object.keys(sanitized)).toEqual([])
  })

  it('reports only a procedure identifier and a new sanitized error', () => {
    const capture = vi.fn()

    reportAdminExceptionTo('bootstrap', '18d7118c-ec70-4603-9176-cffea8a6cd8f', { capture })

    expect(capture).toHaveBeenCalledOnce()
    expect(capture.mock.calls[0]?.[0]).toMatchObject({ message: 'Administrator request failed' })
    expect(capture.mock.calls[0]?.[1]).toEqual({
      tags: {
        'orpc.procedure': 'bootstrap',
        'orpc.surface': 'admin',
        requestId: '18d7118c-ec70-4603-9176-cffea8a6cd8f',
      },
    })
  })

  it('drops unsafe client-supplied correlation identifiers', () => {
    const capture = vi.fn()

    reportAdminExceptionTo('bootstrap', 'credential=do-not-send', { capture })

    expect(capture.mock.calls[0]?.[1]).toEqual({
      tags: {
        'orpc.procedure': 'bootstrap',
        'orpc.surface': 'admin',
      },
    })
  })
})