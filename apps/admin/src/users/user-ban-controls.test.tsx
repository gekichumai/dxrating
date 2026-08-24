import type { AdminContractOutputs } from '@gekichumai/admin-contract'
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
import { UserBanControls, type UserBanControlsLabels } from './user-ban-controls'

type UserModerationDetail = AdminContractOutputs['getUserModerationDetail']

const NOW = new Date(2026, 0, 1, 12, 0)
const NOW_MILLISECONDS = NOW.getTime()
const RECENT_AUTH_EXPIRES_AT = new Date(NOW_MILLISECONDS + 5 * 60_000).toISOString()

const labels: UserBanControlsLabels = {
  title: 'Account access controls',
  permanentOption: 'Permanent ban',
  temporaryOption: 'Temporary ban',
  reasonLabel: 'Ban reason',
  reasonDisclosure: 'This reason is shown to the affected account.',
  reasonRequired: 'Enter a reason.',
  reasonTooLong: 'The reason is too long.',
  temporaryExpiryLabel: 'Ban expiry',
  temporaryExpiryDescription: 'Choose a future local time, up to 365 days away.',
  localTimeLabel: 'Local time',
  utcTimeLabel: 'UTC',
  temporaryExpiryRequired: 'Choose an expiry.',
  temporaryExpiryInvalid: 'Enter a valid expiry.',
  temporaryExpiryNotFuture: 'The expiry must be in the future.',
  temporaryExpiryTooFar: 'The expiry cannot be more than 365 days away.',
  sessionRevocationWarning: 'All active sessions will be revoked immediately.',
  contentRetentionWarning: 'Existing comments remain until they are moderated separately.',
  banAction: 'Ban account',
  unbanAction: 'Remove ban',
  confirmBanTitle: 'Confirm account ban',
  confirmBanDescription: 'Review this ban before applying it.',
  confirmBanAction: 'Confirm ban',
  confirmUnbanTitle: 'Confirm ban removal',
  confirmUnbanDescription: 'This account will regain access.',
  confirmUnbanAction: 'Confirm removal',
  cancelAction: 'Cancel',
  verificationRequired: 'Identity confirmation is required.',
  verificationCancelled: 'Identity confirmation was cancelled. No change was made.',
  verificationCompleteRetry: 'Identity confirmed. Review and retry the action explicitly.',
  verifyIdentityAction: 'Verify identity',
  retryAction: 'Review retry',
  conflictError: 'The ban state changed. Current information is being refreshed.',
  forbiddenError: 'You no longer have permission for this action.',
  genericError: 'The moderation action could not be completed.',
  refreshAction: 'Refresh current state',
  disabledSelf: 'You cannot moderate your own account.',
  disabledHierarchy: 'Only a super administrator can moderate an administrator.',
  disabledSuperAdmin: 'Super administrator accounts cannot be moderated here.',
  disabledCapability: 'Your account cannot moderate users.',
  banSuccessNotification: 'Account banned; sessions revoked and existing content retained.',
  unbanSuccessNotification: 'Ban removed; prior sessions remain signed out and content is unchanged.',
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

const unbannedUser = (overrides: Partial<UserModerationDetail> = {}): UserModerationDetail => ({
  userId: 'target-user',
  displayName: 'Target User',
  email: 'target@example.com',
  emailVerified: true,
  effectiveRole: 'user',
  banState: {
    status: 'unbanned',
    stateVersion: null,
    reason: null,
    actorUserId: null,
    banStartedAt: null,
    expiresAt: null,
    evaluatedAt: NOW.toISOString(),
  },
  ...overrides,
})

const expiredUser = (): UserModerationDetail => ({
  ...unbannedUser(),
  banState: {
    status: 'expired',
    stateVersion: '7',
    reason: 'Previous temporary ban',
    actorUserId: 'other-admin',
    banStartedAt: new Date(NOW_MILLISECONDS - 2 * 60 * 60_000).toISOString(),
    expiresAt: new Date(NOW_MILLISECONDS - 60 * 60_000).toISOString(),
    evaluatedAt: NOW.toISOString(),
  },
})

const activeUser = (kind: 'permanent' | 'temporary' = 'permanent'): UserModerationDetail => ({
  ...unbannedUser(),
  banState:
    kind === 'permanent'
      ? {
          status: 'permanent',
          stateVersion: '9',
          reason: 'Existing active ban',
          actorUserId: 'other-admin',
          banStartedAt: new Date(NOW_MILLISECONDS - 60_000).toISOString(),
          expiresAt: null,
          evaluatedAt: NOW.toISOString(),
        }
      : {
          status: 'temporary',
          stateVersion: '9',
          reason: 'Existing active ban',
          actorUserId: 'other-admin',
          banStartedAt: new Date(NOW_MILLISECONDS - 60_000).toISOString(),
          expiresAt: new Date(NOW_MILLISECONDS + 60 * 60_000).toISOString(),
          evaluatedAt: NOW.toISOString(),
        },
})

const definedError = (code: string, status: number) =>
  new ORPCError(code, {
    data: { requestId: null },
    defined: true,
    message: 'Raw server details must not be rendered',
    status,
  })

type HarnessOptions = {
  readonly banUser?: ReturnType<typeof vi.fn>
  readonly initialRecentAuth?: boolean
  readonly principal?: AdminPrincipal
  readonly reportFeatureError?: Mock<(error: unknown) => boolean>
  readonly strictMode?: boolean
  readonly unbanUser?: ReturnType<typeof vi.fn>
  readonly user?: UserModerationDetail
}

const renderControls = ({
  banUser = vi.fn(async () => ({ updated: true })),
  initialRecentAuth = true,
  principal = adminPrincipal,
  reportFeatureError = vi.fn((_error: unknown) => false),
  strictMode = false,
  unbanUser = vi.fn(async () => ({ updated: true })),
  user = unbannedUser(),
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
      banUser,
      completePrimaryAuthPassword,
      initiatePrimaryAuthOauth,
      unbanUser,
    },
    orpc: {},
  } as unknown as AdminDataClient
  const queryClient = createAdminTestQueryClient()
  if (initialRecentAuth) {
    queryClient.setQueryData(
      adminQueryKeys.primaryAuth.status(),
      { active: true, expiresAt: RECENT_AUTH_EXPIRES_AT },
      { updatedAt: NOW_MILLISECONDS },
    )
  }

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
              <AdminRecentAuthProvider labels={recentAuthLabels} now={() => NOW_MILLISECONDS}>
                <UserBanControls labels={labels} now={() => new Date(NOW)} principal={principal} user={user} />
              </AdminRecentAuthProvider>
            </AdminAuthProvider>
          </AdminDataProvider>
        </QueryClientProvider>
      </MantineProvider>
    </TranslationProvider>
  )
  const view = render(strictMode ? <StrictMode>{controls}</StrictMode> : controls)

  return {
    banUser,
    completePrimaryAuthPassword,
    queryClient,
    reportFeatureError,
    unbanUser,
    ...view,
  }
}

