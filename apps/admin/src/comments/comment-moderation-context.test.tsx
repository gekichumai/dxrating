import type { AdminContractOutputs } from '@gekichumai/admin-contract'
import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen, within, type RenderResult } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  CommentModerationContext,
  type CommentModerationContextLabels,
  type CommentModerationContextProps,
} from './comment-moderation-context'

type CommentModerationDetail = AdminContractOutputs['getCommentModerationDetail']

const labels: CommentModerationContextLabels = {
  title: 'Loaded comment context',
  actionsTitle: 'Available moderation actions',
  dateTime: { local: 'Local time', utc: 'UTC' },
  selected: {
    title: 'Selected immutable evidence',
    readOnly: 'Read-only original',
    originalBody: 'Original comment body',
    commentId: 'Comment ID',
    parentId: 'Parent comment ID',
    noParent: 'No parent',
    rootId: 'Root comment ID',
    authorUserId: 'Author user ID',
    createdAt: 'Created at',
  },
  state: {
    title: 'Current moderation state',
    status: 'Status',
    visible: 'Visible',
    deleted: 'Deleted',
    neverModerated: 'Never moderated',
    stateVersion: 'State version',
    actorUserId: 'Moderating administrator',
    moderatedAt: 'Moderated at',
    reason: 'Private moderation reason',
  },
  chart: {
    title: 'Chart context',
    current: 'Current chart',
    historical: 'Historical chart',
    unresolved: 'Unresolved chart',
    song: 'Song',
    chart: 'Chart',
    songId: 'Song ID',
    chartId: 'Chart ID',
    legacyReference: 'Legacy chart reference',
    legacySongId: 'Legacy song ID',
    sheetType: 'Sheet type',
    sheetDifficulty: 'Sheet difficulty',
    openContext: 'Open chart context',
    publication: 'Active publication',
    publicationChannel: 'Publication channel',
    catalogRunId: 'Catalog run ID',
    revision: 'Revision',
  },
  author: {
    title: 'Author moderation summary',
    displayName: 'Display name',
    userId: 'User ID',
    email: 'Email',
    emailVerification: 'Email verification',
    verified: 'Verified',
    unverified: 'Unverified',
    effectiveRole: 'Effective role',
    roles: { user: 'User', admin: 'Administrator', superAdmin: 'Super administrator' },
    banState: 'Current ban state',
    banStatuses: {
      unbanned: 'Not banned',
      expired: 'Ban expired',
      temporary: 'Temporarily banned',
      permanent: 'Permanently banned',
    },
    noActiveBan: 'No active ban',
    reason: 'Ban reason',
    actorUserId: 'Banning administrator',
    banStartedAt: 'Ban started at',
    expiresAt: 'Ban expires at',
    evaluatedAt: 'Ban evaluated at',
    openModeration: 'Open author moderation',
  },
  thread: {
    title: 'Thread hierarchy',
    empty: 'No thread entries were returned.',
    partial: 'Partial thread segment',
    complete: 'Complete thread',
    deletedTombstone: 'Deleted comment',
    visible: 'Visible comment',
    root: 'Root',
    reply: 'Reply',
    depth: 'Thread depth',
    parentId: 'Parent comment ID',
    author: 'Comment author',
    createdAt: 'Comment created at',
    selected: 'Selected comment',
    restart: 'Restart thread',
    continue: 'Continue thread',
  },
  commentHistory: {
    title: 'Comment moderation history',
    empty: 'No comment moderation events were returned.',
    delete: 'Comment deleted',
    restore: 'Comment restored',
    reason: 'Event reason',
    noReason: 'No reason recorded',
    actorUserId: 'Event administrator',
    occurredAt: 'Event occurred at',
    eventId: 'Comment event ID',
    restart: 'Restart comment history',
    continue: 'Continue comment history',
  },
  authorBanHistory: {
    title: 'Author ban history',
    empty: 'No author ban events were returned.',
    temporaryBan: 'Temporary ban',
    permanentBan: 'Permanent ban',
    unban: 'Unban',
    reason: 'Ban event reason',
    noReason: 'No reason recorded',
    actorUserId: 'Ban event administrator',
    occurredAt: 'Ban event occurred at',
    banStartedAt: 'Ban event started at',
    expiresAt: 'Ban event expires at',
    eventId: 'Ban event ID',
    restart: 'Restart author ban history',
    continue: 'Continue author ban history',
  },
}

