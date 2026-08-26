import { ADMIN_ROLE_CHANGE_REASON_MAX_LENGTH } from '@gekichumai/admin-contract'
import { describe, expect, it } from 'vitest'
import { validateAdministratorRoleChangeReason } from './administrator-role-form-model'

describe('administrator role form model', () => {
  it.each(['', ' ', '\n\t'])('rejects an empty trimmed reason', (reason) => {
    expect(validateAdministratorRoleChangeReason(reason)).toEqual({ ok: false, issue: 'required' })
  })

  it('rejects a reason over the contract limit after trimming', () => {
    expect(validateAdministratorRoleChangeReason(`  ${'x'.repeat(ADMIN_ROLE_CHANGE_REASON_MAX_LENGTH + 1)}  `)).toEqual(
      { ok: false, issue: 'too-long' },
    )
  })

  it('accepts the contract boundary and returns the trimmed reason', () => {
    const reason = 'x'.repeat(ADMIN_ROLE_CHANGE_REASON_MAX_LENGTH)
    expect(validateAdministratorRoleChangeReason(` ${reason} `)).toEqual({ ok: true, reason })
  })
})