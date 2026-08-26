import type { AdminContractOutputs } from '@gekichumai/admin-contract'
import { MantineProvider } from '@mantine/core'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, type Mock } from 'vitest'
import {
  AdministratorRosterTable,
  type AdministratorRosterRow,
  type AdministratorRosterTableLabels,
} from './administrator-roster-table'

const labels: AdministratorRosterTableLabels = {
  caption: 'Current administrator roster',
  tableRegion: 'Scrollable administrator roster',
  loading: 'Loading administrators',
  emptyTitle: 'No administrators found',
  emptyDescription: 'No administrator accounts are currently available.',
  columns: {
    identity: 'Identity',
    email: 'Email',
    accountStatus: 'Account status',
    roleAndSource: 'Role and source',
    actions: 'Actions',
  },
  userId: 'User ID',
  email: {
    verified: 'Email verified',
    notVerified: 'Email not verified',
  },
  roles: {
    administrator: 'Administrator',
    superAdministrator: 'Super administrator',
  },
  sources: {
    database: 'Database-managed role',
    deployment: 'Deployment configuration',
    databaseDescription: 'Authorized super administrators can revoke this database-backed role.',
    deploymentDescription:
      'This super-administrator role is managed outside the admin interface by deployment configuration.',
    immutable: 'Immutable here',
  },
  statuses: {
    active: 'Active',
    temporarilyBanned: 'Temporarily banned',
    permanentlyBanned: 'Permanently banned',
    expiresAt: 'Ban expires',
  },
  openHistory: 'Open role history',
  revoke: 'Revoke administrator',
  dateTime: { local: 'Local time', utc: 'UTC' },
}

const rows = [
  {
    userId: 'database-active',
    displayName: 'Database Active',
    email: 'database-active@example.test',
    emailVerified: false,
    effectiveRole: 'admin' as const,
    roleSource: 'database' as const,
    accountStatus: { status: 'active' as const },
  },
  {
    userId: 'deployment-temporary',
    displayName: 'Deployment Temporary',
    email: 'deployment-temporary@example.test',
    emailVerified: true,
    effectiveRole: 'super_admin' as const,
    roleSource: 'deployment' as const,
    accountStatus: {
      status: 'temporarily_banned' as const,
      expiresAt: '2026-08-30T12:00:00.000Z',
    },
  },
  {
    userId: 'database-permanent',
    displayName: 'Database Permanent',
    email: 'database-permanent@example.test',
    emailVerified: true,
    effectiveRole: 'admin' as const,
    roleSource: 'database' as const,
    accountStatus: { status: 'permanently_banned' as const },
  },
] satisfies AdminContractOutputs['listAdministrators']['items']

type RenderOptions = {
  readonly canManageAdministrators?: boolean
  readonly loading?: boolean
  readonly onOpenRoleHistory?: Mock<(userId: string) => void>
  readonly onRequestRevoke?: Mock<(administrator: AdministratorRosterRow) => void>
  readonly tableRows?: AdminContractOutputs['listAdministrators']['items']
}

const renderTable = ({
  canManageAdministrators = false,
  loading = false,
  onOpenRoleHistory = vi.fn(),
  onRequestRevoke = vi.fn(),
  tableRows = rows,
}: RenderOptions = {}) => {
  const table = canManageAdministrators ? (
    <AdministratorRosterTable
      canManageAdministrators
      labels={labels}
      loading={loading}
      locale="en-US"
      onOpenRoleHistory={onOpenRoleHistory}
      onRequestRevoke={onRequestRevoke}
      rows={tableRows}
    />
  ) : (
    <AdministratorRosterTable
      canManageAdministrators={false}
      labels={labels}
      loading={loading}
      locale="en-US"
      onOpenRoleHistory={onOpenRoleHistory}
      rows={tableRows}
    />
  )

  return {
    onOpenRoleHistory,
    onRequestRevoke,
    ...render(<MantineProvider>{table}</MantineProvider>),
  }
}

