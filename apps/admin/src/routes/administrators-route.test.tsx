import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { AdminAuthSnapshot } from '../auth/admin-auth-context'
import { translate } from '../i18n'
import { createAdminTestRuntime, renderAdminApp } from '../test/render-admin-app'

const databaseAdministrator = {
  userId: 'database-administrator',
  displayName: 'Database Administrator',
  email: 'database-admin@example.test',
  emailVerified: true,
  effectiveRole: 'admin' as const,
  roleSource: 'database' as const,
  accountStatus: { status: 'active' as const },
}

const deploymentSuperAdministrator = {
  userId: 'deployment-super-administrator',
  displayName: 'Deployment Super Administrator',
  email: 'deployment-admin@example.test',
  emailVerified: false,
  effectiveRole: 'super_admin' as const,
  roleSource: 'deployment' as const,
  accountStatus: { status: 'permanently_banned' as const },
}

const candidate = {
  userId: 'candidate-user',
  displayName: 'Candidate User',
  email: 'candidate@example.test',
  emailVerified: false,
  effectiveRole: 'user' as const,
  accountStatus: { status: 'active' as const },
}

const roleHistory = {
  items: [
    {
      id: '1',
      subjectUserId: databaseAdministrator.userId,
      actorUserId: 'granting-super-administrator',
      previousRole: 'user' as const,
      newRole: 'admin' as const,
      reason: 'Provide operations coverage',
      changedAt: '2026-08-24T12:00:00.000Z',
    },
  ],
  nextCursor: null,
}

const ordinaryAdministratorAuth: AdminAuthSnapshot = {
  status: 'authenticated',
  principal: {
    userId: 'read-only-administrator',
    effectiveRole: 'admin',
    capabilities: {
      canModerateUsers: true,
      canModerateAdministrators: false,
      canManageAdministrators: false,
    },
  },
}

const createAdministratorFetch = () =>
  vi.fn(async (request: RequestInfo | URL) => {
    const parsed = new URL((request as Request).url)
    if (parsed.pathname === '/api/admin/administrators') {
      return Response.json({ items: [databaseAdministrator, deploymentSuperAdministrator] })
    }
    if (parsed.pathname === `/api/admin/administrators/${databaseAdministrator.userId}/role-history`) {
      return Response.json(roleHistory)
    }
    if (parsed.pathname.endsWith('/role-history')) return Response.json({ items: [], nextCursor: null })
    if (parsed.pathname === '/api/admin/users/search') {
      return Response.json({ items: [candidate], nextCursor: null })
    }
    return Response.json({ defined: false, code: 'NOT_FOUND', status: 404 }, { status: 404 })
  })

