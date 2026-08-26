import {
  ADMIN_USER_BAN_REASON_MAX_LENGTH,
  ADMIN_USER_TEMPORARY_BAN_MAX_DURATION_DAYS,
} from '@gekichumai/admin-contract'

export type UserBanReasonValidation =
  | { readonly ok: true; readonly reason: string }
  | { readonly ok: false; readonly issue: 'required' | 'too-long' }

export type TemporaryBanExpiryValidation =
  | { readonly ok: true; readonly expiresAt: string }
  | { readonly ok: false; readonly issue: 'required' | 'invalid' | 'not-future' | 'too-far' }

const LOCAL_MINUTE_PATTERN = /^(\d{4,})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1_000

export const validateUserBanReason = (value: string): UserBanReasonValidation => {
  const reason = value.trim()
  if (reason.length === 0) return { ok: false, issue: 'required' }
  if (reason.length > ADMIN_USER_BAN_REASON_MAX_LENGTH) return { ok: false, issue: 'too-long' }
  return { ok: true, reason }
}

export const validateTemporaryBanExpiry = (value: string, now = new Date()): TemporaryBanExpiryValidation => {
  if (value.length === 0) return { ok: false, issue: 'required' }
  const match = LOCAL_MINUTE_PATTERN.exec(value)
  if (!match) return { ok: false, issue: 'invalid' }

  const [, yearText, monthText, dayText, hourText, minuteText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const expiry = new Date(year, month - 1, day, hour, minute)
  if (
    !Number.isFinite(expiry.getTime()) ||
    expiry.getFullYear() !== year ||
    expiry.getMonth() !== month - 1 ||
    expiry.getDate() !== day ||
    expiry.getHours() !== hour ||
    expiry.getMinutes() !== minute
  ) {
    return { ok: false, issue: 'invalid' }
  }

  const maximumExpiry = now.getTime() + ADMIN_USER_TEMPORARY_BAN_MAX_DURATION_DAYS * DAY_IN_MILLISECONDS
  if (expiry.getTime() <= now.getTime()) return { ok: false, issue: 'not-future' }
  if (expiry.getTime() > maximumExpiry) return { ok: false, issue: 'too-far' }
  return { ok: true, expiresAt: expiry.toISOString() }
}