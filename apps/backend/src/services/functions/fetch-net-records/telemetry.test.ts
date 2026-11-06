import { afterEach, describe, expect, it, vi } from 'vitest'
import { NetImportError } from '../../../lib/functions/client'
import { netOutcome, recordNetFailure, recordNetSuccess } from './telemetry'

const { count, distribution, warn } = vi.hoisted(() => ({ count: vi.fn(), distribution: vi.fn(), warn: vi.fn() }))
vi.mock('../../../lib/functions/sentry', () => ({ Sentry: { metrics: { count, distribution }, logger: { warn } } }))

afterEach(() => {
  vi.clearAllMocks()
})

describe('maimai NET import telemetry', () => {
  it('names each error code with a word the Sentry scrubber leaves alone', () => {
    expect(netOutcome(new NetImportError('INVALID_CREDENTIALS'))).toBe('login_rejected')
    expect(netOutcome(new NetImportError('NET_MAINTENANCE'))).toBe('maintenance')
    expect(netOutcome(new NetImportError('TOKEN_ERROR'))).toBe('login_page_changed')
    expect(netOutcome(new Error('boom'))).toBe('unexpected')
    for (const code of ['INVALID_CREDENTIALS', 'NET_MAINTENANCE', 'AIME_CARD_UNAVAILABLE', 'TOKEN_ERROR'] as const) {
      expect(netOutcome(new NetImportError(code))).not.toMatch(/credential|password|token|secret|auth/i)
    }
  })

  it('counts a success per region and route, the baseline the no-success alert watches', () => {
    recordNetSuccess('intl', 'api', { durationMs: 5000, recent: 50, music: 600 })
    expect(count).toHaveBeenCalledWith('net_fetch.success', 1, { attributes: { region: 'intl', route: 'api' } })
  })

  it('counts a failure with its outcome, step and NET code, and logs what SEGA said', () => {
    const error = new NetImportError('INVALID_CREDENTIALS', 'rejected', {
      step: 'login_submit',
      netErrorCode: '200004',
      upstreamMessage: '[id] is locked',
    })
    recordNetFailure('jp', 'sse', error)
    expect(count).toHaveBeenCalledWith('net_fetch.failure', 1, {
      attributes: {
        region: 'jp',
        route: 'sse',
        outcome: 'login_rejected',
        error_code: 'INVALID_CREDENTIALS',
        step: 'login_submit',
        net_error_code: '200004',
      },
    })
    expect(warn).toHaveBeenCalledWith('maimai NET import failed', {
      region: 'jp',
      route: 'sse',
      outcome: 'login_rejected',
      step: 'login_submit',
      net_error_code: '200004',
      upstream_message: '[id] is locked',
    })
  })
})