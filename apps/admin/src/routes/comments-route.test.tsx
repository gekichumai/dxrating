import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { translate } from '../i18n'
import { createAdminTestRuntime, renderAdminApp } from '../test/render-admin-app'

const COMMENT_ID = '42'
const AUTHOR_ID = 'comment-author'
const CHART_ID = 'dsht_23456789ab'
const SONG_ID = 'dsng_23456789ab'
const CREATED_AT = '2026-08-24T10:00:00.000Z'

const chart = {
  availability: 'historical' as const,
  legacyReference: { legacySongId: 'legacy-song-1', sheetType: 'dx', sheetDifficulty: 'master' },
  songLabel: 'Song One',
  chartLabel: 'Master (DX)',
  songId: SONG_ID,
  chartId: CHART_ID,
}

const authorSummary = {
  userId: AUTHOR_ID,
  displayName: 'Comment Author',
  effectiveRole: 'user' as const,
  isBanned: false,
}

const visibleState = {
  status: 'visible' as const,
  stateVersion: null,
  actorUserId: null,
  moderatedAt: null,
  reason: null,
}

const deletedState = {
  status: 'deleted' as const,
  stateVersion: '5',
  actorUserId: 'moderator-user',
  moderatedAt: '2026-08-24T11:00:00.000Z',
  reason: 'Internal deletion evidence',
}

const recentRow = (status: 'active' | 'deleted' = 'active') => ({
  id: COMMENT_ID,
  parentId: null,
  rootId: COMMENT_ID,
  createdAt: CREATED_AT,
  status,
  bodyPreview: status === 'deleted' ? '[deleted]' : 'Compact public preview',
  bodyPreviewTruncated: false,
  author: authorSummary,
  chart,
})

const detailOutput = (state: typeof visibleState | typeof deletedState = visibleState) => ({
  activePublication: null,
  comment: {
    id: COMMENT_ID,
    parentId: null,
    rootId: COMMENT_ID,
    authorUserId: AUTHOR_ID,
    chart,
    createdAt: CREATED_AT,
    originalBody: 'Immutable selected original',
  },
  state,
  author: {
    userId: AUTHOR_ID,
    displayName: 'Comment Author',
    email: 'comment-author@example.com',
    emailVerified: true,
    effectiveRole: 'user' as const,
    banState: {
      status: 'unbanned' as const,
      stateVersion: null,
      reason: null,
      actorUserId: null,
      banStartedAt: null,
      expiresAt: null,
      evaluatedAt: '2026-08-24T12:00:00.000Z',
    },
  },
  thread: {
    items: [
      {
        id: COMMENT_ID,
        parentId: null,
        rootId: COMMENT_ID,
        depth: 0,
        createdAt: CREATED_AT,
        originalBody: 'Immutable selected original',
        state,
        author: authorSummary,
      },
      {
        id: '43',
        parentId: COMMENT_ID,
        rootId: COMMENT_ID,
        depth: 1,
        createdAt: '2026-08-24T10:05:00.000Z',
        originalBody: 'A deleted reply that must stay private in the thread',
        state: deletedState,
        author: { ...authorSummary, userId: 'reply-author', displayName: 'Reply Author' },
      },
    ],
    completeness: 'complete' as const,
    nextCursor: null,
  },
  commentHistory: {
    items:
      state.status === 'deleted'
        ? [
            {
              id: '5',
              commentId: COMMENT_ID,
              actorUserId: 'moderator-user',
              previousEventId: null,
              createdAt: '2026-08-24T11:00:00.000Z',
              action: 'delete' as const,
              reason: 'Internal deletion evidence',
            },
          ]
        : [],
    nextCursor: null,
  },
  authorBanHistory: { items: [], nextCursor: null },
})

const listResponse = (status: 'active' | 'deleted' = 'active', nextCursor: string | null = null) => ({
  items: [recentRow(status)],
  nextCursor,
  normalizedFilters: {
    authorUserId: null,
    chartId: null,
    status: null,
    createdAtFromInclusive: null,
    createdAtBeforeExclusive: null,
  },
  activePublication: null,
})

