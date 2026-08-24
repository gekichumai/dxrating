import { ADMIN_DELETED_COMMENT_PREVIEW, type AdminContractOutputs } from '@gekichumai/admin-contract'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AdminProviders } from '../providers'
import { createAdminTestRuntime } from '../test/render-admin-app'
import { UserRecentComments, type UserRecentCommentsLabels } from './user-recent-comments'

const labels: UserRecentCommentsLabels = {
  title: 'Recent comments',
  loading: 'Loading recent comments',
  empty: 'No recent comments found.',
  active: 'Active',
  deleted: 'Deleted',
  root: 'Root comment',
  reply: 'Reply',
  currentChart: 'Current chart',
  historicalChart: 'Historical chart',
  unresolvedChart: 'Unresolved chart',
  commentId: 'Comment ID',
  song: 'Song',
  chart: 'Chart',
  songId: 'Stable song ID',
  chartId: 'Stable chart ID',
  legacyReference: 'Stored chart reference',
  legacySongId: 'Legacy song ID',
  sheetType: 'Sheet type',
  sheetDifficulty: 'Sheet difficulty',
  createdAt: 'Created',
  viewContext: 'View comment context',
  previewTruncated: 'Preview truncated',
  backToNewest: 'Back to newest',
  older: 'Older comments',
  dateTime: { local: 'Local time', utc: 'UTC' },
}

const author = {
  userId: 'user-1',
  displayName: 'Person One',
  effectiveRole: 'user' as const,
  isBanned: false,
}

const recentComments = [
  {
    id: '103',
    parentId: null,
    rootId: '103',
    createdAt: '2026-08-24T12:00:00.000Z',
    status: 'active' as const,
    bodyPreview: 'A long but safe current-chart preview',
    bodyPreviewTruncated: true,
    author,
    chart: {
      availability: 'current' as const,
      legacyReference: { legacySongId: 'legacy-current', sheetType: 'dx', sheetDifficulty: 'master' },
      songLabel: 'Current Song',
      chartLabel: 'Master (DX)',
      songId: 'dsng_23456789ab',
      chartId: 'dsht_23456789ab',
    },
  },
  {
    id: '102',
    parentId: '88',
    rootId: '80',
    createdAt: '2026-08-24T11:00:00.000Z',
    status: 'active' as const,
    bodyPreview: 'Historical reply',
    bodyPreviewTruncated: false,
    author,
    chart: {
      availability: 'historical' as const,
      legacyReference: { legacySongId: 'legacy-history', sheetType: 'standard', sheetDifficulty: 'expert' },
      songLabel: 'Retired Song',
      chartLabel: 'Expert (Standard)',
      songId: 'dsng_abcdefghjk',
      chartId: 'dsht_abcdefghjk',
    },
  },
  {
    id: '101',
    parentId: null,
    rootId: '101',
    createdAt: '2026-08-24T10:00:00.000Z',
    status: 'deleted' as const,
    bodyPreview: ADMIN_DELETED_COMMENT_PREVIEW,
    bodyPreviewTruncated: false,
    author: { ...author, isBanned: true },
    chart: {
      availability: 'unresolved' as const,
      legacyReference: { legacySongId: 'missing-song', sheetType: 'dx', sheetDifficulty: 'remaster' },
      songLabel: 'Unavailable song',
      chartLabel: 'Re:Master (DX)',
      songId: null,
      chartId: null,
    },
  },
] satisfies AdminContractOutputs['listRecentComments']['items']

const output: AdminContractOutputs['listRecentComments'] = {
  items: recentComments,
  nextCursor: null,
  normalizedFilters: {
    authorUserId: 'user-1',
    chartId: null,
    status: null,
    createdAtFromInclusive: null,
    createdAtBeforeExclusive: null,
  },
  activePublication: { channel: 'production-v1', catalogRunId: '8', revision: '12' },
}

const renderRecentComments = ({
  cursor,
  response = output,
  onCursorChange = vi.fn(),
}: {
  readonly cursor?: string
  readonly response?: AdminContractOutputs['listRecentComments']
  readonly onCursorChange?: (cursor: string | undefined) => void
} = {}) => {
  const fetch = vi.fn(async (_request: RequestInfo | URL) => Response.json(response))
  const runtime = createAdminTestRuntime({ fetch: fetch as unknown as typeof globalThis.fetch })
  return {
    fetch,
    onCursorChange,
    ...render(
      <AdminProviders runtime={runtime}>
        <UserRecentComments
          cursor={cursor}
          labels={labels}
          locale="en-US"
          onCursorChange={onCursorChange}
          userId="user-1"
        />
      </AdminProviders>,
    ),
  }
}

