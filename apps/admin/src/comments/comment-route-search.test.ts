import { describe, expect, it } from 'vitest'
import {
  COMMENT_LIST_SORT,
  commentDetailQueryFromSearch,
  commentListFilterDraftFromSearch,
  commentListFiltersFromSearch,
  commentListQueryFromSearch,
  hasCommentListFilters,
  instantToLocalDateTimeInput,
  parseCommentListFilterDraft,
  selectCommentInSearch,
  validateCommentListSearch,
} from './comment-route-search'

describe('administrator comment route search', () => {
  it('normalizes the fixed sort, all filters, list position, selection, and independent drawer cursors', () => {
    expect(
      validateCommentListSearch({
        sort: 'oldest',
        authorUserId: 'stable-user-id',
        chartId: 'dsht_23456789ab',
        status: 'deleted',
        createdAtFromInclusive: '2026-08-01T00:00:00Z',
        createdAtBeforeExclusive: '2026-09-01T00:00:00Z',
        cursor: 'list_page_2',
        commentId: '42',
        threadCursor: 'thread_page_2',
        commentHistoryCursor: 'comment_history_page_2',
        authorBanHistoryCursor: 'ban_history_page_2',
        ignored: 'not-forwarded',
      }),
    ).toEqual({
      sort: COMMENT_LIST_SORT,
      authorUserId: 'stable-user-id',
      chartId: 'dsht_23456789ab',
      status: 'deleted',
      createdAtFromInclusive: '2026-08-01T00:00:00.000Z',
      createdAtBeforeExclusive: '2026-09-01T00:00:00.000Z',
      cursor: 'list_page_2',
      commentId: '42',
      threadCursor: 'thread_page_2',
      commentHistoryCursor: 'comment_history_page_2',
      authorBanHistoryCursor: 'ban_history_page_2',
    })
  })

  it('accepts TanStack numeric parsing only for positive safe decimal comment IDs', () => {
    expect(validateCommentListSearch({ commentId: 42 })).toEqual({ sort: COMMENT_LIST_SORT, commentId: '42' })
    expect(validateCommentListSearch({ commentId: 0 })).toEqual({ sort: COMMENT_LIST_SORT })
    expect(validateCommentListSearch({ commentId: -1 })).toEqual({ sort: COMMENT_LIST_SORT })
    expect(validateCommentListSearch({ commentId: 1.5 })).toEqual({ sort: COMMENT_LIST_SORT })
    expect(validateCommentListSearch({ commentId: Number.MAX_SAFE_INTEGER + 1 })).toEqual({
      sort: COMMENT_LIST_SORT,
    })
    expect(validateCommentListSearch({ commentId: '9999999999999999999' })).toEqual({
      sort: COMMENT_LIST_SORT,
      commentId: '9999999999999999999',
    })
  })

  it('strips malformed URL fields independently and removes an invalid bound pair', () => {
    expect(
      validateCommentListSearch({
        authorUserId: ' user-id ',
        chartId: 'chart-1',
        status: 'hidden',
        createdAtFromInclusive: 'not-a-date',
        createdAtBeforeExclusive: '2026-09-01',
        cursor: 'bad.cursor',
        commentId: ['42'],
        threadCursor: '',
        commentHistoryCursor: 'bad.cursor',
        authorBanHistoryCursor: 'valid_cursor',
      }),
    ).toEqual({ sort: COMMENT_LIST_SORT })

    expect(
      validateCommentListSearch({
        status: 'active',
        createdAtFromInclusive: '2026-09-01T00:00:00.000Z',
        createdAtBeforeExclusive: '2026-08-01T00:00:00.000Z',
      }),
    ).toEqual({ sort: COMMENT_LIST_SORT, status: 'active' })
  })

  it('strips all orphaned drawer cursors unless a valid selected comment is present', () => {
    expect(
      validateCommentListSearch({
        threadCursor: 'thread_page',
        commentHistoryCursor: 'comment_history_page',
        authorBanHistoryCursor: 'ban_history_page',
      }),
    ).toEqual({ sort: COMMENT_LIST_SORT })

    expect(
      validateCommentListSearch({
        commentId: 'not-a-comment',
        threadCursor: 'thread_page',
        commentHistoryCursor: 'comment_history_page',
        authorBanHistoryCursor: 'ban_history_page',
      }),
    ).toEqual({ sort: COMMENT_LIST_SORT })

    expect(
      validateCommentListSearch({
        commentId: 42,
        threadCursor: 'thread_page',
        commentHistoryCursor: 'bad.cursor',
        authorBanHistoryCursor: 'ban_history_page',
      }),
    ).toEqual({
      sort: COMMENT_LIST_SORT,
      commentId: '42',
      threadCursor: 'thread_page',
      authorBanHistoryCursor: 'ban_history_page',
    })
  })

  it('separates backend list parameters, filter resets, and drawer paging parameters', () => {
    const search = validateCommentListSearch({
      authorUserId: 'user-1',
      status: 'active',
      cursor: 'list_page_3',
      commentId: 88,
      threadCursor: 'thread_page_3',
      commentHistoryCursor: 'comment_history_page_3',
      authorBanHistoryCursor: 'ban_history_page_3',
    })

    expect(commentListFiltersFromSearch(search)).toEqual({
      sort: COMMENT_LIST_SORT,
      authorUserId: 'user-1',
      status: 'active',
    })
    expect(commentListQueryFromSearch(search)).toEqual({
      authorUserId: 'user-1',
      status: 'active',
      cursor: 'list_page_3',
    })
    expect(commentDetailQueryFromSearch(search)).toEqual({
      threadCursor: 'thread_page_3',
      commentHistoryCursor: 'comment_history_page_3',
      authorBanHistoryCursor: 'ban_history_page_3',
    })
    expect(hasCommentListFilters(search)).toBe(true)
    expect(hasCommentListFilters(validateCommentListSearch({ cursor: 'list_page_2' }))).toBe(false)
  })

  it('round-trips exact instants through local datetime inputs and emits canonical UTC filters', () => {
    const from = new Date(2026, 7, 24, 9, 15).toISOString()
    const before = new Date(2026, 7, 25, 18, 45).toISOString()
    const search = validateCommentListSearch({
      authorUserId: 'user-1',
      chartId: 'dsht_23456789ab',
      status: 'deleted',
      createdAtFromInclusive: from,
      createdAtBeforeExclusive: before,
    })
    const draft = commentListFilterDraftFromSearch(search)

    expect(draft).toEqual({
      authorUserId: 'user-1',
      chartId: 'dsht_23456789ab',
      status: 'deleted',
      createdAtFromInclusive: '2026-08-24T09:15',
      createdAtBeforeExclusive: '2026-08-25T18:45',
    })
    expect(instantToLocalDateTimeInput(undefined)).toBe('')
    expect(parseCommentListFilterDraft(draft)).toEqual({
      success: true,
      value: {
        sort: COMMENT_LIST_SORT,
        authorUserId: 'user-1',
        chartId: 'dsht_23456789ab',
        status: 'deleted',
        createdAtFromInclusive: from,
        createdAtBeforeExclusive: before,
      },
    })
  })

  it('reports field errors for identifiers, impossible local instants, and unordered bounds', () => {
    expect(
      parseCommentListFilterDraft({
        authorUserId: ' user-1 ',
        chartId: 'not-a-stable-chart',
        status: 'active',
        createdAtFromInclusive: '2026-02-30T12:00',
        createdAtBeforeExclusive: '2026-03-01T12:00',
      }),
    ).toEqual({
      success: false,
      errors: {
        authorUserId: 'invalid',
        chartId: 'invalid',
        createdAtFromInclusive: 'invalid',
      },
    })

    expect(
      parseCommentListFilterDraft({
        authorUserId: '',
        chartId: '',
        status: '',
        createdAtFromInclusive: '2026-08-25T09:00',
        createdAtBeforeExclusive: '2026-08-25T09:00',
      }),
    ).toEqual({ success: false, errors: { createdAtBeforeExclusive: 'order' } })
  })

  it('preserves result position while changing selection and always resets all drawer cursors', () => {
    const search = validateCommentListSearch({
      status: 'deleted',
      cursor: 'list_page_2',
      commentId: 10,
      threadCursor: 'thread_page',
      commentHistoryCursor: 'comment_history_page',
      authorBanHistoryCursor: 'ban_history_page',
    })

    expect(selectCommentInSearch(search, '11')).toEqual({
      sort: COMMENT_LIST_SORT,
      status: 'deleted',
      cursor: 'list_page_2',
      commentId: '11',
    })
    expect(selectCommentInSearch(search)).toEqual({
      sort: COMMENT_LIST_SORT,
      status: 'deleted',
      cursor: 'list_page_2',
    })
  })
})