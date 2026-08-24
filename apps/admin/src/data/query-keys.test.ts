import { describe, expect, expectTypeOf, it } from 'vitest'
import { adminQueryKeys, type AdminQueryValue } from './query-keys'

describe('administrator query-key factories', () => {
  it('places every resource family below the private administrator root', () => {
    const familyKeys = [
      adminQueryKeys.bootstrap(),
      adminQueryKeys.primaryAuth.all(),
      adminQueryKeys.dashboard.all(),
      adminQueryKeys.charts.all(),
      adminQueryKeys.revisions.all(),
      adminQueryKeys.comments.all(),
      adminQueryKeys.users.all(),
      adminQueryKeys.administrators.all(),
      adminQueryKeys.reports.all(),
    ]

    for (const key of familyKeys) expect(key[0]).toBe('admin')
    expect(new Set(familyKeys.map((key) => JSON.stringify(key))).size).toBe(familyKeys.length)
  })

  it('separates list, detail, history, and provenance namespaces', () => {
    expect(adminQueryKeys.charts.list({ search: 'song' })).toEqual(['admin', 'charts', 'list', { search: 'song' }])
    expect(adminQueryKeys.charts.detail('chart-1')).toEqual(['admin', 'charts', 'detail', 'chart-1'])
    expect(adminQueryKeys.charts.fieldProvenance('chart-1', 'level')).toEqual([
      'admin',
      'charts',
      'detail',
      'chart-1',
      'provenance',
      'field',
      'level',
    ])
    expect(adminQueryKeys.revisions.detail('chart-1', 'revision-2')).toEqual([
      'admin',
      'revisions',
      'chart',
      'chart-1',
      'detail',
      'revision-2',
    ])
    expect(adminQueryKeys.administrators.roleHistory('user-1', { cursor: 'opaque-cursor', limit: 25 })).toEqual([
      'admin',
      'administrators',
      'detail',
      'user-1',
      'role-history',
      { cursor: 'opaque-cursor', limit: 25 },
    ])
  })

  it('keeps equivalent filters stable while distinguishing different resources', () => {
    expect(adminQueryKeys.comments.list({ status: 'recent' })).toEqual(
      adminQueryKeys.comments.list({ status: 'recent' }),
    )
    expect(adminQueryKeys.comments.list({ status: 'recent' })).not.toEqual(
      adminQueryKeys.comments.list({ status: 'deleted' }),
    )
    expect(adminQueryKeys.users.detail('user-1')).not.toEqual(adminQueryKeys.administrators.detail('user-1'))
    expect(adminQueryKeys.administrators.roleHistory('user-1')).not.toEqual(
      adminQueryKeys.administrators.roleHistory('user-2'),
    )
    expect(adminQueryKeys.administrators.roleHistory('user-1', { cursor: 'page-1' })).not.toEqual(
      adminQueryKeys.administrators.roleHistory('user-1', { cursor: 'page-2' }),
    )
    expect(adminQueryKeys.reports.detail('report-1')).not.toEqual(adminQueryKeys.comments.detail('report-1'))
  })

  it('limits filter values to serializable cache-key data', () => {
    expectTypeOf<{ nested: readonly ['open', 2, true, null] }>().toMatchTypeOf<AdminQueryValue>()
    expectTypeOf<() => void>().not.toMatchTypeOf<AdminQueryValue>()
    expectTypeOf<Date>().not.toMatchTypeOf<AdminQueryValue>()
  })

  it('makes child keys prefix-match only their intended family and entity', () => {
    expect(
      adminQueryKeys.charts.provenance('chart-1').slice(0, adminQueryKeys.charts.detail('chart-1').length),
    ).toEqual(adminQueryKeys.charts.detail('chart-1'))
    expect(adminQueryKeys.revisions.detail('chart-1', 'revision-1').slice(0, 4)).toEqual(
      adminQueryKeys.revisions.byChart('chart-1'),
    )
    expect(adminQueryKeys.users.activity('user-1').slice(0, adminQueryKeys.users.detail('user-1').length)).toEqual(
      adminQueryKeys.users.detail('user-1'),
    )
    expect(
      adminQueryKeys.administrators
        .roleHistory('user-1', { cursor: 'next' })
        .slice(0, adminQueryKeys.administrators.detail('user-1').length),
    ).toEqual(adminQueryKeys.administrators.detail('user-1'))
  })
})