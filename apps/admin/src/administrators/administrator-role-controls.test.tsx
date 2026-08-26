import { ADMIN_ROLE_CHANGE_REASON_MAX_LENGTH } from '@gekichumai/admin-contract'
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
import {
  AdministratorRoleControls,
  type AdministratorRoleControlsLabels,
  type AdministratorRoleTarget,
} from './administrator-role-controls'

const NOW = Date.parse('2026-08-24T12:00:00.000Z')
const RECENT_AUTH_EXPIRES_AT = new Date(NOW + 5 * 60_000).toISOString()

const labels: AdministratorRoleControlsLabels = {
  title: 'Administrator role management',
  reasonLabel: 'Internal reason',
  reasonDescription: 'This private reason is retained in administrator role history.',
  reasonRequired: 'Enter a role-change reason.',
  reasonTooLong: 'The role-change reason is too long.',
  grantAction: 'Grant administrator role',
  revokeAction: 'Revoke administrator role',
  grantWarning: 'The target must sign in again before administrator access is available.',
  revokeWarning: 'Revocation terminates the target administrator’s active sessions.',
  targetUserLabel: 'Target account',
  confirmGrantTitle: 'Confirm administrator grant',
  confirmGrantDescription: 'Review the exact account before granting administrator access.',
  confirmGrantAction: 'Confirm grant',
  confirmRevokeTitle: 'Confirm administrator revocation',
  confirmRevokeDescription: 'Review the exact account before revoking administrator access.',
  confirmRevokeAction: 'Confirm revocation',
  cancelAction: 'Cancel',
  verificationRequired: 'Identity confirmation is required.',
  verificationCancelled: 'Identity confirmation was cancelled. No role changed.',
  verificationCompleteRetry: 'Identity confirmed. Review and retry the role change explicitly.',
  verifyIdentityAction: 'Verify identity',
  retryAction: 'Review retry',
  conflictError: 'The account role changed. Current administrator data is being refreshed.',
  forbiddenError: 'You no longer have permission to manage administrator roles.',
  genericError: 'The administrator role change could not be completed.',
  refreshAction: 'Refresh current state',
  disabledCapability: 'Your account cannot manage administrator roles.',
  disabledSelf: 'You cannot change your own administrator role.',
  disabledDeployment: 'Deployment-defined administrator roles cannot be changed here.',
  disabledSuperAdmin: 'Super administrator roles cannot be changed here.',
  invalidGrantTarget: 'Only a normal user can be granted the administrator role.',
  invalidRevokeTarget: 'Only a database administrator can have the administrator role revoked.',
  grantSuccessNotification: 'Administrator granted. The target must sign in again.',
  revokeSuccessNotification: 'Administrator revoked. Active sessions were revoked.',
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

const superAdminPrincipal: AdminPrincipal = {
  userId: 'principal-super-admin',
  effectiveRole: 'super_admin',
  capabilities: {
    canManageAdministrators: true,
    canModerateAdministrators: true,
    canModerateUsers: true,
  },
}

const ordinaryAdminPrincipal: AdminPrincipal = {
  userId: 'principal-admin',
  effectiveRole: 'admin',
  capabilities: {
    canManageAdministrators: false,
    canModerateAdministrators: false,
    canModerateUsers: true,
  },
}

const normalUser = (overrides: Partial<AdministratorRoleTarget> = {}): AdministratorRoleTarget => ({
  userId: 'target-user',
  displayName: 'Target User',
  effectiveRole: 'user',
  ...overrides,
})

const databaseAdministrator = (overrides: Partial<AdministratorRoleTarget> = {}): AdministratorRoleTarget => ({
  userId: 'target-administrator',
  displayName: 'Target Administrator',
  effectiveRole: 'admin',
  roleSource: 'database',
  ...overrides,
})

const definedError = (code: string, status: number) =>
  new ORPCError(code, {
    data: { requestId: null },
    defined: true,
    message: 'Private server detail must not be rendered',
    status,
  })

type HarnessOptions = {
  readonly grantAdministrator?: ReturnType<typeof vi.fn>
  readonly initialRecentAuth?: boolean
  readonly onAuthoritativeMismatch?: Mock<(kind: 'conflict' | 'forbidden') => void>
  readonly onSuccess?: Mock<(action: 'grant' | 'revoke') => void>
  readonly principal?: AdminPrincipal
  readonly reportFeatureError?: Mock<(error: unknown) => boolean>
  readonly revokeAdministrator?: ReturnType<typeof vi.fn>
  readonly strictMode?: boolean
  readonly target?: AdministratorRoleTarget
}

const renderControls = ({
  grantAdministrator = vi.fn(async () => ({ change: {} })),
  initialRecentAuth = true,
  onAuthoritativeMismatch,
  onSuccess = vi.fn(),
  principal = superAdminPrincipal,
  reportFeatureError = vi.fn((_error: unknown) => false),
  revokeAdministrator = vi.fn(async () => ({ change: {} })),
  strictMode = false,
  target = normalUser(),
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
      grantAdministrator,
      initiatePrimaryAuthOauth,
      revokeAdministrator,
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

  const Harness = ({ targetValue }: { readonly targetValue: AdministratorRoleTarget }) => {
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
                  <AdministratorRoleControls
                    labels={labels}
                    onAuthoritativeMismatch={onAuthoritativeMismatch}
                    onSuccess={onSuccess}
                    principal={principal}
                    target={targetValue}
                  />
                </AdminRecentAuthProvider>
              </AdminAuthProvider>
            </AdminDataProvider>
          </QueryClientProvider>
        </MantineProvider>
      </TranslationProvider>
    )
    return strictMode ? <StrictMode>{controls}</StrictMode> : controls
  }

  const rendered = render(<Harness targetValue={target} />)
  return {
    completePrimaryAuthPassword,
    grantAdministrator,
    Harness,
    onSuccess,
    onAuthoritativeMismatch,
    queryClient,
    rendered,
    reportFeatureError,
    revokeAdministrator,
  }
}

const enterReason = async (user: ReturnType<typeof userEvent.setup>, reason = 'Private role evidence') => {
  await user.type(screen.getByLabelText(labels.reasonLabel), reason)
}

const confirmGrant = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: labels.grantAction }))
  const dialog = await screen.findByRole('dialog', { name: labels.confirmGrantTitle })
  expect(dialog.textContent).toContain(labels.confirmGrantDescription)
  expect(within(dialog).getByText(labels.targetUserLabel)).toBeTruthy()
  expect(within(dialog).getByText('Target User')).toBeTruthy()
  expect(within(dialog).getByText('target-user')).toBeTruthy()
  expect(within(dialog).getByText(labels.grantWarning)).toBeTruthy()
  await user.click(within(dialog).getByRole('button', { name: labels.confirmGrantAction }))
}

