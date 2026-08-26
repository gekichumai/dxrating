import { ADMIN_ROLE_HISTORY_CURSOR_MAX_LENGTH } from '@gekichumai/admin-contract'

export type AdministratorRouteSearch = {
  readonly historyCursor?: string
  readonly userId?: string
}

const readSingleString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

const readUserId = (value: unknown): string | undefined => {
  const userId = readSingleString(value)
  if (!userId || userId.length > 255 || userId !== value) return undefined
  return userId
}

const readHistoryCursor = (value: unknown): string | undefined => {
  const cursor = readSingleString(value)
  if (!cursor || cursor.length > ADMIN_ROLE_HISTORY_CURSOR_MAX_LENGTH || cursor !== value) return undefined
  return cursor
}

export const validateAdministratorRouteSearch = (search: Record<string, unknown>): AdministratorRouteSearch => {
  const userId = readUserId(search.userId)
  if (!userId) return {}

  const historyCursor = readHistoryCursor(search.historyCursor)
  return historyCursor ? { userId, historyCursor } : { userId }
}

export const selectAdministratorHistory = (userId: string): AdministratorRouteSearch => ({ userId })

export const changeAdministratorHistoryCursor = (
  search: AdministratorRouteSearch,
  historyCursor?: string,
): AdministratorRouteSearch =>
  search.userId && historyCursor
    ? { userId: search.userId, historyCursor }
    : search.userId
      ? { userId: search.userId }
      : {}