import { describe, expect, it } from 'vitest'
import {
  hasUserListFilters,
  parseUserListFilterDraft,
  userListFilterDraftFromSearch,
  userListSearchWithoutCursor,
  validateUserDetailSearch,
  validateUserListSearch,
} from './user-route-search'

describe('administrator user route search', () => {
  it('normalizes every combinable list filter with contract rules', () => {
    expect(
      validateUserListSearch({
        userId: 'stable-user-id',
        displayName: '  Example\t User  ',
        email: '  MODERATOR@Example.COM  ',
        effectiveRole: 'super_admin',
        activeBan: 'false',
        cursor: 'opaque_page_2',
        ignored: 'not-forwarded',
      }),
    ).toEqual({
      userId: 'stable-user-id',
      displayName: 'Example User',
      email: 'moderator@example.com',
      effectiveRole: 'super_admin',
      activeBan: false,
      cursor: 'opaque_page_2',
    })
  })

  it('accepts router boolean values and independently strips malformed URL state', () => {
    expect(
      validateUserListSearch({
        userId: ['duplicate-user-id'],
        displayName: 'x',
        email: 'not-an-email',
        effectiveRole: 'owner',
        activeBan: true,
        cursor: 'not.a.cursor',
      }),
    ).toEqual({ activeBan: true })

    expect(validateUserListSearch({ activeBan: 'any' })).toEqual({})
  })

  it('round-trips the form representation without copying a result cursor', () => {
    const search = validateUserListSearch({
      displayName: 'Moderator',
      effectiveRole: 'admin',
      activeBan: 'true',
      cursor: 'page_2',
    })
    const draft = userListFilterDraftFromSearch(search)

    expect(draft).toEqual({
      userId: '',
      displayName: 'Moderator',
      email: '',
      effectiveRole: 'admin',
      activeBan: 'true',
    })
    expect(parseUserListFilterDraft(draft)).toEqual({
      success: true,
      value: { displayName: 'Moderator', effectiveRole: 'admin', activeBan: true },
    })
    expect(userListSearchWithoutCursor(search)).toEqual({
      displayName: 'Moderator',
      effectiveRole: 'admin',
      activeBan: true,
    })
  })

  it('reports field-level draft validation while preserving contract canonicalization', () => {
    expect(
      parseUserListFilterDraft({
        userId: ' user-id ',
        displayName: 'x',
        email: 'invalid',
        effectiveRole: '',
        activeBan: '',
      }),
    ).toEqual({
      success: false,
      errors: { userId: 'invalid', displayName: 'invalid', email: 'invalid' },
    })

    expect(
      parseUserListFilterDraft({
        userId: '',
        displayName: '  Full\n Name ',
        email: ' PERSON@EXAMPLE.COM ',
        effectiveRole: 'user',
        activeBan: 'false',
      }),
    ).toEqual({
      success: true,
      value: {
        displayName: 'Full Name',
        email: 'person@example.com',
        effectiveRole: 'user',
        activeBan: false,
      },
    })
  })

  it('distinguishes filters from cursors for clear and recovery behavior', () => {
    expect(hasUserListFilters({ cursor: 'page_2' })).toBe(false)
    expect(hasUserListFilters({ effectiveRole: 'user', cursor: 'page_2' })).toBe(true)
  })

  it('sanitizes user-detail pagination and source-comment state', () => {
    expect(
      validateUserDetailSearch({
        commentsCursor: 'comments_page_2',
        banHistoryCursor: 'history_page_3',
        sourceCommentId: '42',
        ignored: 'value',
      }),
    ).toEqual({
      commentsCursor: 'comments_page_2',
      banHistoryCursor: 'history_page_3',
      sourceCommentId: '42',
    })

    expect(
      validateUserDetailSearch({
        commentsCursor: 'bad.cursor',
        banHistoryCursor: '',
        sourceCommentId: '0',
      }),
    ).toEqual({})
    expect(validateUserDetailSearch({ sourceCommentId: '12345678901234567890' })).toEqual({})
    expect(validateUserDetailSearch({ sourceCommentId: 42 })).toEqual({ sourceCommentId: '42' })
  })
})