describe('administrator roster table', () => {
  it('shows the complete approved roster projection with every account-status variant', () => {
    renderTable()

    expect(screen.getByText('Database Active')).toBeTruthy()
    expect(screen.getByText('database-active')).toBeTruthy()
    expect(screen.getByText('database-active@example.test')).toBeTruthy()
    expect(screen.getByText(labels.email.notVerified)).toBeTruthy()
    expect(screen.getAllByText(labels.email.verified)).toHaveLength(2)
    expect(screen.getByText(labels.statuses.active)).toBeTruthy()
    expect(screen.getByText(labels.statuses.temporarilyBanned)).toBeTruthy()
    expect(screen.getByText(labels.statuses.permanentlyBanned)).toBeTruthy()
    expect(screen.getByText(labels.statuses.expiresAt)).toBeTruthy()
    expect(document.querySelectorAll('time')).toHaveLength(2)

    const table = screen.getByRole('table', { name: labels.caption })
    expect(within(table).getAllByRole('row')).toHaveLength(4)
    expect(within(table).getAllByRole('cell')).toHaveLength(15)
  })

  it('clearly separates revocable database administrators from immutable deployment super administrators', () => {
    renderTable()

    expect(screen.getAllByText(labels.roles.administrator)).toHaveLength(2)
    expect(screen.getByText(labels.roles.superAdministrator)).toBeTruthy()
    expect(screen.getAllByText(labels.sources.database)).toHaveLength(2)
    expect(screen.getByText(labels.sources.deployment)).toBeTruthy()
    expect(screen.getAllByText(labels.sources.databaseDescription)).toHaveLength(2)
    expect(screen.getByText(labels.sources.deploymentDescription)).toBeTruthy()
    expect(screen.getByText(labels.sources.immutable)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(
      /environment variable|configuration value|configured identifier list/i,
    )
  })

  it('renders only approved operational fields even if an unsafe object reaches the presentation boundary', () => {
    const unsafeDatabaseRow = {
      ...rows[0],
      ipAddress: '203.0.113.42',
      loginActivity: 'PRIVATE LOGIN ACTIVITY',
      sessionToken: 'PRIVATE SESSION TOKEN',
      userAgent: 'PRIVATE USER AGENT',
    }
    const tableRows: AdminContractOutputs['listAdministrators']['items'] = [unsafeDatabaseRow, rows[1]!]

    renderTable({ tableRows })

    expect(screen.getByText('Database Active')).toBeTruthy()
    expect(screen.getByText('Deployment Temporary')).toBeTruthy()
    expect(document.body.textContent).not.toContain('203.0.113.42')
    expect(document.body.textContent).not.toContain('PRIVATE LOGIN ACTIVITY')
    expect(document.body.textContent).not.toContain('PRIVATE SESSION TOKEN')
    expect(document.body.textContent).not.toContain('PRIVATE USER AGENT')
  })

  it('gives ordinary administrators the entire read-only roster and role histories without management controls', async () => {
    const user = userEvent.setup()
    const { onOpenRoleHistory, onRequestRevoke } = renderTable()

    const historyButtons = screen.getAllByRole('button', { name: new RegExp(`^${labels.openHistory}:`) })
    expect(historyButtons).toHaveLength(3)
    expect(screen.queryByRole('button', { name: new RegExp(`^${labels.revoke}:`) })).toBeNull()

    await user.click(screen.getByRole('button', { name: `${labels.openHistory}: Deployment Temporary` }))
    expect(onOpenRoleHistory).toHaveBeenCalledOnce()
    expect(onOpenRoleHistory).toHaveBeenCalledWith('deployment-temporary')
    expect(onRequestRevoke).not.toHaveBeenCalled()
  })

  it('offers revoke callbacks only for database administrators when management is allowed', async () => {
    const user = userEvent.setup()
    const { onRequestRevoke } = renderTable({ canManageAdministrators: true })

    const revokeButtons = screen.getAllByRole('button', { name: new RegExp(`^${labels.revoke}:`) })
    expect(revokeButtons).toHaveLength(2)
    expect(screen.queryByRole('button', { name: `${labels.revoke}: Deployment Temporary` })).toBeNull()

    await user.click(screen.getByRole('button', { name: `${labels.revoke}: Database Permanent` }))
    expect(onRequestRevoke).toHaveBeenCalledOnce()
    expect(onRequestRevoke).toHaveBeenCalledWith(rows[2])
  })

  it('keeps native table semantics inside a named, keyboard-focusable horizontal region', () => {
    renderTable({ loading: true })

    const region = screen.getByRole('region', { name: labels.tableRegion })
    expect(region.getAttribute('tabindex')).toBe('0')
    const table = within(region).getByRole('table', { name: labels.caption })
    expect(table.getAttribute('aria-busy')).toBe('true')
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual([
      labels.columns.identity,
      labels.columns.email,
      labels.columns.accountStatus,
      labels.columns.roleAndSource,
      labels.columns.actions,
    ])
  })

  it('provides explicit loading and empty states without fabricated identities or actions', () => {
    const loading = renderTable({ loading: true, tableRows: [] })
    expect(screen.getByRole('status').textContent).toContain(labels.loading)
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    loading.unmount()

    renderTable({ tableRows: [] })
    expect(screen.getByText(labels.emptyTitle)).toBeTruthy()
    expect(screen.getByText(labels.emptyDescription)).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })
})