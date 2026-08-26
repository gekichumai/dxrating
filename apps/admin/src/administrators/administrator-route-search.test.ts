import {
  changeAdministratorHistoryCursor,
  selectAdministratorHistory,
  validateAdministratorRouteSearch,
} from './administrator-route-search'

describe('administrator route search', () => {
  it('retains a valid selected subject and opaque history cursor', () => {
    expect(validateAdministratorRouteSearch({ userId: 'user-1', historyCursor: 'opaque page/value' })).toEqual({
      userId: 'user-1',
      historyCursor: 'opaque page/value',
    })
  })

  it.each([
    [{ historyCursor: 'orphaned' }, {}],
    [{ userId: '' }, {}],
    [{ userId: ' user-1' }, {}],
    [{ userId: ['user-1'] }, {}],
    [{ userId: 'user-1', historyCursor: '' }, { userId: 'user-1' }],
    [{ userId: 'user-1', historyCursor: ['cursor'] }, { userId: 'user-1' }],
  ])('fails closed for malformed URL state %#', (input, expected) => {
    expect(validateAdministratorRouteSearch(input)).toEqual(expected)
  })

  it('clears history pagination whenever a different subject is selected', () => {
    expect(selectAdministratorHistory('user-2')).toEqual({ userId: 'user-2' })
  })

  it('changes or restarts pagination only for a selected subject', () => {
    expect(changeAdministratorHistoryCursor({ userId: 'user-1' }, 'page-2')).toEqual({
      userId: 'user-1',
      historyCursor: 'page-2',
    })
    expect(changeAdministratorHistoryCursor({ userId: 'user-1', historyCursor: 'page-2' })).toEqual({
      userId: 'user-1',
    })
    expect(changeAdministratorHistoryCursor({}, 'page-2')).toEqual({})
  })
})