import { ADMIN_DELETED_COMMENT_PREVIEW, type AdminContractOutputs } from '@gekichumai/admin-contract'
import { MantineProvider } from '@mantine/core'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, type Mock } from 'vitest'
import { CommentSearchTable, type CommentSearchTableLabels } from './comment-search-table'

const labels: CommentSearchTableLabels = {
  caption: 'Newest comments',
  tableRegion: 'Scrollable newest-comment results',
  loading: 'Loading comments',
  emptyTitle: 'No comments found',
  emptyDescription: 'Change the filters and try again.',
  newestFirst: 'Fixed order: newest comments first.',
  columns: {
    preview: 'Comment preview',
    author: 'Author',
    chart: 'Chart context',
    thread: 'Thread context',
    createdAt: 'Created',
    status: 'Status',
    action: 'Action',
  },
  activeStatus: 'Active',
  deletedStatus: 'Tombstoned',
  rootComment: 'Root comment',
  reply: 'Reply',
  previewTruncated: 'Preview truncated',
  bannedAuthor: 'User currently banned',
  currentChart: 'Current chart',
  historicalChart: 'Historical chart',
  unresolvedChart: 'Unresolved chart',
  commentId: 'Comment ID',
  userId: 'User ID',
  chartId: 'Chart ID',
  rootId: 'Root ID',
  parentId: 'Parent ID',
  openUser: 'Open user moderation',
  openChart: 'Open chart context',
  openDrawer: 'Open moderation drawer',
  dateTime: { local: 'Local time', utc: 'UTC' },
}

const author = {
  userId: 'user-1',
  displayName: 'Person One',
  effectiveRole: 'user' as const,
  isBanned: false,
}

const rows = [
  {
    id: '103',
    parentId: null,
    rootId: '103',
    createdAt: '2026-08-24T12:00:00.000Z',
    status: 'active' as const,
    bodyPreview: 'A control-safe current-chart preview',
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
    author: { ...author, isBanned: true },
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
    author: { ...author, userId: 'user/encoded id' },
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

const renderTable = async ({
  loading = false,
  onOpenComment = vi.fn(),
  tableRows = rows,
}: {
  readonly loading?: boolean
  readonly onOpenComment?: Mock<(commentId: string) => void>
  readonly tableRows?: AdminContractOutputs['listRecentComments']['items']
} = {}) => {
  return {
    onOpenComment,
    ...render(
      <MantineProvider>
        <CommentSearchTable
          labels={labels}
          loading={loading}
          locale="en-US"
          onOpenComment={onOpenComment}
          rows={tableRows}
        />
      </MantineProvider>,
    ),
  }
}

describe('administrator comment search table', () => {
  it('renders only server projections with newest, status, thread, timestamp, and safe-preview context', async () => {
    const tombstoneWithPrivateField = { ...rows[2]!, immutableOriginal: 'PRIVATE ORIGINAL MUST NOT RENDER' }
    const tableRows: AdminContractOutputs['listRecentComments']['items'] = [
      rows[0]!,
      rows[1]!,
      tombstoneWithPrivateField,
    ]
    await renderTable({ tableRows })

    expect(screen.getByText(labels.newestFirst)).toBeTruthy()
    expect(screen.getByText('A control-safe current-chart preview')).toBeTruthy()
    expect(screen.getByText(labels.previewTruncated)).toBeTruthy()
    expect(screen.getByText(ADMIN_DELETED_COMMENT_PREVIEW)).toBeTruthy()
    expect(document.body.textContent).not.toContain('PRIVATE ORIGINAL MUST NOT RENDER')
    expect(screen.getAllByText(labels.activeStatus)).toHaveLength(2)
    expect(screen.getByText(labels.deletedStatus)).toBeTruthy()
    expect(screen.getAllByText(labels.rootComment)).toHaveLength(2)
    expect(screen.getByText(labels.reply)).toBeTruthy()
    expect(screen.getByText(labels.bannedAuthor)).toBeTruthy()
    expect(document.querySelectorAll('time')).toHaveLength(6)

    const table = screen.getByRole('table', { name: labels.caption })
    const renderedRows = within(table).getAllByRole('row')
    expect(renderedRows).toHaveLength(4)
    expect(renderedRows.slice(1).map((row) => row.textContent?.match(/10[1-3]/)?.[0])).toEqual(['103', '102', '101'])
    expect(within(table).queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('button', { name: /edit/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /bulk/i })).toBeNull()
  })

  it('uses only approved stable user/chart links and omits a chart link for unresolved identity', async () => {
    await renderTable()

    const userLinks = screen.getAllByRole('link', { name: `${labels.openUser}: Person One` })
    expect(userLinks).toHaveLength(3)
    expect(userLinks.map((link) => link.getAttribute('href'))).toEqual([
      '/users/user-1?sourceCommentId=103',
      '/users/user-1?sourceCommentId=102',
      '/users/user%2Fencoded%20id?sourceCommentId=101',
    ])

    const chartLinks = screen.getAllByRole('link', { name: new RegExp(`^${labels.openChart}:`) })
    expect(chartLinks.map((link) => link.getAttribute('href'))).toEqual([
      '/charts?chartId=dsht_23456789ab',
      '/charts?chartId=dsht_abcdefghjk',
    ])
    expect(screen.getByText(labels.unresolvedChart)).toBeTruthy()
    expect(document.querySelectorAll('a')).toHaveLength(5)
  })

  it('opens the selected server comment only through the explicit row action', async () => {
    const user = userEvent.setup()
    const { onOpenComment } = await renderTable()

    const actions = screen.getAllByRole('button', { name: labels.openDrawer })
    expect(actions).toHaveLength(3)
    await user.click(actions[1]!)
    expect(onOpenComment).toHaveBeenCalledOnce()
    expect(onOpenComment).toHaveBeenCalledWith('102')
  })

  it('provides explicit loading and empty states without fabricated comment rows or actions', async () => {
    const loading = await renderTable({ loading: true, tableRows: [] })
    expect(screen.getByRole('status').textContent).toContain(labels.loading)
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    loading.unmount()

    await renderTable({ tableRows: [] })
    expect(screen.getByText(labels.emptyTitle)).toBeTruthy()
    expect(screen.getByText(labels.emptyDescription)).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('keeps native table semantics inside a named, keyboard-focusable horizontal region', async () => {
    await renderTable()

    const region = screen.getByRole('region', { name: labels.tableRegion })
    expect(region.getAttribute('tabindex')).toBe('0')
    expect(within(region).getByRole('table', { name: labels.caption })).toBeTruthy()
    expect(
      within(region)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual([
      labels.columns.preview,
      labels.columns.author,
      labels.columns.chart,
      labels.columns.thread,
      labels.columns.createdAt,
      labels.columns.status,
      labels.columns.action,
    ])
  })
})