const visibleState = {
  status: 'visible' as const,
  stateVersion: null,
  actorUserId: null,
  moderatedAt: null,
  reason: null,
}

const deletedState = (stateVersion: string, reason: string) => ({
  status: 'deleted' as const,
  stateVersion,
  actorUserId: 'moderator-1',
  moderatedAt: '2026-08-24T11:00:00.000Z',
  reason,
})

const authorSummary = (userId: string, displayName: string) => ({
  userId,
  displayName,
  effectiveRole: 'user' as const,
  isBanned: false,
})

const commentDetail = (): CommentModerationDetail => ({
  activePublication: {
    channel: 'production-v1',
    catalogRunId: '125',
    revision: '9',
  },
  comment: {
    id: '42',
    parentId: '40',
    rootId: '40',
    authorUserId: 'author/id',
    chart: {
      availability: 'current',
      legacyReference: {
        legacySongId: 'legacy-song-7',
        sheetType: 'dx',
        sheetDifficulty: 'master',
      },
      songLabel: 'Current Song',
      chartLabel: 'Master DX',
      songId: 'song-7',
      chartId: 'chart/id-7',
    },
    createdAt: '2026-08-24T10:00:00.000Z',
    originalBody: 'Selected immutable original',
  },
  state: deletedState('comment-state-3', 'Selected comment deletion reason'),
  author: {
    userId: 'author/id',
    displayName: 'Selected Author',
    email: 'selected-author@example.test',
    emailVerified: true,
    effectiveRole: 'admin',
    banState: {
      status: 'temporary',
      stateVersion: 'ban-state-8',
      reason: 'Temporary safety hold',
      actorUserId: 'super-admin-1',
      banStartedAt: '2026-08-24T09:00:00.000Z',
      expiresAt: '2026-08-25T09:00:00.000Z',
      evaluatedAt: '2026-08-24T12:00:00.000Z',
    },
  },
  thread: {
    items: [
      {
        id: '40',
        parentId: null,
        rootId: '40',
        depth: 0,
        createdAt: '2026-08-24T08:00:00.000Z',
        originalBody: 'Visible root body',
        state: visibleState,
        author: authorSummary('root-author', 'Root Author'),
      },
      {
        id: '42',
        parentId: '40',
        rootId: '40',
        depth: 1,
        createdAt: '2026-08-24T10:00:00.000Z',
        originalBody: 'Selected immutable original',
        state: deletedState('comment-state-3', 'Selected comment deletion reason'),
        author: authorSummary('author/id', 'Selected Author'),
      },
      {
        id: '43',
        parentId: '42',
        rootId: '40',
        depth: 2,
        createdAt: '2026-08-24T10:10:00.000Z',
        originalBody: 'NEVER SHOW DELETED DESCENDANT SECRET',
        state: deletedState('comment-state-4', 'Private descendant reason'),
        author: authorSummary('deleted-author', 'Deleted Author'),
      },
      {
        id: '44',
        parentId: '43',
        rootId: '40',
        depth: 3,
        createdAt: '2026-08-24T10:20:00.000Z',
        originalBody: 'Visible nested reply body',
        state: visibleState,
        author: authorSummary('nested-author', 'Nested Author'),
      },
    ],
    completeness: 'partial',
    nextCursor: 'thread-next',
  },
  commentHistory: {
    items: [
      {
        id: 'comment-event-3',
        commentId: '42',
        actorUserId: 'moderator-1',
        previousEventId: 'comment-event-2',
        createdAt: '2026-08-24T11:00:00.000Z',
        action: 'delete',
        reason: 'History deletion reason',
      },
      {
        id: 'comment-event-2',
        commentId: '42',
        actorUserId: 'moderator-2',
        previousEventId: 'comment-event-1',
        createdAt: '2026-08-24T10:45:00.000Z',
        action: 'restore',
        reason: null,
      },
    ],
    nextCursor: 'comment-history-next',
  },
  authorBanHistory: {
    items: [
      {
        id: 'ban-event-3',
        subjectUserId: 'author/id',
        actorUserId: 'super-admin-1',
        previousEventId: 'ban-event-2',
        createdAt: '2026-08-24T09:05:00.000Z',
        action: 'ban',
        kind: 'temporary',
        reason: 'Temporary ban history reason',
        banStartedAt: '2026-08-24T09:00:00.000Z',
        expiresAt: '2026-08-25T09:00:00.000Z',
      },
      {
        id: 'ban-event-2',
        subjectUserId: 'author/id',
        actorUserId: 'super-admin-2',
        previousEventId: 'ban-event-1',
        createdAt: '2026-08-23T09:05:00.000Z',
        action: 'ban',
        kind: 'permanent',
        reason: 'Permanent ban history reason',
        banStartedAt: '2026-08-23T09:00:00.000Z',
        expiresAt: null,
      },
      {
        id: 'ban-event-1',
        subjectUserId: 'author/id',
        actorUserId: 'super-admin-3',
        previousEventId: null,
        createdAt: '2026-08-22T09:05:00.000Z',
        action: 'unban',
        kind: null,
        reason: null,
        banStartedAt: null,
        expiresAt: null,
      },
    ],
    nextCursor: 'ban-history-next',
  },
})

