import { describe, expect, it } from 'vitest'
import { ADMIN_STALE_TIME_MS, getAdminStaleTime, type AdminFreshnessResource } from './freshness'

describe('administrator resource freshness policy', () => {
  it('assigns an explicit window to every private resource class', () => {
    expect(ADMIN_STALE_TIME_MS).toEqual({
      bootstrap: 15_000,
      primaryAuth: 15_000,
      dashboard: 30_000,
      charts: 60_000,
      revisions: 300_000,
      comments: 15_000,
      users: 60_000,
      administrators: 30_000,
      reports: 15_000,
    })
  })

  it('uses short windows for operational queues and a longer window for append-only history', () => {
    expect(getAdminStaleTime('comments')).toBeLessThan(getAdminStaleTime('charts'))
    expect(getAdminStaleTime('reports')).toBeLessThan(getAdminStaleTime('revisions'))

    const resources = Object.keys(ADMIN_STALE_TIME_MS) as AdminFreshnessResource[]
    for (const resource of resources) {
      expect(Number.isFinite(getAdminStaleTime(resource))).toBe(true)
      expect(getAdminStaleTime(resource)).toBeGreaterThan(0)
    }
  })
})