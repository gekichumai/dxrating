import { ADMIN_COMMENT_MODERATION_REASON_MAX_LENGTH, type AdminContractOutputs } from '@gekichumai/admin-contract'
import { MantineProvider } from '@mantine/core'
import { Notifications, notifications } from '@mantine/notifications'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ORPCError } from '@orpc/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import { AdminAuthProvider, type AdminPrincipal } from '../auth/admin-auth-context'
import { AdminRecentAuthProvider, type AdminRecentAuthLabels } from '../auth/admin-recent-auth'
import type { AdminDataClient } from '../data/admin-client'
import { AdminDataProvider } from '../data/admin-data-context'
import { createAdminTestQueryClient } from '../data/query-client'
import { adminQueryKeys } from '../data/query-keys'
import { TranslationProvider } from '../i18n'
import { CommentModerationControls, type CommentModerationControlsLabels } from './comment-moderation-controls'

type CommentModerationDetail = AdminContractOutputs['getCommentModerationDetail']

const NOW = Date.parse('2026-08-24T12:00:00.000Z')
const RECENT_AUTH_EXPIRES_AT = new Date(NOW + 5 * 60_000).toISOString()

const labels: CommentModerationControlsLabels = {
  title: 'Comment moderation',
  deleteAction: 'Delete comment',
  restoreAction: 'Restore comment',
  reasonLabel: 'Deletion reason',
  reasonDescription: 'This private reason is retained in moderation history.',
  reasonRequired: 'Enter a deletion reason.',
  reasonTooLong: 'The deletion reason is too long.',
  deleteWarning: 'The public comment becomes a tombstone while immutable evidence is retained.',
  restoreWarning: 'The original comment body will become publicly visible again.',
  targetCommentLabel: 'Comment ID',
  targetAuthorLabel: 'Author',
  confirmDeleteTitle: 'Confirm comment deletion',
  confirmDeleteDescription: 'Review the target before deleting this comment.',
  confirmDeleteAction: 'Confirm deletion',
  confirmRestoreTitle: 'Confirm comment restoration',
  confirmRestoreDescription: 'Review the target before restoring this comment.',
  confirmRestoreAction: 'Confirm restoration',
  cancelAction: 'Cancel',
  verificationRequired: 'Identity confirmation is required.',
  verificationCancelled: 'Identity confirmation was cancelled. No comment changed.',
  verificationCompleteRetry: 'Identity confirmed. Review and retry the action explicitly.',
  verifyIdentityAction: 'Verify identity',
  retryAction: 'Review retry',
  conflictError: 'The comment changed. Current moderation context is being refreshed.',
  forbiddenError: 'You no longer have permission to moderate this author.',
  genericError: 'The comment moderation action could not be completed.',
  refreshAction: 'Refresh current state',
  disabledSelf: 'You cannot moderate your own comment.',
  disabledHierarchy: 'Only a super administrator can moderate an administrator comment.',
  disabledSuperAdmin: 'Super administrator comments cannot be moderated here.',
  disabledCapability: 'Your account cannot moderate comments.',
  successNotification: 'Comment moderation updated.',
}

const recentAuthLabels: AdminRecentAuthLabels = {
  cancel: 'Cancel verification',
  description: 'Confirm your identity before continuing.',
  googleSubmit: 'Verify with Google',
  or: 'or',
  passwordLabel: 'Current password',
  passwordSubmit: 'Verify password',
  title: 'Verify identity',
}

const adminPrincipal: AdminPrincipal = {
  userId: 'admin-user',
  effectiveRole: 'admin',
  capabilities: {
    canManageAdministrators: false,
    canModerateAdministrators: false,
    canModerateUsers: true,
  },
}

const superAdminPrincipal: AdminPrincipal = {
  userId: 'super-admin-user',
  effectiveRole: 'super_admin',
  capabilities: {
    canManageAdministrators: true,
    canModerateAdministrators: true,
    canModerateUsers: true,
  },
}

