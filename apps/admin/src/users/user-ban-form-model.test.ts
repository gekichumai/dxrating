import { ADMIN_USER_BAN_REASON_MAX_LENGTH } from '@gekichumai/admin-contract'
import { describe, expect, it } from 'vitest'
import { validateTemporaryBanExpiry, validateUserBanReason } from './user-ban-form-model'

describe('user ban form model', () => {
  it('trims a valid reason and rejects empty or oversized private input', () => {
    expect(validateUserBanReason('  Account abuse evidence  ')).toEqual({
      ok: true,
      reason: 'Account abuse evidence',
    })
    expect(validateUserBanReason(' \n\t ')).toEqual({ ok: false, issue: 'required' })
    expect(validateUserBanReason('x'.repeat(ADMIN_USER_BAN_REASON_MAX_LENGTH + 1))).toEqual({
      ok: false,
      issue: 'too-long',
    })
  })

  it('turns a strict local wall-clock minute into the UTC instant sent to the backend', () => {
    const now = new Date(2026, 0, 1, 12, 0)
    expect(validateTemporaryBanExpiry('2026-01-02T12:30', now)).toEqual({
      ok: true,
      expiresAt: new Date(2026, 0, 2, 12, 30).toISOString(),
    })
  })

  it('rejects missing, normalized-invalid, elapsed, and over-limit temporary expiries', () => {
    const now = new Date(2026, 0, 1, 12, 0)
    expect(validateTemporaryBanExpiry('', now)).toEqual({ ok: false, issue: 'required' })
    expect(validateTemporaryBanExpiry('2026-02-31T12:00', now)).toEqual({ ok: false, issue: 'invalid' })
    expect(validateTemporaryBanExpiry('2026-01-01T12:00', now)).toEqual({ ok: false, issue: 'not-future' })
    expect(validateTemporaryBanExpiry('2027-01-02T12:01', now)).toEqual({ ok: false, issue: 'too-far' })
  })
})