const confirmRevoke = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: labels.revokeAction }))
  const dialog = await screen.findByRole('dialog', { name: labels.confirmRevokeTitle })
  expect(dialog.textContent).toContain(labels.confirmRevokeDescription)
  expect(within(dialog).getByText('Target Administrator')).toBeTruthy()
  expect(within(dialog).getByText('target-administrator')).toBeTruthy()
  expect(within(dialog).getByText(labels.revokeWarning)).toBeTruthy()
  await user.click(within(dialog).getByRole('button', { name: labels.confirmRevokeAction }))
}

afterEach(() => {
  act(() => notifications.clean())
  vi.restoreAllMocks()
})

describe('administrator role controls', () => {
  it('keeps the exact target identity visible before confirmation', () => {
    renderControls()

    expect(screen.getByText(labels.targetUserLabel)).toBeTruthy()
    expect(screen.getByText('Target User')).toBeTruthy()
    expect(screen.getByText('target-user')).toBeTruthy()
  })

  it('requires, trims, and bounds the private reason before explicit confirmation', async () => {
    const user = userEvent.setup()
    const { grantAdministrator } = renderControls()

    await user.click(screen.getByRole('button', { name: labels.grantAction }))
    expect(screen.getByText(labels.reasonRequired)).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.change(screen.getByLabelText(labels.reasonLabel), {
      target: { value: 'x'.repeat(ADMIN_ROLE_CHANGE_REASON_MAX_LENGTH + 1) },
    })
    await user.click(screen.getByRole('button', { name: labels.grantAction }))
    expect(screen.getByText(labels.reasonTooLong)).toBeTruthy()
    expect(grantAdministrator).not.toHaveBeenCalled()
  })

  it('grants with the exact body, refreshes all authoritative reads, and reports success after invalidation', async () => {
    const privateReason = 'Private grant evidence'
    const notification = vi.spyOn(notifications, 'show')
    let invalidatedAtSuccess: readonly boolean[] = []
    const user = userEvent.setup()
    const onSuccess = vi.fn(() => {
      invalidatedAtSuccess = invalidatedKeys.map(
        (queryKey) => queryClient.getQueryState(queryKey)?.isInvalidated === true,
      )
    })
    const { grantAdministrator, queryClient } = renderControls({ onSuccess })
    const invalidatedKeys = [
      adminQueryKeys.dashboard.overview(),
      adminQueryKeys.administrators.list(),
      adminQueryKeys.administrators.detail('target-user'),
      adminQueryKeys.administrators.roleHistory('target-user', { cursor: 'history-page' }),
      adminQueryKeys.users.list({ effectiveRole: 'user' }),
      adminQueryKeys.users.detail('target-user'),
      adminQueryKeys.users.activity('target-user'),
      adminQueryKeys.users.banHistory('target-user'),
    ]
    const unaffectedKey = adminQueryKeys.users.detail('other-user')
    for (const queryKey of [...invalidatedKeys, unaffectedKey]) queryClient.setQueryData(queryKey, { cached: true })

    await user.type(screen.getByLabelText(labels.reasonLabel), `  ${privateReason}  `)
    await user.click(screen.getByRole('button', { name: labels.grantAction }))
    const dialog = await screen.findByRole('dialog', { name: labels.confirmGrantTitle })
    expect(within(dialog).queryByText(privateReason)).toBeNull()
    await user.click(within(dialog).getByRole('button', { name: labels.confirmGrantAction }))

    await waitFor(() => expect(grantAdministrator).toHaveBeenCalledOnce())
    expect(grantAdministrator.mock.calls[0]?.[0]).toEqual({
      body: { reason: privateReason },
      params: { userId: 'target-user' },
    })
    expect(grantAdministrator.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal)
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('grant'))
    expect(invalidatedAtSuccess).toEqual(invalidatedKeys.map(() => true))
    for (const queryKey of invalidatedKeys) expect(queryClient.getQueryState(queryKey)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(unaffectedKey)?.isInvalidated).toBe(false)
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0)
    expect(notification).toHaveBeenCalledWith({ color: 'green', message: labels.grantSuccessNotification })
    expect(labels.grantSuccessNotification).toContain('sign in again')
    expect(JSON.stringify(notification.mock.calls)).not.toContain(privateReason)
    expect(screen.queryByDisplayValue(privateReason)).toBeNull()
  })

  it('revokes only a database administrator with the exact body and session-revocation success copy', async () => {
    const privateReason = 'Private revoke evidence'
    const notification = vi.spyOn(notifications, 'show')
    const user = userEvent.setup()
    const { onSuccess, queryClient, revokeAdministrator } = renderControls({
      target: databaseAdministrator(),
    })

    await enterReason(user, `  ${privateReason}  `)
    await confirmRevoke(user)

    await waitFor(() => expect(revokeAdministrator).toHaveBeenCalledOnce())
    expect(revokeAdministrator.mock.calls[0]?.[0]).toEqual({
      body: { reason: privateReason },
      params: { userId: 'target-administrator' },
    })
    expect(revokeAdministrator.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal)
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('revoke'))
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0)
    expect(notification).toHaveBeenCalledWith({ color: 'green', message: labels.revokeSuccessNotification })
    expect(labels.revokeSuccessNotification).toContain('sessions were revoked')
  })

  it('requires recent primary authentication and preserves the form when verification is cancelled', async () => {
    const user = userEvent.setup()
    const { grantAdministrator } = renderControls({ initialRecentAuth: false })
    await enterReason(user, 'Preserve this private reason')
    await user.click(screen.getByRole('button', { name: labels.grantAction }))
    await user.click(screen.getByRole('button', { name: labels.confirmGrantAction }))
    expect(await screen.findByRole('dialog', { name: recentAuthLabels.title })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: recentAuthLabels.cancel }))

    expect(await screen.findByText(labels.verificationCancelled)).toBeTruthy()
    expect(screen.getByDisplayValue('Preserve this private reason')).toBeTruthy()
    expect(grantAdministrator).not.toHaveBeenCalled()
  })

  it('forces fresh primary authentication after backend expiry and never automatically replays', async () => {
    const grantAdministrator = vi
      .fn()
      .mockRejectedValueOnce(definedError('RECENT_AUTH_REQUIRED', 401))
      .mockResolvedValueOnce({ change: {} })
    const user = userEvent.setup()
    const { completePrimaryAuthPassword, queryClient } = renderControls({ grantAdministrator })
    await enterReason(user, 'Retain across forced verification')
    await confirmGrant(user)

    const stepUpDialog = await screen.findByRole('dialog', { name: recentAuthLabels.title })
    expect(queryClient.getQueryState(adminQueryKeys.primaryAuth.status())).toBeUndefined()
    expect(grantAdministrator).toHaveBeenCalledOnce()
    fireEvent.change(within(stepUpDialog).getByLabelText(/Current password/), {
      target: { value: 'primary-password' },
    })
    fireEvent.click(within(stepUpDialog).getByRole('button', { name: recentAuthLabels.passwordSubmit }))

    expect(await screen.findByText(labels.verificationCompleteRetry)).toBeTruthy()
    expect(screen.getByDisplayValue('Retain across forced verification')).toBeTruthy()
    expect(completePrimaryAuthPassword).toHaveBeenCalledOnce()
    expect(grantAdministrator).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: labels.retryAction }))
    expect(await screen.findByRole('dialog', { name: labels.confirmGrantTitle })).toBeTruthy()
    expect(grantAdministrator).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: labels.confirmGrantAction }))
    await waitFor(() => expect(grantAdministrator).toHaveBeenCalledTimes(2))
  })

  it.each([
    ['conflict', definedError('CONFLICT', 409), labels.conflictError],
    ['forbidden', definedError('FORBIDDEN', 403), labels.forbiddenError],
  ] as const)('refreshes authoritative data without optimism after a %s', async (_name, failure, copy) => {
    const notification = vi.spyOn(notifications, 'show')
    const grantAdministrator = vi.fn(async () => {
      throw failure
    })
    const user = userEvent.setup()
    const { onSuccess, queryClient, reportFeatureError } = renderControls({ grantAdministrator })
    const seededKeys = [
      adminQueryKeys.dashboard.overview(),
      adminQueryKeys.administrators.list(),
      adminQueryKeys.administrators.roleHistory('target-user'),
      adminQueryKeys.users.list(),
      adminQueryKeys.users.detail('target-user'),
      adminQueryKeys.users.activity('target-user'),
    ]
    for (const queryKey of seededKeys) queryClient.setQueryData(queryKey, { authoritative: 'unchanged' })
    await enterReason(user, 'No optimistic target update')
    await confirmGrant(user)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(copy)
    for (const queryKey of seededKeys) {
      expect(queryClient.getQueryState(queryKey)?.isInvalidated).toBe(true)
      expect(queryClient.getQueryData(queryKey)).toEqual({ authoritative: 'unchanged' })
    }
    expect(screen.getByDisplayValue('No optimistic target update')).toBeTruthy()
    expect(notification).not.toHaveBeenCalled()
    expect(onSuccess).not.toHaveBeenCalled()
    expect(reportFeatureError).toHaveBeenCalledWith(failure)
    expect((screen.getByRole('button', { name: labels.grantAction }) as HTMLButtonElement).disabled).toBe(true)
  })

  it.each([
    ['conflict', definedError('CONFLICT', 409), labels.conflictError],
    ['forbidden', definedError('FORBIDDEN', 403), labels.forbiddenError],
  ] as const)('hands a stale target back to its owner after authoritative %s recovery', async (kind, failure, copy) => {
    const notification = vi.spyOn(notifications, 'show')
    const onAuthoritativeMismatch = vi.fn()
    const user = userEvent.setup()
    const { grantAdministrator } = renderControls({
      grantAdministrator: vi.fn(async () => {
        throw failure
      }),
      onAuthoritativeMismatch,
    })
    await enterReason(user, 'Stale target must be discarded')
    await confirmGrant(user)

    await waitFor(() => expect(onAuthoritativeMismatch).toHaveBeenCalledWith(kind))
    expect(grantAdministrator).toHaveBeenCalledOnce()
    expect(notification).toHaveBeenCalledWith({
      color: kind === 'conflict' ? 'orange' : 'red',
      message: copy,
    })
    expect(JSON.stringify(notification.mock.calls)).not.toContain('Stale target must be discarded')
  })

  it('shows safe recovery copy and keeps the private reason for an explicit generic retry', async () => {
    const privateReason = 'Private reason retained for retry'
    const grantAdministrator = vi
      .fn()
      .mockRejectedValueOnce(new Error('private backend transport detail'))
      .mockResolvedValueOnce({ change: {} })
    const user = userEvent.setup()
    renderControls({ grantAdministrator })
    await enterReason(user, privateReason)
    await confirmGrant(user)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(labels.genericError)
    expect(alert.textContent).not.toContain('private backend transport detail')
    expect(alert.textContent).not.toContain(privateReason)
    expect(screen.getByDisplayValue(privateReason)).toBeTruthy()
    await user.click(within(alert).getByRole('button', { name: labels.retryAction }))
    const dialog = await screen.findByRole('dialog', { name: labels.confirmGrantTitle })
    expect(dialog.textContent).not.toContain(privateReason)
    expect(grantAdministrator).toHaveBeenCalledOnce()
    await user.click(within(dialog).getByRole('button', { name: labels.confirmGrantAction }))
    await waitFor(() => expect(grantAdministrator).toHaveBeenCalledTimes(2))
  })

  it('guards against duplicate direct submissions', async () => {
    let resolveGrant: ((value: unknown) => void) | undefined
    const grantAdministrator = vi.fn(
      async () =>
        await new Promise((resolve) => {
          resolveGrant = resolve
        }),
    )
    const user = userEvent.setup()
    renderControls({ grantAdministrator })
    await enterReason(user, 'One request only')
    await user.click(screen.getByRole('button', { name: labels.grantAction }))
    const confirm = await screen.findByRole('button', { name: labels.confirmGrantAction })

    fireEvent.click(confirm)
    fireEvent.click(confirm)
    await waitFor(() => expect(grantAdministrator).toHaveBeenCalledOnce())
    resolveGrant?.({ change: {} })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: labels.confirmGrantTitle })).toBeNull())
  })

  it('does not expose mutation controls without the administrator-management capability', () => {
    const { grantAdministrator, revokeAdministrator } = renderControls({ principal: ordinaryAdminPrincipal })

    expect(screen.getByText(labels.disabledCapability)).toBeTruthy()
    expect(screen.queryByLabelText(labels.reasonLabel)).toBeNull()
    expect(screen.queryByRole('button', { name: labels.grantAction })).toBeNull()
    expect(screen.queryByRole('button', { name: labels.revokeAction })).toBeNull()
    expect(grantAdministrator).not.toHaveBeenCalled()
    expect(revokeAdministrator).not.toHaveBeenCalled()
  })

  it.each([
    ['normal user', normalUser(), labels.grantAction, null, false],
    ['database administrator', databaseAdministrator(), labels.revokeAction, null, false],
    [
      'self alteration',
      normalUser({ userId: superAdminPrincipal.userId }),
      labels.grantAction,
      labels.disabledSelf,
      true,
    ],
  ] as const)('%s eligibility', (_name, target, actionLabel, explanation, disabled) => {
    renderControls({ target })

    const button = screen.getByRole('button', { name: actionLabel }) as HTMLButtonElement
    expect(button.disabled).toBe(disabled)
    if (explanation) expect(screen.getByText(explanation)).toBeTruthy()
  })

  it.each([
    [
      'super administrator',
      databaseAdministrator({ effectiveRole: 'super_admin', roleSource: 'deployment' }),
      labels.disabledSuperAdmin,
    ],
    [
      'deployment-defined administrator',
      databaseAdministrator({ roleSource: 'deployment' }),
      labels.disabledDeployment,
    ],
    ['administrator without database source', databaseAdministrator({ roleSource: null }), labels.invalidRevokeTarget],
    ['non-normal user role source', normalUser({ roleSource: 'database' }), labels.invalidGrantTarget],
  ] as const)('never exposes an action for a %s target', (_name, target, explanation) => {
    renderControls({ target })

    expect(screen.getByText(explanation)).toBeTruthy()
    expect(screen.queryByLabelText(labels.reasonLabel)).toBeNull()
    expect(screen.queryByRole('button', { name: labels.grantAction })).toBeNull()
    expect(screen.queryByRole('button', { name: labels.revokeAction })).toBeNull()
  })

  it('aborts an old request and discards completion when the selected subject changes', async () => {
    let observedSignal: AbortSignal | undefined
    let resolveGrant: ((value: unknown) => void) | undefined
    const notification = vi.spyOn(notifications, 'show')
    const grantAdministrator = vi.fn(async (_input: unknown, options: { readonly signal?: AbortSignal }) => {
      observedSignal = options.signal
      return await new Promise((resolve) => {
        resolveGrant = resolve
      })
    })
    const user = userEvent.setup()
    const { Harness, onSuccess, rendered } = renderControls({ grantAdministrator })
    await enterReason(user, 'Must not cross subjects')
    await confirmGrant(user)
    await waitFor(() => expect(observedSignal).toBeDefined())

    rendered.rerender(<Harness targetValue={normalUser({ userId: 'other-target' })} />)
    expect(observedSignal?.aborted).toBe(true)
    expect((screen.getByLabelText(labels.reasonLabel) as HTMLTextAreaElement).value).toBe('')
    await act(async () => {
      resolveGrant?.({ change: {} })
    })

    expect(notification).not.toHaveBeenCalled()
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('aborts an in-flight request on unmount and remains correct under StrictMode replay', async () => {
    let observedSignal: AbortSignal | undefined
    const grantAdministrator = vi.fn(async (_input: unknown, options: { readonly signal?: AbortSignal }) => {
      observedSignal = options.signal
      return await new Promise(() => undefined)
    })
    const user = userEvent.setup()
    const { rendered } = renderControls({ grantAdministrator, strictMode: true })
    await enterReason(user, 'Abort on unmount')
    await confirmGrant(user)
    await waitFor(() => expect(grantAdministrator).toHaveBeenCalledOnce())

    rendered.unmount()

    expect(observedSignal?.aborted).toBe(true)
  })
})