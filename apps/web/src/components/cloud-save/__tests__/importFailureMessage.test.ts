import { describe, expect, it } from 'vitest'
import { importFailureMessage, importHistoryFailure } from '../importFailureMessage'

describe('NET import failures', () => {
  it('read the same whether the code came from the stream or from the persisted job', () => {
    const locale = 'en'
    for (const [stream, job] of [
      ['INVALID_CREDENTIALS', 'invalid_credentials'],
      ['NET_MAINTENANCE', 'net_maintenance'],
      ['AIME_CARD_UNAVAILABLE', 'aime_card_unavailable'],
    ]) {
      expect(importFailureMessage(job, locale)).toBe(importFailureMessage(stream, locale))
      expect(importHistoryFailure(job, locale)).toBe(importHistoryFailure(stream, locale))
      expect(importHistoryFailure(job, locale)).not.toBe(importHistoryFailure('upstream_error', locale))
    }
    // Other codes keep their own handling
    expect(importFailureMessage('connection_expired', locale)).toBe(importFailureMessage('upstream_error', locale))
  })
})