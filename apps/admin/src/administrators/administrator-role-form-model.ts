import { ADMIN_ROLE_CHANGE_REASON_MAX_LENGTH } from '@gekichumai/admin-contract'

export type AdministratorRoleChangeReasonValidation =
  | { readonly ok: true; readonly reason: string }
  | { readonly ok: false; readonly issue: 'required' | 'too-long' }

export const validateAdministratorRoleChangeReason = (value: string): AdministratorRoleChangeReasonValidation => {
  const reason = value.trim()
  if (reason.length === 0) return { ok: false, issue: 'required' }
  if (reason.length > ADMIN_ROLE_CHANGE_REASON_MAX_LENGTH) return { ok: false, issue: 'too-long' }
  return { ok: true, reason }
}