describe('user recent comments', () => {
  it('shows safe previews, status, time, and all chart-availability identities without chart links', async () => {
    const rendered = renderRecentComments()

    expect(await screen.findByRole('heading', { name: labels.title })).toBeTruthy()
    expect(await screen.findByText('A long but safe current-chart preview')).toBeTruthy()
    expect(screen.getByText(labels.previewTruncated)).toBeTruthy()
    expect(screen.getByText(ADMIN_DELETED_COMMENT_PREVIEW)).toBeTruthy()
    expect(screen.getByText(labels.currentChart)).toBeTruthy()
    expect(screen.getByText(labels.historicalChart)).toBeTruthy()
    expect(screen.getByText(labels.unresolvedChart)).toBeTruthy()
    expect(screen.getByText('dsht_23456789ab')).toBeTruthy()
    expect(screen.getByText('dsht_abcdefghjk')).toBeTruthy()
    expect(screen.queryByText('null')).toBeNull()
    expect(document.querySelectorAll('time')).toHaveLength(6)

    const links = screen.getAllByRole('link', { name: labels.viewContext })
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/comments?commentId=103',
      '/comments?commentId=102',
      '/comments?commentId=101',
    ])
    expect(document.querySelectorAll('a')).toHaveLength(3)

    await waitFor(() => expect(rendered.fetch).toHaveBeenCalledOnce())
    const request = rendered.fetch.mock.calls[0]![0]
    expect(request).toBeInstanceOf(Request)
    expect((request as Request).url).toContain('/api/admin/comments?')
    expect((request as Request).url).toContain('authorUserId=user-1')
  })

  it('reports opaque next and reset cursor choices to its owner', async () => {
    const onCursorChange = vi.fn()
    const first = renderRecentComments({
      response: { ...output, items: recentComments.slice(0, 1), nextCursor: 'older_comments_2' },
      onCursorChange,
    })

    fireEvent.click(await screen.findByRole('button', { name: labels.older }))
    expect(onCursorChange).toHaveBeenCalledWith('older_comments_2')
    first.unmount()

    const older = renderRecentComments({ cursor: 'older_comments_2', onCursorChange })
    fireEvent.click(await screen.findByRole('button', { name: labels.backToNewest }))
    expect(onCursorChange).toHaveBeenLastCalledWith(undefined)
    await waitFor(() => expect(older.fetch).toHaveBeenCalledOnce())
    const request = older.fetch.mock.calls[0]![0]
    expect(request).toBeInstanceOf(Request)
    expect((request as Request).url).toContain('cursor=older_comments_2')
  })

  it('renders a clear empty result without comment or chart links', async () => {
    renderRecentComments({ response: { ...output, items: [], activePublication: null } })

    expect(await screen.findByText(labels.empty)).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByRole('listitem')).toBeNull()
  })

  it('has explicit loading and redacted error states', async () => {
    const pendingRuntime = createAdminTestRuntime({
      fetch: (() => new Promise<Response>(() => undefined)) as typeof globalThis.fetch,
    })
    const pending = render(
      <AdminProviders runtime={pendingRuntime}>
        <UserRecentComments labels={labels} locale="en-US" onCursorChange={vi.fn()} userId="user-1" />
      </AdminProviders>,
    )
    expect(screen.getByRole('status').textContent).toContain(labels.loading)
    pending.unmount()

    const errorRuntime = createAdminTestRuntime({
      fetch: vi.fn(async () => {
        throw new TypeError('private transport detail')
      }) as unknown as typeof globalThis.fetch,
    })
    render(
      <AdminProviders runtime={errorRuntime}>
        <UserRecentComments labels={labels} locale="en-US" onCursorChange={vi.fn()} userId="user-1" />
      </AdminProviders>,
    )
    expect((await screen.findByRole('alert')).textContent).toContain('Connection failed')
    expect(document.body.textContent).not.toContain('private transport detail')
  })
})