const commentDetail = ({
  authorRole = 'user',
  authorUserId = 'comment-author',
  commentId = '42',
  state = 'visible',
}: {
  readonly authorRole?: 'admin' | 'super_admin' | 'user'
  readonly authorUserId?: string
  readonly commentId?: string
  readonly state?: 'deleted' | 'visible'
} = {}): CommentModerationDetail => ({
  activePublication: null,
  comment: {
    id: commentId,
    parentId: null,
    rootId: commentId,
    authorUserId,
    chart: {
      availability: 'unresolved',
      legacyReference: {
        legacySongId: 'legacy-song',
        sheetType: 'dx',
        sheetDifficulty: 'master',
      },
      songLabel: 'Unavailable song',
      chartLabel: 'Master DX',
      songId: null,
      chartId: null,
    },
    createdAt: '2026-08-24T10:00:00.000Z',
    originalBody: 'Original immutable comment evidence',
  },
  state:
    state === 'deleted'
      ? {
          status: 'deleted',
          stateVersion: '7',
          actorUserId: 'other-admin',
          moderatedAt: '2026-08-24T11:00:00.000Z',
          reason: 'Existing private deletion reason',
        }
      : {
          status: 'visible',
          stateVersion: null,
          actorUserId: null,
          moderatedAt: null,
          reason: null,
        },
  author: {
    userId: authorUserId,
    displayName: 'Comment Author',
    email: 'author@example.com',
    emailVerified: true,
    effectiveRole: authorRole,
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
})

const definedError = (code: string, status: number) =>
  new ORPCError(code, {
    data: { requestId: null },
    defined: true,
    message: 'Raw server details must not be rendered',
    status,
  })

type HarnessOptions = {
  readonly deleteComment?: ReturnType<typeof vi.fn>
  readonly detail?: CommentModerationDetail
  readonly initialRecentAuth?: boolean
  readonly principal?: AdminPrincipal
  readonly reportFeatureError?: Mock<(error: unknown) => boolean>
  readonly restoreComment?: ReturnType<typeof vi.fn>
  readonly strictMode?: boolean
}

const renderControls = ({
  deleteComment = vi.fn(async () => ({ updated: true })),
  detail = commentDetail(),
  initialRecentAuth = true,
  principal = adminPrincipal,
  reportFeatureError = vi.fn((_error: unknown) => false),
  restoreComment = vi.fn(async () => ({ updated: true })),
  strictMode = false,
}: HarnessOptions = {}) => {
  const completePrimaryAuthPassword = vi.fn(async () => ({
    completed: true as const,
    expiresAt: RECENT_AUTH_EXPIRES_AT,
  }))
  const initiatePrimaryAuthOauth = vi.fn(async () => ({
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=test',
  }))
  const data = {
    client: {
      completePrimaryAuthPassword,
      deleteComment,
      initiatePrimaryAuthOauth,
      restoreComment,
    },
    orpc: {},
  } as unknown as AdminDataClient
  const queryClient = createAdminTestQueryClient()
  if (initialRecentAuth) {
    queryClient.setQueryData(
      adminQueryKeys.primaryAuth.status(),
      { active: true, expiresAt: RECENT_AUTH_EXPIRES_AT },
      { updatedAt: NOW },
    )
  }

  const Harness = ({ detailValue }: { readonly detailValue: CommentModerationDetail }) => {
    const controls = (
      <TranslationProvider>
        <MantineProvider>
          <Notifications position="top-right" />
          <QueryClientProvider client={queryClient}>
            <AdminDataProvider value={data}>
              <AdminAuthProvider
                actions={{ reportFeatureError, retry: async () => undefined, signOut: async () => undefined }}
                value={{ principal, status: 'authenticated' }}
              >
                <AdminRecentAuthProvider labels={recentAuthLabels} now={() => NOW}>
                  <CommentModerationControls detail={detailValue} labels={labels} principal={principal} />
                </AdminRecentAuthProvider>
              </AdminAuthProvider>
            </AdminDataProvider>
          </QueryClientProvider>
        </MantineProvider>
      </TranslationProvider>
    )
    return strictMode ? <StrictMode>{controls}</StrictMode> : controls
  }
  const rendered = render(<Harness detailValue={detail} />)

  return {
    completePrimaryAuthPassword,
    deleteComment,
    Harness,
    queryClient,
    rendered,
    reportFeatureError,
    restoreComment,
  }
}

const enterDeleteReason = async (
  user: ReturnType<typeof userEvent.setup>,
  reason = 'Private comment moderation evidence',
) => {
  await user.type(screen.getByLabelText(labels.reasonLabel), reason)
}

const confirmDeletion = async (user: ReturnType<typeof userEvent.setup>, commentId = '42') => {
  await user.click(screen.getByRole('button', { name: labels.deleteAction }))
  const dialog = await screen.findByRole('dialog', { name: labels.confirmDeleteTitle })
  expect(dialog.textContent).toContain(labels.confirmDeleteDescription)
  expect(within(dialog).getByText(labels.targetCommentLabel)).toBeTruthy()
  expect(within(dialog).getByText(commentId)).toBeTruthy()
  expect(within(dialog).getByText(labels.targetAuthorLabel)).toBeTruthy()
  expect(within(dialog).getByText('Comment Author')).toBeTruthy()
  expect(within(dialog).getByText('comment-author')).toBeTruthy()
  expect(within(dialog).getByText(labels.deleteWarning)).toBeTruthy()
  await user.click(within(dialog).getByRole('button', { name: labels.confirmDeleteAction }))
}

afterEach(() => {
  act(() => notifications.clean())
  vi.restoreAllMocks()
})

describe('comment moderation controls', () => {
  it('requires and bounds a private deletion reason before confirmation', async () => {
    const user = userEvent.setup()
    const { deleteComment } = renderControls()

    await user.click(screen.getByRole('button', { name: labels.deleteAction }))
    expect(screen.getByText(labels.reasonRequired)).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.change(screen.getByLabelText(labels.reasonLabel), {
      target: { value: 'x'.repeat(ADMIN_COMMENT_MODERATION_REASON_MAX_LENGTH + 1) },
    })
    await user.click(screen.getByRole('button', { name: labels.deleteAction }))
    expect(screen.getByText(labels.reasonTooLong)).toBeTruthy()
    expect(deleteComment).not.toHaveBeenCalled()
  })

  it('deletes with exact optimistic-concurrency input and invalidates every affected read model', async () => {
    const notification = vi.spyOn(notifications, 'show')
    const privateReason = 'Private delete evidence'
    const user = userEvent.setup()
    const { deleteComment, queryClient } = renderControls()
    const invalidatedKeys = [
      adminQueryKeys.dashboard.overview(),
      adminQueryKeys.comments.list({ status: 'active' }),
      adminQueryKeys.comments.detail('42'),
      adminQueryKeys.comments.moderationDetail('42', { commentHistoryCursor: 'page-2' }),
      adminQueryKeys.users.detail('comment-author'),
      adminQueryKeys.users.activity('comment-author'),
      adminQueryKeys.users.banHistory('comment-author'),
    ]
    const unaffectedKeys = [adminQueryKeys.comments.detail('84'), adminQueryKeys.users.detail('other-user')]
    for (const queryKey of [...invalidatedKeys, ...unaffectedKeys]) queryClient.setQueryData(queryKey, { cached: true })
    await user.type(screen.getByLabelText(labels.reasonLabel), `  ${privateReason}  `)
    await user.click(screen.getByRole('button', { name: labels.deleteAction }))
    const confirmation = await screen.findByRole('dialog', { name: labels.confirmDeleteTitle })
    expect(within(confirmation).queryByText(privateReason)).toBeNull()
    await user.click(within(confirmation).getByRole('button', { name: labels.confirmDeleteAction }))

    await waitFor(() => expect(deleteComment).toHaveBeenCalledOnce())
    expect(deleteComment.mock.calls[0]?.[0]).toEqual({
      params: { commentId: '42' },
      body: { confirmed: true, expectedStateVersion: null, reason: privateReason },
    })
    expect(deleteComment.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal)
    for (const queryKey of invalidatedKeys) expect(queryClient.getQueryState(queryKey)?.isInvalidated).toBe(true)
    for (const queryKey of unaffectedKeys) expect(queryClient.getQueryState(queryKey)?.isInvalidated).toBe(false)
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0)
    expect(notification).toHaveBeenCalledWith({ color: 'green', message: labels.successNotification })
    expect(JSON.stringify(notification.mock.calls)).not.toContain(privateReason)
  })

  it('restores with confirmed true, the exact state version, and no reason', async () => {
    const user = userEvent.setup()
    const { queryClient, restoreComment } = renderControls({
      detail: commentDetail({ state: 'deleted' }),
      initialRecentAuth: false,
    })

    expect(screen.queryByLabelText(labels.reasonLabel)).toBeNull()
    expect(screen.queryByRole('button', { name: /edit|bulk/i })).toBeNull()
    await user.click(screen.getByRole('button', { name: labels.restoreAction }))
    const dialog = await screen.findByRole('dialog', { name: labels.confirmRestoreTitle })
    expect(dialog.textContent).toContain(labels.confirmRestoreDescription)
    expect(within(dialog).getByText(labels.restoreWarning)).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: labels.confirmRestoreAction }))

    await waitFor(() => expect(restoreComment).toHaveBeenCalledOnce())
    expect(screen.queryByRole('dialog', { name: recentAuthLabels.title })).toBeNull()
    expect(restoreComment.mock.calls[0]?.[0]).toEqual({
      params: { commentId: '42' },
      body: { confirmed: true, expectedStateVersion: '7' },
    })
    expect(JSON.stringify(restoreComment.mock.calls[0]?.[0])).not.toContain('reason')
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0)
  })

  it('does not submit deletion when shared identity confirmation is cancelled', async () => {
    const user = userEvent.setup()
    const { deleteComment } = renderControls({ initialRecentAuth: false })
    await enterDeleteReason(user, 'Preserve this reason')
    await user.click(screen.getByRole('button', { name: labels.deleteAction }))
    await user.click(screen.getByRole('button', { name: labels.confirmDeleteAction }))
    expect(await screen.findByRole('dialog', { name: recentAuthLabels.title })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: recentAuthLabels.cancel }))

    expect(await screen.findByText(labels.verificationCancelled)).toBeTruthy()
    expect(deleteComment).not.toHaveBeenCalled()
    expect(screen.getByDisplayValue('Preserve this reason')).toBeTruthy()
  })

  it('forces expired step-up, preserves the reason, and requires explicit review before retry', async () => {
    const user = userEvent.setup()
    const deleteComment = vi
      .fn()
      .mockRejectedValueOnce(definedError('RECENT_AUTH_REQUIRED', 401))
      .mockResolvedValueOnce({ updated: true })
    const { completePrimaryAuthPassword, queryClient } = renderControls({ deleteComment })
    await enterDeleteReason(user, 'Retain across forced verification')
    await confirmDeletion(user)

    const stepUpDialog = await screen.findByRole('dialog', { name: recentAuthLabels.title })
    expect(queryClient.getQueryState(adminQueryKeys.primaryAuth.status())).toBeUndefined()
    expect(deleteComment).toHaveBeenCalledOnce()
    const password = within(stepUpDialog).getByLabelText(/Current password/)
    fireEvent.change(password, { target: { value: 'primary-password' } })
    fireEvent.click(within(stepUpDialog).getByRole('button', { name: recentAuthLabels.passwordSubmit }))

    expect(await screen.findByText(labels.verificationCompleteRetry)).toBeTruthy()
    expect(screen.getByDisplayValue('Retain across forced verification')).toBeTruthy()
    expect(completePrimaryAuthPassword).toHaveBeenCalledOnce()
    expect(deleteComment).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: labels.retryAction }))
    expect(await screen.findByRole('dialog', { name: labels.confirmDeleteTitle })).toBeTruthy()
    expect(deleteComment).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: labels.confirmDeleteAction }))
    await waitFor(() => expect(deleteComment).toHaveBeenCalledTimes(2))
  })

  it.each([
    ['conflict', definedError('CONFLICT', 409), labels.conflictError],
    ['forbidden', definedError('FORBIDDEN', 403), labels.forbiddenError],
  ] as const)('refreshes authoritative context without optimism after a %s', async (_name, failure, copy) => {
    const notification = vi.spyOn(notifications, 'show')
    const user = userEvent.setup()
    const deleteComment = vi.fn(async () => {
      throw failure
    })
    const { queryClient, reportFeatureError } = renderControls({ deleteComment })
    const seededKeys = [
      adminQueryKeys.dashboard.overview(),
      adminQueryKeys.comments.list(),
      adminQueryKeys.comments.moderationDetail('42'),
      adminQueryKeys.users.detail('comment-author'),
      adminQueryKeys.users.activity('comment-author'),
    ]
    for (const queryKey of seededKeys) queryClient.setQueryData(queryKey, { authoritative: 'unchanged' })
    await enterDeleteReason(user, 'No optimistic change')
    await confirmDeletion(user)

    expect((await screen.findByRole('alert')).textContent).toContain(copy)
    for (const queryKey of seededKeys) expect(queryClient.getQueryState(queryKey)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryData(adminQueryKeys.comments.moderationDetail('42'))).toEqual({
      authoritative: 'unchanged',
    })
    expect(screen.getByDisplayValue('No optimistic change')).toBeTruthy()
    expect(notification).not.toHaveBeenCalled()
    expect(reportFeatureError).toHaveBeenCalledWith(failure)
  })

  it('preserves the form and offers review before retrying a safe generic failure', async () => {
    const user = userEvent.setup()
    const deleteComment = vi
      .fn()
      .mockRejectedValueOnce(new Error('private backend transport detail'))
      .mockResolvedValueOnce({ updated: true })
    renderControls({ deleteComment })
    await enterDeleteReason(user, 'Retain for explicit retry')
    await confirmDeletion(user)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(labels.genericError)
    expect(alert.textContent).not.toContain('private backend transport detail')
    expect(screen.getByDisplayValue('Retain for explicit retry')).toBeTruthy()
    expect(deleteComment).toHaveBeenCalledOnce()
    await user.click(within(alert).getByRole('button', { name: labels.retryAction }))
    expect(await screen.findByRole('dialog', { name: labels.confirmDeleteTitle })).toBeTruthy()
    expect(deleteComment).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: labels.confirmDeleteAction }))
    await waitFor(() => expect(deleteComment).toHaveBeenCalledTimes(2))
  })

  it('guards against duplicate direct submissions', async () => {
    let resolveDelete: ((value: unknown) => void) | undefined
    const deleteComment = vi.fn(
      async () =>
        await new Promise((resolve) => {
          resolveDelete = resolve
        }),
    )
    const user = userEvent.setup()
    renderControls({ deleteComment })
    await enterDeleteReason(user, 'One request only')
    await user.click(screen.getByRole('button', { name: labels.deleteAction }))
    const confirm = await screen.findByRole('button', { name: labels.confirmDeleteAction })

    fireEvent.click(confirm)
    fireEvent.click(confirm)
    await waitFor(() => expect(deleteComment).toHaveBeenCalledOnce())
    resolveDelete?.({ updated: true })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: labels.confirmDeleteTitle })).toBeNull())
  })

  it.each([
    ['ordinary author is allowed for an admin', adminPrincipal, commentDetail(), null, false],
    [
      'administrator author is hierarchy-disabled for an admin',
      adminPrincipal,
      commentDetail({ authorRole: 'admin' }),
      labels.disabledHierarchy,
      true,
    ],
    [
      'administrator author is allowed for a super admin',
      superAdminPrincipal,
      commentDetail({ authorRole: 'admin' }),
      null,
      false,
    ],
    [
      'super administrator author is always disabled',
      adminPrincipal,
      commentDetail({ authorRole: 'super_admin' }),
      labels.disabledSuperAdmin,
      true,
    ],
    [
      'self-authored comment is disabled',
      adminPrincipal,
      commentDetail({ authorUserId: adminPrincipal.userId }),
      labels.disabledSelf,
      true,
    ],
    [
      'missing user moderation capability is disabled',
      { ...adminPrincipal, capabilities: { ...adminPrincipal.capabilities, canModerateUsers: false } },
      commentDetail(),
      labels.disabledCapability,
      true,
    ],
  ] as const)('%s', (_name, principal, detail, explanation, disabled) => {
    renderControls({ detail, principal })

    expect((screen.getByRole('button', { name: labels.deleteAction }) as HTMLButtonElement).disabled).toBe(disabled)
    if (explanation) expect(screen.getByText(explanation)).toBeTruthy()
  })

  it('aborts the old request and discards its completion when the selected comment changes', async () => {
    let observedSignal: AbortSignal | undefined
    let resolveDelete: ((value: unknown) => void) | undefined
    const notification = vi.spyOn(notifications, 'show')
    const deleteComment = vi.fn(async (_input: unknown, options: { readonly signal?: AbortSignal }) => {
      observedSignal = options.signal
      return await new Promise((resolve) => {
        resolveDelete = resolve
      })
    })
    const user = userEvent.setup()
    const { Harness, rendered } = renderControls({ deleteComment })
    await enterDeleteReason(user, 'Must not cross subjects')
    await confirmDeletion(user)
    await waitFor(() => expect(observedSignal).toBeDefined())

    rendered.rerender(<Harness detailValue={commentDetail({ commentId: '84' })} />)
    expect(observedSignal?.aborted).toBe(true)
    expect((screen.getByLabelText(labels.reasonLabel) as HTMLTextAreaElement).value).toBe('')
    await act(async () => {
      resolveDelete?.({ updated: true })
    })

    expect(notification).not.toHaveBeenCalled()
  })

  it('aborts an in-flight direct request on unmount and remains correct under StrictMode replay', async () => {
    let observedSignal: AbortSignal | undefined
    const deleteComment = vi.fn(async (_input: unknown, options: { readonly signal?: AbortSignal }) => {
      observedSignal = options.signal
      return await new Promise(() => undefined)
    })
    const user = userEvent.setup()
    const { rendered } = renderControls({ deleteComment, strictMode: true })
    await enterDeleteReason(user, 'Abort on unmount')
    await confirmDeletion(user)
    await waitFor(() => expect(observedSignal).toBeDefined())

    rendered.unmount()

    expect(observedSignal?.aborted).toBe(true)
  })
})