describe('administrator roster route', () => {
  it('gives an ordinary administrator the complete read-only roster and lazy history without management controls', async () => {
    const fetch = createAdministratorFetch()
    const runtime = createAdminTestRuntime({ fetch: fetch as unknown as typeof globalThis.fetch })
    const user = userEvent.setup()
    const rendered = await renderAdminApp('/administrators', { auth: ordinaryAdministratorAuth, runtime })

    expect(await screen.findByText(databaseAdministrator.displayName)).toBeTruthy()
    expect(screen.getByText(deploymentSuperAdministrator.displayName)).toBeTruthy()
    expect(screen.getByText(translate('administrators.readOnly.title'))).toBeTruthy()
    expect(screen.getByText(translate('administrators.roster.sources.database'))).toBeTruthy()
    expect(screen.getByText(translate('administrators.roster.sources.deployment'))).toBeTruthy()
    expect(screen.getByText(translate('administrators.roster.sources.immutable'))).toBeTruthy()
    expect(screen.getByText(translate('administrators.roster.sources.deploymentDescription'))).toBeTruthy()
    expect(screen.queryByText(translate('administrators.candidates.title'))).toBeNull()
    expect(screen.queryByText(translate('administrators.actions.title'))).toBeNull()
    expect(screen.queryByRole('button', { name: /Review revocation/ })).toBeNull()
    expect(document.body.textContent).not.toMatch(/session|IP address|user-agent/i)
    expect(fetch).toHaveBeenCalledOnce()

    await user.click(
      screen.getByRole('button', {
        name: `${translate('administrators.roster.openHistory')}: ${databaseAdministrator.displayName}`,
      }),
    )

    expect(await screen.findByText('Provide operations coverage')).toBeTruthy()
    expect(rendered.router.state.location.search).toEqual({ userId: databaseAdministrator.userId })
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
  })

  it('shows super-administrator candidate and revoke workflows while keeping deployment roles immutable', async () => {
    const fetch = createAdministratorFetch()
    const runtime = createAdminTestRuntime({ fetch: fetch as unknown as typeof globalThis.fetch })
    const user = userEvent.setup()
    const rendered = await renderAdminApp(
      `/administrators?userId=${databaseAdministrator.userId}&historyCursor=older_page`,
      { runtime },
    )

    expect(await screen.findByText(translate('administrators.management.title'))).toBeTruthy()
    expect(await screen.findByText('Provide operations coverage')).toBeTruthy()
    const historyRequest = fetch.mock.calls.find(([request]) =>
      (request as Request).url.includes('/role-history'),
    )?.[0] as Request
    expect(new URL(historyRequest.url).searchParams.get('cursor')).toBe('older_page')

    expect(
      screen.queryByRole('button', {
        name: `${translate('administrators.roster.revoke')}: ${deploymentSuperAdministrator.displayName}`,
      }),
    ).toBeNull()
    await user.click(
      screen.getByRole('button', {
        name: `${translate('administrators.roster.revoke')}: ${databaseAdministrator.displayName}`,
      }),
    )
    expect(screen.getByRole('button', { name: translate('administrators.actions.revoke') })).toBeTruthy()
    expect(rendered.router.state.location.search).toEqual({ userId: databaseAdministrator.userId })

    await user.click(
      screen.getByRole('button', {
        name: `${translate('administrators.roster.openHistory')}: ${deploymentSuperAdministrator.displayName}`,
      }),
    )
    await waitFor(() =>
      expect(rendered.router.state.location.search).toEqual({ userId: deploymentSuperAdministrator.userId }),
    )
    expect(screen.queryByRole('button', { name: translate('administrators.actions.revoke') })).toBeNull()

    const candidatePanel = screen
      .getByRole('heading', {
        level: 2,
        name: translate('administrators.candidates.title'),
      })
      .closest('section')
    expect(candidatePanel).not.toBeNull()
    const candidateScope = within(candidatePanel!)
    await user.type(
      candidateScope.getByRole('textbox', { name: translate('administrators.candidates.query') }),
      'candidate-user',
    )
    await user.click(candidateScope.getByRole('button', { name: translate('administrators.candidates.submit') }))

    expect(await candidateScope.findByText(candidate.displayName)).toBeTruthy()
    const searchRequest = fetch.mock.calls.find(
      ([request]) => new URL((request as Request).url).pathname === '/api/admin/users/search',
    )?.[0] as Request
    expect(await searchRequest.clone().json()).toEqual({
      userId: candidate.userId,
      effectiveRole: 'user',
      activeBan: false,
    })
    await user.click(
      candidateScope.getByRole('button', {
        name: `${translate('administrators.candidates.select')}: ${candidate.displayName} (${candidate.userId})`,
      }),
    )

    expect(screen.getByRole('button', { name: translate('administrators.actions.grant') })).toBeTruthy()
    expect(screen.getByText(translate('administrators.candidates.existingAccountsOnly'))).toBeTruthy()
    expect(screen.getAllByText(candidate.email)).not.toHaveLength(0)
    expect(screen.getAllByText(translate('administrators.candidates.notVerified'))).not.toHaveLength(0)
    expect(rendered.router.state.location.search).toEqual({ userId: candidate.userId })
  })

  it('removes a selected revoke workflow when the refreshed roster no longer marks the target as a database admin', async () => {
    let rosterRead = 0
    const reconfiguredTarget = {
      ...databaseAdministrator,
      effectiveRole: 'super_admin' as const,
      roleSource: 'deployment' as const,
    }
    const fetch = vi.fn(async (request: RequestInfo | URL) => {
      const parsed = new URL((request as Request).url)
      if (parsed.pathname === '/api/admin/administrators') {
        rosterRead += 1
        return Response.json({ items: [rosterRead === 1 ? databaseAdministrator : reconfiguredTarget] })
      }
      if (parsed.pathname.endsWith('/role-history')) return Response.json({ items: [], nextCursor: null })
      return Response.json({ defined: false, code: 'NOT_FOUND', status: 404 }, { status: 404 })
    })
    const runtime = createAdminTestRuntime({ fetch: fetch as unknown as typeof globalThis.fetch })
    const user = userEvent.setup()
    await renderAdminApp('/administrators', { runtime })

    await user.click(
      await screen.findByRole('button', {
        name: `${translate('administrators.roster.revoke')}: ${databaseAdministrator.displayName}`,
      }),
    )
    expect(screen.getByRole('button', { name: translate('administrators.actions.revoke') })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: translate('actions.refresh') }))
    await screen.findByText(translate('administrators.roster.sources.immutable'))
    expect(screen.queryByRole('button', { name: translate('administrators.actions.revoke') })).toBeNull()
    expect(
      screen.queryByRole('button', {
        name: `${translate('administrators.roster.revoke')}: ${databaseAdministrator.displayName}`,
      }),
    ).toBeNull()
  })

  it('drops malformed deep-link state and does not issue an unscoped history request', async () => {
    const fetch = createAdministratorFetch()
    const runtime = createAdminTestRuntime({ fetch: fetch as unknown as typeof globalThis.fetch })
    await renderAdminApp('/administrators?userId=%20bad&historyCursor=orphaned', { runtime })

    expect(await screen.findByText(databaseAdministrator.displayName)).toBeTruthy()
    expect(screen.getByText(translate('administrators.history.selectSubject'))).toBeTruthy()
    expect(fetch).toHaveBeenCalledOnce()
  })
})