type RenderContextOptions = {
  readonly actionContent?: ReactNode
  readonly detail?: CommentModerationDetail
  readonly overrides?: Partial<
    Pick<CommentModerationContextProps, 'authorBanHistoryCursor' | 'commentHistoryCursor' | 'threadCursor'>
  >
}

const renderContext = ({ actionContent, detail = commentDetail(), overrides }: RenderContextOptions = {}): {
  readonly callbacks: {
    readonly authorBanHistory: ReturnType<typeof vi.fn>
    readonly commentHistory: ReturnType<typeof vi.fn>
    readonly thread: ReturnType<typeof vi.fn>
  }
  readonly result: RenderResult
} => {
  const callbacks = {
    authorBanHistory: vi.fn(),
    commentHistory: vi.fn(),
    thread: vi.fn(),
  }
  const result = render(
    <MantineProvider>
      <CommentModerationContext
        actionContent={actionContent}
        detail={detail}
        labels={labels}
        locale="en-US"
        onAuthorBanHistoryCursorChange={callbacks.authorBanHistory}
        onCommentHistoryCursorChange={callbacks.commentHistory}
        onThreadCursorChange={callbacks.thread}
        {...overrides}
      />
    </MantineProvider>,
  )

  return { callbacks, result }
}

const sectionNamed = (name: string): HTMLElement => {
  const section = screen.getByRole('heading', { name }).closest('section')
  if (!section) throw new Error(`Expected a section named ${name}`)
  return section
}

