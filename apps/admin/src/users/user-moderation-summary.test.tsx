import type { AdminContractOutputs } from '@gekichumai/admin-contract'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AdminProviders } from '../providers'
import { createAdminTestRuntime } from '../test/render-admin-app'
import { UserModerationSummary, type UserModerationSummaryLabels } from './user-moderation-summary'

const labels: UserModerationSummaryLabels = {
  title: 'User moderation summary',
  loading: 'Loading user summary',
  displayName: 'Display name',
  userId: 'User ID',
  email: 'Email',
  emailVerification: 'Email verification',
  effectiveRole: 'Effective role',
  verified: 'Verified',
  unverified: 'Not verified',
  roles: { user: 'User', admin: 'Administrator', superAdmin: 'Super administrator' },
  currentBan: 'Current ban',
  banStatus: 'Status',
  banStatuses: {
    unbanned: 'Unbanned',
    expired: 'Expired',
    temporary: 'Temporarily banned',
    permanent: 'Permanently banned',
  },
  noActiveBan: 'This user has no active ban.',
  reason: 'Reason',
  actorUserId: 'Actor user ID',
  banStartedAt: 'Ban started',
  expiresAt: 'Expires',
  evaluatedAt: 'Evaluated',
  dateTime: { local: 'Local time', utc: 'UTC' },
}

type BanState = AdminContractOutputs['getUserModerationDetail']['banState']

const baseDetail = {
  userId: 'user-1',
  displayName: 'Person One',
  email: 'person-one@example.com',
  emailVerified: true,
  effectiveRole: 'super_admin' as const,
}

const states = {
  unbanned: {
    status: 'unbanned',
    stateVersion: null,
    reason: null,
    actorUserId: null,
    banStartedAt: null,
    expiresAt: null,
    evaluatedAt: '2026-08-24T12:00:00.000Z',
  },
  expired: {
    status: 'expired',
    stateVersion: '4',
    reason: 'Restriction elapsed',
    actorUserId: 'admin-1',
    banStartedAt: '2026-08-20T10:00:00.000Z',
    expiresAt: '2026-08-21T10:00:00.000Z',
    evaluatedAt: '2026-08-24T12:00:00.000Z',
  },
  temporary: {
    status: 'temporary',
    stateVersion: '5',
    reason: 'Cooling-off period',
    actorUserId: 'admin-2',
    banStartedAt: '2026-08-24T10:00:00.000Z',
    expiresAt: '2026-08-25T10:00:00.000Z',
    evaluatedAt: '2026-08-24T12:00:00.000Z',
  },
  permanent: {
    status: 'permanent',
    stateVersion: '6',
    reason: 'Repeated abuse',
    actorUserId: 'admin-3',
    banStartedAt: '2026-08-24T10:00:00.000Z',
    expiresAt: null,
    evaluatedAt: '2026-08-24T12:00:00.000Z',
  },
} as const satisfies Readonly<Record<string, BanState>>

const renderSummary = (response: AdminContractOutputs['getUserModerationDetail'] | Promise<Response>) => {
  const fetch = vi.fn(async () =>
    response instanceof Promise ? response : Response.json(response),
  ) as unknown as typeof globalThis.fetch
  const runtime = createAdminTestRuntime({ fetch })
  return {
    fetch,
    ...render(
      <AdminProviders runtime={runtime}>
        <UserModerationSummary labels={labels} locale="en-US" userId="user-1" />
      </AdminProviders>,
    ),
  }
}

describe('user moderation summary', () => {
  it('renders only the approved identity, verification, role, and current temporary-ban fields', async () => {
    renderSummary({ ...baseDetail, banState: states.temporary })

    expect(await screen.findByRole('heading', { name: labels.title })).toBeTruthy()
    expect(await screen.findByText('Person One')).toBeTruthy()
    expect(screen.getByText('person-one@example.com')).toBeTruthy()
    expect(screen.getByText(labels.verified)).toBeTruthy()
    expect(screen.getByText(labels.roles.superAdmin)).toBeTruthy()
    expect(screen.getByText(states.temporary.reason)).toBeTruthy()
    expect(screen.getByText(states.temporary.actorUserId)).toBeTruthy()
    expect(document.querySelectorAll('time')).toHaveLength(6)
    expect([...document.querySelectorAll('time')].every((time) => time.dateTime.endsWith('Z'))).toBe(true)
    expect(document.body.textContent).not.toContain('password')
    expect(document.body.textContent).not.toContain('session')
  })

  it.each([
    ['unbanned', states.unbanned, labels.banStatuses.unbanned],
    ['expired', states.expired, labels.banStatuses.expired],
    ['permanent', states.permanent, labels.banStatuses.permanent],
  ] as const)(
    'presents the %s current-state variant without inventing missing fields',
    async (_kind, banState, copy) => {
      renderSummary({ ...baseDetail, banState })

      expect((await screen.findAllByText(copy)).length).toBeGreaterThan(0)
      if (banState.status === 'unbanned') {
        expect(screen.getByText(labels.noActiveBan)).toBeTruthy()
        expect(screen.queryByText(labels.reason)).toBeNull()
      } else {
        expect(screen.getByText(banState.reason)).toBeTruthy()
      }
    },
  )

  it('has explicit loading and safe error states', async () => {
    const never = new Promise<Response>(() => undefined)
    const pending = renderSummary(never)
    expect(screen.getByRole('status').textContent).toContain(labels.loading)
    pending.unmount()

    const fetch = vi.fn(async () => {
      throw new TypeError('private network detail')
    })
    const runtime = createAdminTestRuntime({ fetch: fetch as unknown as typeof globalThis.fetch })
    render(
      <AdminProviders runtime={runtime}>
        <UserModerationSummary labels={labels} locale="en-US" userId="user-1" />
      </AdminProviders>,
    )

    expect((await screen.findByRole('alert')).textContent).toContain('Connection failed')
    expect(document.body.textContent).not.toContain('private network detail')
  })
})