import type { AdminContractOutputs } from '@gekichumai/admin-contract'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AdminProviders } from '../providers'
import { createAdminTestRuntime } from '../test/render-admin-app'
import { UserBanHistory, type UserBanHistoryLabels } from './user-ban-history'

const labels: UserBanHistoryLabels = {
  title: 'Ban history',
  loading: 'Loading ban history',
  empty: 'No ban history exists.',
  temporaryBan: 'Temporary ban',
  permanentBan: 'Permanent ban',
  unban: 'Unbanned',
  reason: 'Reason',
  noReason: 'No reason recorded',
  actorUserId: 'Actor user ID',
  occurredAt: 'Occurred',
  banStartedAt: 'Ban started',
  expiresAt: 'Expires',
  backToNewest: 'Back to newest',
  older: 'Older events',
  dateTime: { local: 'Local time', utc: 'UTC' },
}

const events = [
  {
    id: '3',
    subjectUserId: 'user-1',
    actorUserId: 'admin-1',
    previousEventId: '2',
    action: 'unban' as const,
    kind: null,
    reason: null,
    banStartedAt: null,
    expiresAt: null,
    createdAt: '2026-08-24T12:00:00.000Z',
  },
  {
    id: '2',
    subjectUserId: 'user-1',
    actorUserId: 'admin-2',
    previousEventId: '1',
    action: 'ban' as const,
    kind: 'permanent' as const,
    reason: 'Repeated abuse',
    banStartedAt: '2026-08-23T12:00:00.000Z',
    expiresAt: null,
    createdAt: '2026-08-23T12:00:00.000Z',
  },
  {
    id: '1',
    subjectUserId: 'user-1',
    actorUserId: 'admin-3',
    previousEventId: null,
    action: 'ban' as const,
    kind: 'temporary' as const,
    reason: 'Cooling-off period',
    banStartedAt: '2026-08-20T12:00:00.000Z',
    expiresAt: '2026-08-22T12:00:00.000Z',
    createdAt: '2026-08-20T12:00:00.000Z',
  },
] satisfies AdminContractOutputs['listUserBanHistory']['items']

const renderHistory = ({
  cursor,
  output = { items: events, nextCursor: null },
  onCursorChange = vi.fn(),
}: {
  readonly cursor?: string
  readonly output?: AdminContractOutputs['listUserBanHistory']
  readonly onCursorChange?: (cursor: string | undefined) => void
} = {}) => {
  const fetch = vi.fn(async (_request: RequestInfo | URL) => Response.json(output))
  const runtime = createAdminTestRuntime({ fetch: fetch as unknown as typeof globalThis.fetch })
  return {
    fetch,
    onCursorChange,
    ...render(
      <AdminProviders runtime={runtime}>
        <UserBanHistory
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

describe('user ban history', () => {
  it('renders immutable temporary, permanent, and unban events with explicit local and UTC times', async () => {
    const rendered = renderHistory()

    expect(await screen.findByRole('heading', { name: labels.title })).toBeTruthy()
    expect(await screen.findByText(labels.temporaryBan)).toBeTruthy()
    expect(screen.getByText(labels.permanentBan)).toBeTruthy()
    expect(screen.getByText(labels.unban)).toBeTruthy()
    expect(screen.getByText(labels.noReason)).toBeTruthy()
    expect(screen.getByText('Cooling-off period')).toBeTruthy()
    expect(screen.getByText('Repeated abuse')).toBeTruthy()
    expect(document.querySelectorAll('time')).toHaveLength(12)

    await waitFor(() => expect(rendered.fetch).toHaveBeenCalledOnce())
    const request = rendered.fetch.mock.calls[0]![0]
    expect(request).toBeInstanceOf(Request)
    expect((request as Request).url).toContain('/api/admin/users/user-1/ban-history')
  })

  it('reports opaque next and reset cursor choices to its owner', async () => {
    const onCursorChange = vi.fn()
    const first = renderHistory({
      output: { items: events.slice(0, 1), nextCursor: 'older_page_2' },
      onCursorChange,
    })

    fireEvent.click(await screen.findByRole('button', { name: labels.older }))
    expect(onCursorChange).toHaveBeenCalledWith('older_page_2')
    first.unmount()

    const older = renderHistory({ cursor: 'older_page_2', onCursorChange })
    fireEvent.click(await screen.findByRole('button', { name: labels.backToNewest }))
    expect(onCursorChange).toHaveBeenLastCalledWith(undefined)
    await waitFor(() => expect(older.fetch).toHaveBeenCalledOnce())
    const request = older.fetch.mock.calls[0]![0]
    expect(request).toBeInstanceOf(Request)
    expect((request as Request).url).toContain('cursor=older_page_2')
  })

  it('renders a clear empty history without pagination controls', async () => {
    renderHistory({ output: { items: [], nextCursor: null } })

    expect(await screen.findByText(labels.empty)).toBeTruthy()
    expect(screen.queryByRole('button', { name: labels.older })).toBeNull()
    expect(screen.queryByRole('listitem')).toBeNull()
  })

  it('has explicit loading and redacted error states', async () => {
    const pendingRuntime = createAdminTestRuntime({
      fetch: (() => new Promise<Response>(() => undefined)) as typeof globalThis.fetch,
    })
    const pending = render(
      <AdminProviders runtime={pendingRuntime}>
        <UserBanHistory labels={labels} locale="en-US" onCursorChange={vi.fn()} userId="user-1" />
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
        <UserBanHistory labels={labels} locale="en-US" onCursorChange={vi.fn()} userId="user-1" />
      </AdminProviders>,
    )
    expect((await screen.findByRole('alert')).textContent).toContain('Connection failed')
    expect(document.body.textContent).not.toContain('private transport detail')
  })
})