const createCommentsFetch = ({
  deleted = false,
  nextCursor = null,
}: { deleted?: boolean; nextCursor?: string | null } = {}) =>
  vi.fn(async (request: RequestInfo | URL) => {
    const url = new URL((request as Request).url)
    if (url.pathname === `/api/admin/comments/${COMMENT_ID}`) {
      return Response.json(detailOutput(deleted ? deletedState : visibleState))
    }
    if (url.pathname === '/api/admin/comments') {
      const output = listResponse(deleted ? 'deleted' : 'active', nextCursor)
      return Response.json({
        ...output,
        normalizedFilters: {
          authorUserId: url.searchParams.get('authorUserId'),
          chartId: url.searchParams.get('chartId'),
          status: url.searchParams.get('status'),
          createdAtFromInclusive: url.searchParams.get('createdAtFromInclusive'),
          createdAtBeforeExclusive: url.searchParams.get('createdAtBeforeExclusive'),
        },
      })
    }
    return Response.json({ defined: true, code: 'NOT_FOUND', status: 404, data: { requestId: null } }, { status: 404 })
  })

describe('recent-comments moderation route', () => {
  it('opens complete, read-only moderation context from a stable newest-first result row', async () => {
    const fetch = createCommentsFetch()
    const runtime = createAdminTestRuntime({ fetch: fetch as unknown as typeof globalThis.fetch })
    const user = userEvent.setup()
    const rendered = await renderAdminApp('/comments', { runtime })

    expect(await screen.findByText('Compact public preview')).toBeTruthy()
    expect(screen.getByText(translate('comments.list.newestFirst'))).toBeTruthy()
    expect(screen.getByRole('link', { name: /Open author moderation/ }).getAttribute('href')).toBe(
      `/users/${AUTHOR_ID}?sourceCommentId=${COMMENT_ID}`,
    )
    expect(screen.getByRole('link', { name: /Open chart context/ }).getAttribute('href')).toBe(
      `/charts?chartId=${CHART_ID}`,
    )

    await user.click(screen.getByRole('button', { name: translate('comments.list.openDrawer') }))

    const drawer = await screen.findByRole('dialog', {
      name: translate('comments.drawer.title', { commentId: COMMENT_ID }),
    })
    expect(within(drawer).getAllByText('Immutable selected original')).toHaveLength(2)
    expect(within(drawer).getByText(translate('comments.context.thread.deletedTombstone'))).toBeTruthy()
    expect(within(drawer).queryByText('A deleted reply that must stay private in the thread')).toBeNull()
    expect(within(drawer).getByText(translate('comments.actions.delete'))).toBeTruthy()
    expect(within(drawer).queryByRole('button', { name: /edit/i })).toBeNull()
    expect(rendered.router.state.location.search).toMatchObject({ sort: 'newest', commentId: COMMENT_ID })
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
  })

  it('restores list filters and independent drawer cursors, then closes without losing the list position', async () => {
    const fetch = createCommentsFetch({ deleted: true })
    const runtime = createAdminTestRuntime({ fetch: fetch as unknown as typeof globalThis.fetch })
    const user = userEvent.setup()
    const rendered = await renderAdminApp(
      `/comments?sort=newest&authorUserId=${AUTHOR_ID}&chartId=${CHART_ID}&status=deleted` +
        '&createdAtFromInclusive=2026-08-01T00%3A00%3A00.000Z' +
        '&createdAtBeforeExclusive=2026-09-01T00%3A00%3A00.000Z' +
        '&cursor=list_page&commentId=42&threadCursor=thread_page' +
        '&commentHistoryCursor=comment_page&authorBanHistoryCursor=ban_page',
      { runtime },
    )

    const drawer = await screen.findByRole('dialog', {
      name: translate('comments.drawer.title', { commentId: COMMENT_ID }),
    })
    expect(await within(drawer).findByRole('button', { name: translate('comments.actions.restore') })).toBeTruthy()
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))

    const urls = fetch.mock.calls.map(([request]) => new URL((request as Request).url))
    const listUrl = urls.find(({ pathname }) => pathname === '/api/admin/comments')!
    expect(Object.fromEntries(listUrl.searchParams)).toMatchObject({
      authorUserId: AUTHOR_ID,
      chartId: CHART_ID,
      status: 'deleted',
      createdAtFromInclusive: '2026-08-01T00:00:00.000Z',
      createdAtBeforeExclusive: '2026-09-01T00:00:00.000Z',
      cursor: 'list_page',
    })
    const detailUrl = urls.find(({ pathname }) => pathname === `/api/admin/comments/${COMMENT_ID}`)!
    expect(Object.fromEntries(detailUrl.searchParams)).toMatchObject({
      threadCursor: 'thread_page',
      commentHistoryCursor: 'comment_page',
      authorBanHistoryCursor: 'ban_page',
    })

    await user.click(within(drawer).getByRole('button', { name: translate('comments.drawer.close') }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(rendered.router.state.location.search).toEqual({
      sort: 'newest',
      authorUserId: AUTHOR_ID,
      chartId: CHART_ID,
      status: 'deleted',
      createdAtFromInclusive: '2026-08-01T00:00:00.000Z',
      createdAtBeforeExclusive: '2026-09-01T00:00:00.000Z',
      cursor: 'list_page',
    })
  })

  it('validates local date ordering and clears list/drawer state when applying new filters', async () => {
    const fetch = createCommentsFetch()
    const runtime = createAdminTestRuntime({ fetch: fetch as unknown as typeof globalThis.fetch })
    const user = userEvent.setup()
    const rendered = await renderAdminApp('/comments?cursor=list_page&commentId=42', { runtime })

    await screen.findByRole('dialog', { name: translate('comments.drawer.title', { commentId: COMMENT_ID }) })
    const from = screen.getByLabelText(translate('comments.search.createdAtFromInclusive'))
    const before = screen.getByLabelText(translate('comments.search.createdAtBeforeExclusive'))
    fireEvent.change(from, { target: { value: '2026-08-25T12:00' } })
    fireEvent.change(before, { target: { value: '2026-08-24T12:00' } })
    await user.click(screen.getByRole('button', { name: translate('comments.search.submit') }))
    expect(screen.getByText(translate('comments.search.validation.dateOrder'))).toBeTruthy()
    expect(rendered.router.state.location.search).toMatchObject({ cursor: 'list_page', commentId: COMMENT_ID })

    fireEvent.change(before, { target: { value: '2026-08-26T12:00' } })
    await user.click(screen.getByRole('button', { name: translate('comments.search.submit') }))

    await waitFor(() =>
      expect(rendered.router.state.location.search).toEqual({
        sort: 'newest',
        createdAtFromInclusive: new Date(2026, 7, 25, 12, 0).toISOString(),
        createdAtBeforeExclusive: new Date(2026, 7, 26, 12, 0).toISOString(),
      }),
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('stores opaque keyset pagination in browser history and restores the cached newest page on Back', async () => {
    const secondPageRow = {
      ...recentRow(),
      id: '44',
      rootId: '44',
      bodyPreview: 'Second page preview',
      createdAt: '2026-08-24T09:00:00.000Z',
    }
    const fetch = vi.fn(async (request: RequestInfo | URL) => {
      const url = new URL((request as Request).url)
      const secondPage = url.searchParams.get('cursor') === 'comment_page_2'
      return Response.json({
        ...listResponse('active', secondPage ? null : 'comment_page_2'),
        items: [secondPage ? secondPageRow : recentRow()],
      })
    })
    const runtime = createAdminTestRuntime({ fetch: fetch as unknown as typeof globalThis.fetch })
    const user = userEvent.setup()
    const rendered = await renderAdminApp('/comments', { runtime })

    expect(await screen.findByText('Compact public preview')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: translate('comments.list.next') }))

    expect(await screen.findByText('Second page preview')).toBeTruthy()
    expect(rendered.router.state.location.search).toEqual({ sort: 'newest', cursor: 'comment_page_2' })
    expect(new URL((fetch.mock.calls[1]![0] as Request).url).searchParams.get('cursor')).toBe('comment_page_2')

    rendered.router.history.back()
    await waitFor(() => expect(rendered.router.state.location.search).toEqual({ sort: 'newest' }))
    expect(await screen.findByText('Compact public preview')).toBeTruthy()
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})