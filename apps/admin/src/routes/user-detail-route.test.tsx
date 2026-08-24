import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { translate } from '../i18n'
import { createAdminTestRuntime, renderAdminApp } from '../test/render-admin-app'

const target = {
  userId: 'target-user',
  displayName: 'Target User',
  email: 'target@example.test',
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
}

const createDetailFetch = () =>
  vi.fn(async (request: RequestInfo | URL) => {
    const url = new URL((request as Request).url)
    if (url.pathname === '/api/admin/users/target-user') return Response.json(target)
    if (url.pathname === '/api/admin/users/target-user/ban-history') {
      return Response.json({ items: [], nextCursor: null })
    }
    if (url.pathname === '/api/admin/comments') {
      return Response.json({
        items: [],
        nextCursor: null,
        normalizedFilters: {
          authorUserId: 'target-user',
          chartId: null,
          status: null,
          createdAtFromInclusive: null,
          createdAtBeforeExclusive: null,
        },
        activePublication: null,
      })
    }
    return Response.json({ defined: false, code: 'NOT_FOUND', status: 404 }, { status: 404 })
  })

describe('user moderation detail route', () => {
  it('deep-links to approved account context, its independent read models, and a sanitized source comment', async () => {
    const fetch = createDetailFetch()
    const runtime = createAdminTestRuntime({ fetch: fetch as unknown as typeof globalThis.fetch })

    await renderAdminApp('/users/target-user?sourceCommentId=42', { runtime })

    expect(await screen.findByRole('heading', { level: 1, name: translate('page.users.title') })).toBeTruthy()
    expect(await screen.findByText('Target User')).toBeTruthy()
    expect(screen.getByText('target@example.test')).toBeTruthy()
    expect(screen.getByText(translate('users.detail.sourceComment', { commentId: '42' }))).toBeTruthy()
    expect(screen.getByRole('link', { name: translate('users.comments.viewContext') }).getAttribute('href')).toBe(
      '/comments?commentId=42',
    )
    expect(screen.getByRole('link', { name: translate('nav.users') }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByText(translate('users.history.empty'))).toBeTruthy()
    expect(screen.getByText(translate('users.comments.empty'))).toBeTruthy()
    expect(screen.getByRole('button', { name: translate('users.actions.ban') })).toBeTruthy()

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3))
    const urls = fetch.mock.calls.map(([request]) => new URL((request as Request).url))
    expect(urls.find(({ pathname }) => pathname === '/api/admin/comments')?.searchParams.get('authorUserId')).toBe(
      'target-user',
    )
  })

  it('forwards only validated independent history cursors and strips malformed source state', async () => {
    const fetch = createDetailFetch()
    const runtime = createAdminTestRuntime({ fetch: fetch as unknown as typeof globalThis.fetch })
    await renderAdminApp(
      '/users/target-user?commentsCursor=comments_page_2&banHistoryCursor=history_page_2&sourceCommentId=invalid',
      { runtime },
    )

    await screen.findByText('Target User')
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3))
    const urls = fetch.mock.calls.map(([request]) => new URL((request as Request).url))
    expect(urls.find(({ pathname }) => pathname === '/api/admin/comments')?.searchParams.get('cursor')).toBe(
      'comments_page_2',
    )
    expect(
      urls.find(({ pathname }) => pathname === '/api/admin/users/target-user/ban-history')?.searchParams.get('cursor'),
    ).toBe('history_page_2')
    expect(screen.queryByText(/Opened from comment/)).toBeNull()
  })
})