const enterValidTemporaryBan = async (user: ReturnType<typeof userEvent.setup>, reason = 'Private abuse evidence') => {
  fireEvent.change(screen.getByLabelText(labels.temporaryExpiryLabel), { target: { value: '2026-01-02T12:30' } })
  await user.type(screen.getByLabelText(labels.reasonLabel), reason)
}

const confirmBan = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: labels.banAction }))
  const dialog = await screen.findByRole('dialog', { name: labels.confirmBanTitle })
  expect(dialog.textContent).toContain(labels.confirmBanDescription)
  expect(within(dialog).getByText('Target User')).toBeTruthy()
  expect(within(dialog).getByText('target-user')).toBeTruthy()
  expect(within(dialog).getByText(labels.reasonDisclosure)).toBeTruthy()
  expect(within(dialog).getByText(labels.sessionRevocationWarning)).toBeTruthy()
  expect(within(dialog).getByText(labels.contentRetentionWarning)).toBeTruthy()
  await user.click(screen.getByRole('button', { name: labels.confirmBanAction }))
}

afterEach(() => {
  act(() => notifications.clean())
  vi.restoreAllMocks()
})

describe('user ban controls', () => {
  it('validates required, elapsed, and over-limit temporary fields before confirmation', async () => {
    const user = userEvent.setup()
    const { banUser } = renderControls()

    await user.click(screen.getByRole('button', { name: labels.banAction }))
    expect(screen.getByText(labels.reasonRequired)).toBeTruthy()
    expect(screen.getByText(labels.temporaryExpiryRequired)).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.change(screen.getByLabelText(labels.temporaryExpiryLabel), { target: { value: '2026-01-01T11:59' } })
    await user.type(screen.getByLabelText(labels.reasonLabel), 'Evidence')
    await user.click(screen.getByRole('button', { name: labels.banAction }))
    expect(screen.getByText(labels.temporaryExpiryNotFuture)).toBeTruthy()

    fireEvent.change(screen.getByLabelText(labels.reasonLabel), { target: { value: 'x'.repeat(1_001) } })
    await user.click(screen.getByRole('button', { name: labels.banAction }))
    expect(screen.getByText(labels.reasonTooLong)).toBeTruthy()

    fireEvent.change(screen.getByLabelText(labels.temporaryExpiryLabel), { target: { value: '2027-01-02T12:01' } })
    await user.click(screen.getByRole('button', { name: labels.banAction }))
    expect(screen.getByText(labels.temporaryExpiryTooFar)).toBeTruthy()
    expect(banUser).not.toHaveBeenCalled()
  })

  it('sends a trimmed permanent-ban reason and exact nullable state version after confirmation', async () => {
    const notification = vi.spyOn(notifications, 'show')
    const user = userEvent.setup()
    const privateReason = 'Private permanent evidence'
    const { banUser, queryClient } = renderControls()
    const invalidatedKeys = [
      adminQueryKeys.dashboard.overview(),
      adminQueryKeys.users.list(),
      adminQueryKeys.users.detail('target-user'),
      adminQueryKeys.users.banHistory('target-user'),
      adminQueryKeys.users.activity('target-user'),
      adminQueryKeys.administrators.list(),
      adminQueryKeys.administrators.detail('target-user'),
      adminQueryKeys.administrators.roleHistory('target-user'),
      adminQueryKeys.comments.list(),
    ]
    for (const queryKey of invalidatedKeys) queryClient.setQueryData(queryKey, { cached: true })

    await user.click(screen.getByRole('radio', { name: labels.permanentOption }))
    await user.type(screen.getByLabelText(labels.reasonLabel), `  ${privateReason}  `)
    await confirmBan(user)

    await waitFor(() => expect(banUser).toHaveBeenCalledOnce())
    expect(banUser.mock.calls[0]?.[0].body.kind).toBe('permanent')
    expect(banUser.mock.calls[0]?.[0]).toEqual({
      params: { userId: 'target-user' },
      body: { expectedStateVersion: null, kind: 'permanent', reason: privateReason },
    })
    expect(banUser.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal)
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0)
    for (const queryKey of invalidatedKeys) expect(queryClient.getQueryState(queryKey)?.isInvalidated).toBe(true)
    expect(notification).toHaveBeenCalledWith({ color: 'green', message: labels.banSuccessNotification })
    expect(JSON.stringify(notification.mock.calls)).not.toContain(privateReason)
    expect(screen.queryByDisplayValue(privateReason)).toBeNull()
  })

  it('sends a temporary UTC expiry and the exact expired-state version', async () => {
    const user = userEvent.setup()
    const { banUser } = renderControls({ user: expiredUser() })
    await enterValidTemporaryBan(user)
    await user.click(screen.getByRole('button', { name: labels.banAction }))
    const confirmation = await screen.findByRole('dialog', { name: labels.confirmBanTitle })
    expect(within(confirmation).getByText(labels.temporaryOption)).toBeTruthy()
    expect(within(confirmation).getByText(labels.localTimeLabel, { exact: false }).textContent).toContain(
      '2026-01-02T12:30',
    )
    expect(within(confirmation).getByText(labels.utcTimeLabel, { exact: false }).textContent).toContain(
      new Date(2026, 0, 2, 12, 30).toISOString(),
    )
    expect(within(confirmation).queryByText('Private abuse evidence')).toBeNull()
    await user.click(screen.getByRole('button', { name: labels.confirmBanAction }))

    await waitFor(() => expect(banUser).toHaveBeenCalledOnce())
    expect(banUser.mock.calls[0]?.[0]).toEqual({
      params: { userId: 'target-user' },
      body: {
        expectedStateVersion: '7',
        expiresAt: new Date(2026, 0, 2, 12, 30).toISOString(),
        kind: 'temporary',
        reason: 'Private abuse evidence',
      },
    })
  })

  it('requires explicit confirmation and preserves the private form when step-up is cancelled', async () => {
    const user = userEvent.setup()
    const { banUser } = renderControls({ initialRecentAuth: false })
    await enterValidTemporaryBan(user, 'Preserve this evidence')

    await user.click(screen.getByRole('button', { name: labels.banAction }))
    expect(banUser).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: labels.confirmBanAction }))
    expect(await screen.findByRole('dialog', { name: recentAuthLabels.title })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: recentAuthLabels.cancel }))

    expect(await screen.findByText(labels.verificationCancelled)).toBeTruthy()
    expect(screen.getByDisplayValue('Preserve this evidence')).toBeTruthy()
    expect(banUser).not.toHaveBeenCalled()
  })

  it('forces expired step-up, preserves form state, and never auto-replays the rejected mutation', async () => {
    const user = userEvent.setup()
    const banUser = vi
      .fn()
      .mockRejectedValueOnce(definedError('RECENT_AUTH_REQUIRED', 401))
      .mockResolvedValueOnce({ updated: true })
    const { completePrimaryAuthPassword, queryClient } = renderControls({ banUser })
    await enterValidTemporaryBan(user, 'Retain across expired verification')
    await confirmBan(user)

    const stepUpDialog = await screen.findByRole('dialog', { name: recentAuthLabels.title })
    expect(queryClient.getQueryState(adminQueryKeys.primaryAuth.status())).toBeUndefined()
    expect(banUser).toHaveBeenCalledOnce()
    const password = within(stepUpDialog).getByLabelText(/Current password/)
    fireEvent.change(password, { target: { value: 'primary-password' } })
    fireEvent.click(within(stepUpDialog).getByRole('button', { name: recentAuthLabels.passwordSubmit }))

    expect(await screen.findByText(labels.verificationCompleteRetry)).toBeTruthy()
    expect(screen.getByDisplayValue('Retain across expired verification')).toBeTruthy()
    expect(completePrimaryAuthPassword).toHaveBeenCalledOnce()
    expect(banUser).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('button', { name: labels.retryAction }))
    expect(await screen.findByRole('dialog', { name: labels.confirmBanTitle })).toBeTruthy()
    expect(banUser).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: labels.confirmBanAction }))
    await waitFor(() => expect(banUser).toHaveBeenCalledTimes(2))
  })

  it.each([
    ['conflict', definedError('CONFLICT', 409), labels.conflictError],
    ['forbidden', definedError('FORBIDDEN', 403), labels.forbiddenError],
  ] as const)('refreshes authoritative data without optimism after a %s', async (_name, failure, copy) => {
    const notification = vi.spyOn(notifications, 'show')
    const user = userEvent.setup()
    const banUser = vi.fn(async () => {
      throw failure
    })
    const { queryClient, reportFeatureError } = renderControls({ banUser })
    const seededKeys = [
      adminQueryKeys.dashboard.overview(),
      adminQueryKeys.users.list(),
      adminQueryKeys.users.detail('target-user'),
      adminQueryKeys.users.banHistory('target-user'),
      adminQueryKeys.users.activity('target-user'),
      adminQueryKeys.administrators.list(),
      adminQueryKeys.administrators.detail('target-user'),
      adminQueryKeys.administrators.roleHistory('target-user'),
      adminQueryKeys.comments.list(),
    ]
    for (const queryKey of seededKeys) queryClient.setQueryData(queryKey, { authoritative: 'unchanged' })

    await user.click(screen.getByRole('radio', { name: labels.permanentOption }))
    await user.type(screen.getByLabelText(labels.reasonLabel), 'No optimistic update')
    await confirmBan(user)

    expect((await screen.findByRole('alert')).textContent).toContain(copy)
    for (const queryKey of seededKeys) expect(queryClient.getQueryState(queryKey)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryData(adminQueryKeys.users.detail('target-user'))).toEqual({
      authoritative: 'unchanged',
    })
    expect(screen.getByDisplayValue('No optimistic update')).toBeTruthy()
    expect(notification).not.toHaveBeenCalled()
    expect(reportFeatureError).toHaveBeenCalledWith(failure)
  })

  it('unbans an active account with only the exact state version and no reason', async () => {
    const notification = vi.spyOn(notifications, 'show')
    const user = userEvent.setup()
    const { queryClient, unbanUser } = renderControls({ user: activeUser('temporary') })

    expect(screen.queryByText(labels.sessionRevocationWarning)).toBeNull()
    await user.click(screen.getByRole('button', { name: labels.unbanAction }))
    expect(await screen.findByRole('dialog', { name: labels.confirmUnbanTitle })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: labels.confirmUnbanAction }))

    await waitFor(() => expect(unbanUser).toHaveBeenCalledOnce())
    expect(unbanUser.mock.calls[0]?.[0]).toEqual({
      params: { userId: 'target-user' },
      body: { expectedStateVersion: '9' },
    })
    expect(JSON.stringify(unbanUser.mock.calls[0]?.[0])).not.toContain('reason')
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0)
    expect(notification).toHaveBeenCalledWith({ color: 'green', message: labels.unbanSuccessNotification })
  })

  it('prevents duplicate submission while a direct moderation request is pending', async () => {
    let resolveBan: ((value: unknown) => void) | undefined
    const banUser = vi.fn(
      async () =>
        await new Promise((resolve) => {
          resolveBan = resolve
        }),
    )
    const user = userEvent.setup()
    renderControls({ banUser })
    await user.click(screen.getByRole('radio', { name: labels.permanentOption }))
    await user.type(screen.getByLabelText(labels.reasonLabel), 'One request only')
    await user.click(screen.getByRole('button', { name: labels.banAction }))
    const confirm = await screen.findByRole('button', { name: labels.confirmBanAction })

    fireEvent.click(confirm)
    fireEvent.click(confirm)
    await waitFor(() => expect(banUser).toHaveBeenCalledOnce())
    resolveBan?.({ updated: true })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: labels.confirmBanTitle })).toBeNull())
  })

  it('preserves the form and offers an explicit review before retrying a recoverable failure', async () => {
    const user = userEvent.setup()
    const banUser = vi.fn().mockRejectedValueOnce(new Error('private transport detail')).mockResolvedValueOnce({
      updated: true,
    })
    renderControls({ banUser })
    await user.click(screen.getByRole('radio', { name: labels.permanentOption }))
    await user.type(screen.getByLabelText(labels.reasonLabel), 'Retain for explicit retry')
    await confirmBan(user)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(labels.genericError)
    expect(alert.textContent).not.toContain('private transport detail')
    expect(screen.getByDisplayValue('Retain for explicit retry')).toBeTruthy()
    expect(banUser).toHaveBeenCalledOnce()

    await user.click(within(alert).getByRole('button', { name: labels.retryAction }))
    expect(await screen.findByRole('dialog', { name: labels.confirmBanTitle })).toBeTruthy()
    expect(banUser).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: labels.confirmBanAction }))
    await waitFor(() => expect(banUser).toHaveBeenCalledTimes(2))
  })

  it('remains mounted and completes direct moderation under React StrictMode effect replay', async () => {
    const user = userEvent.setup()
    const { banUser } = renderControls({ strictMode: true })
    await user.click(screen.getByRole('radio', { name: labels.permanentOption }))
    await user.type(screen.getByLabelText(labels.reasonLabel), 'Strict mode evidence')
    await confirmBan(user)

    await waitFor(() => expect(banUser).toHaveBeenCalledOnce())
    expect(screen.queryByDisplayValue('Strict mode evidence')).toBeNull()
  })

  it.each([
    ['ordinary user is allowed for an admin', adminPrincipal, unbannedUser(), null, false],
    [
      'administrator is hierarchy-disabled for an admin',
      adminPrincipal,
      unbannedUser({ effectiveRole: 'admin' }),
      labels.disabledHierarchy,
      true,
    ],
    [
      'administrator is allowed for a super admin',
      superAdminPrincipal,
      unbannedUser({ effectiveRole: 'admin' }),
      null,
      false,
    ],
    [
      'super administrator is always disabled',
      adminPrincipal,
      unbannedUser({ effectiveRole: 'super_admin' }),
      labels.disabledSuperAdmin,
      true,
    ],
    [
      'self moderation is disabled',
      adminPrincipal,
      unbannedUser({ userId: adminPrincipal.userId }),
      labels.disabledSelf,
      true,
    ],
    [
      'missing moderation capability is disabled',
      { ...adminPrincipal, capabilities: { ...adminPrincipal.capabilities, canModerateUsers: false } },
      unbannedUser(),
      labels.disabledCapability,
      true,
    ],
  ] as const)('%s', (_name, principal, target, explanation, disabled) => {
    renderControls({ principal, user: target })

    expect((screen.getByRole('button', { name: labels.banAction }) as HTMLButtonElement).disabled).toBe(disabled)
    if (explanation) expect(screen.getByText(explanation)).toBeTruthy()
  })

  it('aborts an in-flight direct request when the controls unmount', async () => {
    let observedSignal: AbortSignal | undefined
    const banUser = vi.fn(async (_input: unknown, options: { readonly signal?: AbortSignal }) => {
      observedSignal = options.signal
      return await new Promise(() => undefined)
    })
    const user = userEvent.setup()
    const { unmount } = renderControls({ banUser })
    await user.click(screen.getByRole('radio', { name: labels.permanentOption }))
    await user.type(screen.getByLabelText(labels.reasonLabel), 'Abort cleanup evidence')
    await confirmBan(user)
    await waitFor(() => expect(observedSignal).toBeDefined())

    unmount()

    expect(observedSignal?.aborted).toBe(true)
  })
})