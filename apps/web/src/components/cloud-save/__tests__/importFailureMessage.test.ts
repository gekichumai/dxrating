import i18n from 'i18next'
import { beforeAll, describe, expect, it } from 'vitest'
import { initI18n } from '@/setup/init-i18n'
import { importFailureMessage, importHistoryFailure } from '../importFailureMessage'

beforeAll(async () => {
  initI18n()
  await i18n.changeLanguage('en')
})

describe('NET import failures', () => {
  it('read the same whether the code came from the stream or from the persisted job', () => {
    const t = i18n.t.bind(i18n)
    for (const [stream, job] of [
      ['INVALID_CREDENTIALS', 'invalid_credentials'],
      ['NET_MAINTENANCE', 'net_maintenance'],
      ['AIME_CARD_UNAVAILABLE', 'aime_card_unavailable'],
    ]) {
      expect(importFailureMessage(job, t)).toBe(importFailureMessage(stream, t))
      expect(importHistoryFailure(job, t)).toBe(importHistoryFailure(stream, t))
      expect(importHistoryFailure(job, t)).not.toBe(importHistoryFailure('upstream_error', t))
    }
    // Other codes keep their own handling
    expect(importFailureMessage('connection_expired', t)).toBe(importFailureMessage('upstream_error', t))
  })
})