describe('loaded comment moderation context', () => {
  it('separates immutable selected evidence from current state without exposing editing controls', () => {
    renderContext()

    const evidence = sectionNamed(labels.selected.title)
    expect(within(evidence).getByText('Selected immutable original')).toBeTruthy()
    expect(within(evidence).getByText(labels.selected.readOnly)).toBeTruthy()
    expect(within(evidence).getByText('42')).toBeTruthy()
    expect(within(evidence).getAllByText('40')).toHaveLength(2)
    expect(within(evidence).getByText('author/id')).toBeTruthy()
    expect(evidence.querySelector('input, textarea, [contenteditable="true"]')).toBeNull()

    const currentState = sectionNamed(labels.state.title)
    expect(within(currentState).getAllByText(labels.state.deleted).length).toBeGreaterThan(0)
    expect(within(currentState).getByText('comment-state-3')).toBeTruthy()
    expect(within(currentState).getByText('moderator-1')).toBeTruthy()
    expect(within(currentState).getByText('Selected comment deletion reason')).toBeTruthy()
    expect(within(currentState).queryByText(labels.state.neverModerated)).toBeNull()
  })

  it('preserves thread hierarchy while replacing every deleted body with a tombstone', () => {
    renderContext()

    const thread = sectionNamed(labels.thread.title)
    expect(within(thread).getByText(labels.thread.partial)).toBeTruthy()
    expect(within(thread).getByText('Visible root body')).toBeTruthy()
    expect(within(thread).getByText('Visible nested reply body')).toBeTruthy()
    expect(within(thread).getAllByText(labels.thread.deletedTombstone)).toHaveLength(2)
    expect(within(thread).queryByText('Selected immutable original')).toBeNull()
    expect(within(thread).queryByText('NEVER SHOW DELETED DESCENDANT SECRET')).toBeNull()
    expect(within(thread).queryByText('Private descendant reason')).toBeNull()

    const entries = within(thread).getAllByRole('listitem')
    expect(entries).toHaveLength(4)
    expect(entries.map((entry) => entry.getAttribute('data-thread-depth'))).toEqual(['0', '1', '2', '3'])
    expect(entries.map((entry) => entry.style.marginInlineStart)).toEqual(['0px', '14px', '28px', '42px'])
    expect(within(entries[0]!).getByText(labels.thread.root)).toBeTruthy()
    expect(within(entries[1]!).getByText(labels.thread.selected)).toBeTruthy()
    expect(within(entries[3]!).getByText('43')).toBeTruthy()
  })

  it('renders stable chart and author escalation links and only approved author identity fields', () => {
    const base = commentDetail()
    const detailWithUnapprovedRuntimeFields = {
      ...base,
      author: {
        ...base.author,
        lastIpAddress: 'NEVER-RENDER-IP-192.0.2.1',
        oauthAccessToken: 'NEVER-RENDER-OAUTH-TOKEN',
        sessionToken: 'NEVER-RENDER-SESSION-TOKEN',
      },
    } as CommentModerationDetail

    renderContext({ detail: detailWithUnapprovedRuntimeFields })

    const chart = sectionNamed(labels.chart.title)
    expect(within(chart).getByText(labels.chart.current)).toBeTruthy()
    expect(within(chart).getByText('Current Song')).toBeTruthy()
    expect(within(chart).getByText('Master DX')).toBeTruthy()
    expect(within(chart).getByRole('link', { name: labels.chart.openContext }).getAttribute('href')).toBe(
      '/charts?chartId=chart%2Fid-7',
    )
    expect(within(chart).getByText(/production-v1/)).toBeTruthy()
    expect(within(chart).getByText(/125/)).toBeTruthy()
    expect(within(chart).getByText(/9/)).toBeTruthy()

    const author = sectionNamed(labels.author.title)
    expect(within(author).getByText('Selected Author')).toBeTruthy()
    expect(within(author).getByText('selected-author@example.test')).toBeTruthy()
    expect(within(author).getByText(labels.author.verified)).toBeTruthy()
    expect(within(author).getByText(labels.author.roles.admin)).toBeTruthy()
    expect(within(author).getAllByText(labels.author.banStatuses.temporary).length).toBeGreaterThan(0)
    expect(within(author).getByText('Temporary safety hold')).toBeTruthy()
    expect(within(author).getByRole('link', { name: labels.author.openModeration }).getAttribute('href')).toBe(
      '/users/author%2Fid?sourceCommentId=42',
    )
    expect(document.body.textContent).not.toContain('NEVER-RENDER-IP-192.0.2.1')
    expect(document.body.textContent).not.toContain('NEVER-RENDER-OAUTH-TOKEN')
    expect(document.body.textContent).not.toContain('NEVER-RENDER-SESSION-TOKEN')
  })

  it('distinguishes historical and unresolved chart availability without inventing unresolved links', () => {
    const historicalBase = commentDetail()
    const historical: CommentModerationDetail = {
      ...historicalBase,
      comment: {
        ...historicalBase.comment,
        chart: {
          availability: 'historical',
          legacyReference: historicalBase.comment.chart.legacyReference,
          songLabel: 'Historical Song',
          chartLabel: 'Historical Master DX',
          songId: 'song-7',
          chartId: 'chart/id-7',
        },
      },
    }
    const { result } = renderContext({ detail: historical })

    expect(within(sectionNamed(labels.chart.title)).getByText(labels.chart.historical)).toBeTruthy()

    const unresolvedBase = commentDetail()
    const unresolved: CommentModerationDetail = {
      ...unresolvedBase,
      activePublication: null,
      comment: {
        ...unresolvedBase.comment,
        chart: {
          availability: 'unresolved',
          legacyReference: unresolvedBase.comment.chart.legacyReference,
          songLabel: 'Unavailable song',
          chartLabel: 'Unavailable chart',
          songId: null,
          chartId: null,
        },
      },
    }
    result.rerender(
      <MantineProvider>
        <CommentModerationContext
          detail={unresolved}
          labels={labels}
          locale="en-US"
          onAuthorBanHistoryCursorChange={vi.fn()}
          onCommentHistoryCursorChange={vi.fn()}
          onThreadCursorChange={vi.fn()}
        />
      </MantineProvider>,
    )

    const chart = sectionNamed(labels.chart.title)
    expect(within(chart).getByText(labels.chart.unresolved)).toBeTruthy()
    expect(within(chart).queryByRole('link', { name: labels.chart.openContext })).toBeNull()
    expect(within(chart).queryByText(labels.chart.songId)).toBeNull()
    expect(within(chart).queryByText(labels.chart.chartId)).toBeNull()
  })

  it('renders comment and author histories with explicit local and UTC instants', () => {
    renderContext()

    const commentHistory = sectionNamed(labels.commentHistory.title)
    expect(within(commentHistory).getByText(labels.commentHistory.delete)).toBeTruthy()
    expect(within(commentHistory).getByText(labels.commentHistory.restore)).toBeTruthy()
    expect(within(commentHistory).getByText('History deletion reason')).toBeTruthy()
    expect(within(commentHistory).getByText(labels.commentHistory.noReason)).toBeTruthy()
    expect(commentHistory.querySelectorAll('time')).toHaveLength(4)

    const banHistory = sectionNamed(labels.authorBanHistory.title)
    expect(within(banHistory).getByText(labels.authorBanHistory.temporaryBan)).toBeTruthy()
    expect(within(banHistory).getByText(labels.authorBanHistory.permanentBan)).toBeTruthy()
    expect(within(banHistory).getByText(labels.authorBanHistory.unban)).toBeTruthy()
    expect(within(banHistory).getByText('Temporary ban history reason')).toBeTruthy()
    expect(within(banHistory).getByText('Permanent ban history reason')).toBeTruthy()
    expect(within(banHistory).getByText(labels.authorBanHistory.noReason)).toBeTruthy()
    expect(banHistory.querySelectorAll('time')).toHaveLength(12)

    const allTimes = [...document.querySelectorAll('time')]
    expect(allTimes.length).toBeGreaterThan(0)
    expect(allTimes.every((time) => time.dateTime.endsWith('Z'))).toBe(true)
    for (let index = 0; index < allTimes.length; index += 2) {
      expect(allTimes[index]?.dateTime).toBe(allTimes[index + 1]?.dateTime)
    }
    expect(screen.getAllByText(/^Local time:/).length).toBe(allTimes.length / 2)
    expect(screen.getAllByText(/^UTC:/).length).toBe(allTimes.length / 2)
  })

  it('keeps each continuation and restart callback independent', () => {
    const { callbacks } = renderContext({
      overrides: {
        threadCursor: 'thread-current',
        commentHistoryCursor: 'comment-history-current',
        authorBanHistoryCursor: 'ban-history-current',
      },
    })

    fireEvent.click(screen.getByRole('button', { name: labels.thread.restart }))
    fireEvent.click(screen.getByRole('button', { name: labels.thread.continue }))
    fireEvent.click(screen.getByRole('button', { name: labels.commentHistory.restart }))
    fireEvent.click(screen.getByRole('button', { name: labels.commentHistory.continue }))
    fireEvent.click(screen.getByRole('button', { name: labels.authorBanHistory.restart }))
    fireEvent.click(screen.getByRole('button', { name: labels.authorBanHistory.continue }))

    expect(callbacks.thread.mock.calls).toEqual([[undefined], ['thread-next']])
    expect(callbacks.commentHistory.mock.calls).toEqual([[undefined], ['comment-history-next']])
    expect(callbacks.authorBanHistory.mock.calls).toEqual([[undefined], ['ban-history-next']])
  })

  it('handles complete empty segments, optional actions, and initial visible state without edit or bulk UI', () => {
    const base = commentDetail()
    const empty: CommentModerationDetail = {
      ...base,
      state: visibleState,
      author: {
        ...base.author,
        emailVerified: false,
        effectiveRole: 'user',
        banState: {
          status: 'unbanned',
          stateVersion: null,
          reason: null,
          actorUserId: null,
          banStartedAt: null,
          expiresAt: null,
          evaluatedAt: '2026-08-24T12:00:00.000Z',
        },
      },
      thread: { items: [], completeness: 'complete', nextCursor: null },
      commentHistory: { items: [], nextCursor: null },
      authorBanHistory: { items: [], nextCursor: null },
    }

    renderContext({ actionContent: <button type="button">Injected single-item action</button>, detail: empty })

    expect(within(sectionNamed(labels.thread.title)).getByText(labels.thread.complete)).toBeTruthy()
    expect(within(sectionNamed(labels.thread.title)).getByText(labels.thread.empty)).toBeTruthy()
    expect(within(sectionNamed(labels.commentHistory.title)).getByText(labels.commentHistory.empty)).toBeTruthy()
    expect(within(sectionNamed(labels.authorBanHistory.title)).getByText(labels.authorBanHistory.empty)).toBeTruthy()
    expect(within(sectionNamed(labels.state.title)).getByText(labels.state.neverModerated)).toBeTruthy()
    expect(within(sectionNamed(labels.author.title)).getByText(labels.author.unverified)).toBeTruthy()
    expect(within(sectionNamed(labels.author.title)).getByText(labels.author.noActiveBan)).toBeTruthy()
    const actions = sectionNamed(labels.actionsTitle)
    expect(within(actions).getByRole('button', { name: 'Injected single-item action' })).toBeTruthy()
    expect([...document.querySelectorAll('section')].at(-1)).toBe(actions)
    expect(document.querySelector('input, textarea, [contenteditable="true"]')).toBeNull()
    expect(screen.queryByRole('button', { name: /bulk/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /continue|restart/i })).toBeNull()
  })

  it('shows restored-visible state metadata without labeling it as never moderated', () => {
    const base = commentDetail()
    const restored: CommentModerationDetail = {
      ...base,
      state: {
        status: 'visible',
        stateVersion: 'comment-state-4',
        actorUserId: 'restoring-admin',
        moderatedAt: '2026-08-24T11:30:00.000Z',
        reason: null,
      },
    }

    renderContext({ detail: restored })

    const state = sectionNamed(labels.state.title)
    expect(within(state).getAllByText(labels.state.visible).length).toBeGreaterThan(0)
    expect(within(state).getByText('comment-state-4')).toBeTruthy()
    expect(within(state).getByText('restoring-admin')).toBeTruthy()
    expect(within(state).queryByText(labels.state.neverModerated)).toBeNull()
    expect(within(state).queryByText(labels.state.reason)).toBeNull()
  })
})