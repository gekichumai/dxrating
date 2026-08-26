/**
 * Freshness windows reflect how quickly each resource class changes. They
 * intentionally do not schedule polling: stale active queries are refreshed
 * by focus, reconnect, or an explicit administrator action.
 */
export const ADMIN_STALE_TIME_MS = {
  bootstrap: 15_000,
  primaryAuth: 15_000,
  dashboard: 30_000,
  charts: 60_000,
  revisions: 5 * 60_000,
  comments: 15_000,
  users: 60_000,
  administrators: 30_000,
  reports: 15_000,
} as const

export type AdminFreshnessResource = keyof typeof ADMIN_STALE_TIME_MS

export const getAdminStaleTime = (resource: AdminFreshnessResource): number => ADMIN_STALE_TIME_MS[resource]