import { ADMIN_ERROR_MESSAGES, type AdminContractOutputs } from '@gekichumai/admin-contract'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AdminProviders } from '../providers'
import { createAdminTestRuntime } from '../test/render-admin-app'
import { AdministratorRoleHistory, type AdministratorRoleHistoryLabels } from './administrator-role-history'

const labels: AdministratorRoleHistoryLabels = {
  title: 'Administrator role history',
  selectSubject: 'Select an account to load its history.',
  loading: 'Loading role history',
  empty: 'No role changes exist.',
  chronology: 'Newest changes appear first.',
  subjectUserId: 'Selected account ID',
  grant: 'Administrator granted',
  revoke: 'Administrator revoked',
  actorUserId: 'Acting super administrator',
  reason: 'Private reason',
  changedAt: 'Changed at',
  backToNewest: 'Back to newest',
  older: 'Older changes',
  dateTime: { local: 'Local time', utc: 'UTC' },
}

const events = [
  {
    id: '2',
    subjectUserId: 'subject-1',
    actorUserId: 'actor-2',
    previousRole: 'admin' as const,
    newRole: 'user' as const,
    reason: 'Coverage ended',
    changedAt: '2026-08-24T12:00:00.000Z',
  },
  {
    id: '1',
    subjectUserId: 'subject-1',
    actorUserId: 'actor-1',
    previousRole: 'user' as const,
    newRole: 'admin' as const,
    reason: 'Operational coverage',
    changedAt: '2026-08-20T12:00:00.000Z',
  },
] satisfies AdminContractOutputs['listAdministratorRoleHistory']['items']

const renderHistory = ({
  cursor,
  fetch = vi.fn(async () => Response.json({ items: events, nextCursor: null })),
  onCursorChange = vi.fn(),
  userId = 'subject-1' as string | null,
}: {
  readonly cursor?: string
  readonly fetch?: ReturnType<typeof vi.fn<(request: RequestInfo | URL) => Promise<Response>>>
  readonly onCursorChange?: (cursor: string | undefined) => void
  readonly userId?: string | null
} = {}) => {
  const runtime = createAdminTestRuntime({ fetch: fetch as unknown as typeof globalThis.fetch })
  return {
    fetch,
    onCursorChange,
    ...render(
      <AdminProviders runtime={runtime}>
        <AdministratorRoleHistory
          cursor={cursor}
          labels={labels}
          limit={20}
          locale="en-US"
          onCursorChange={onCursorChange}
          userId={userId ?? undefined}
        />
      </AdminProviders>,
    ),
  }
}

describe('administrator role history', () => {
  it('does not mount a history query until an immutable subject ID is selected', () => {
    const rendered = renderHistory({ userId: null })

    expect(screen.getByText(labels.selectSubject)).toBeTruthy()
    expect(screen.getByText(labels.chronology)).toBeTruthy()
    expect(rendered.fetch).not.toHaveBeenCalled()
  })

  it('renders grant and revoke chronology, private reasons, actors, and explicit local and UTC instants', async () => {
    const rendered = renderHistory()

    expect(await screen.findByText(labels.revoke)).toBeTruthy()
    expect(screen.getByText(`${labels.subjectUserId}:`)).toBeTruthy()
    expect(screen.getByText('subject-1')).toBeTruthy()
    expect(screen.getByText(labels.grant)).toBeTruthy()
    expect(screen.getByText('Coverage ended')).toBeTruthy()
    expect(screen.getByText('Operational coverage')).toBeTruthy()
    expect(screen.getByText('actor-2')).toBeTruthy()
    expect(screen.getByText('actor-1')).toBeTruthy()
    expect(document.querySelectorAll('time')).toHaveLength(4)
    expect([...document.querySelectorAll('time')].every((time) => time.dateTime.endsWith('Z'))).toBe(true)

    await waitFor(() => expect(rendered.fetch).toHaveBeenCalledOnce())
    const request = rendered.fetch.mock.calls[0]![0]
    expect(request).toBeInstanceOf(Request)
    expect((request as Request).url).toContain('/api/admin/administrators/subject-1/role-history')
    expect((request as Request).url).toContain('limit=20')
  })

  it('uses one subject-history request for every event without actor lookup requests', async () => {
    const rendered = renderHistory()
    await screen.findByText(labels.revoke)

    await waitFor(() => expect(rendered.fetch).toHaveBeenCalledOnce())
    const urls = rendered.fetch.mock.calls.map(([request]) => (request as Request).url)
    expect(urls).toHaveLength(1)
    expect(urls[0]).not.toContain('/users/actor-')
  })

  it('reports opaque next and reset cursors and binds loaded pages to the selected subject', async () => {
    const onCursorChange = vi.fn()
    const newest = renderHistory({
      fetch: vi.fn(async () => Response.json({ items: events.slice(0, 1), nextCursor: 'history_page_2' })),
      onCursorChange,
    })
    fireEvent.click(await screen.findByRole('button', { name: labels.older }))
    expect(onCursorChange).toHaveBeenCalledWith('history_page_2')
    newest.unmount()

    const older = renderHistory({ cursor: 'history_page_2', onCursorChange })
    fireEvent.click(await screen.findByRole('button', { name: labels.backToNewest }))
    expect(onCursorChange).toHaveBeenLastCalledWith(undefined)
    await waitFor(() => expect(older.fetch).toHaveBeenCalledOnce())
    const request = older.fetch.mock.calls[0]![0] as Request
    expect(request.url).toContain('/administrators/subject-1/role-history')
    expect(request.url).toContain('cursor=history_page_2')
  })

  it('recovers an expired cursor by asking its owner to return to the newest page', async () => {
    const onCursorChange = vi.fn()
    renderHistory({
      cursor: 'expired_cursor',
      fetch: vi.fn(async () =>
        Response.json(
          {
            defined: true,
            code: 'INVALID_CURSOR',
            status: 400,
            message: ADMIN_ERROR_MESSAGES.INVALID_CURSOR,
            data: { requestId: null },
          },
          { status: 400 },
        ),
      ),
      onCursorChange,
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Refresh current state' }))
    expect(onCursorChange).toHaveBeenCalledWith(undefined)
  })

  it('renders clear empty, loading, and redacted transport states', async () => {
    const empty = renderHistory({ fetch: vi.fn(async () => Response.json({ items: [], nextCursor: null })) })
    expect(await screen.findByText(labels.empty)).toBeTruthy()
    expect(screen.queryByRole('listitem')).toBeNull()
    empty.unmount()

    const pending = renderHistory({
      fetch: vi.fn(() => new Promise<Response>(() => undefined)),
    })
    expect(screen.getByRole('status').textContent).toContain(labels.loading)
    pending.unmount()

    renderHistory({
      fetch: vi.fn(async () => {
        throw new TypeError('private history transport detail')
      }),
    })
    expect((await screen.findByRole('alert')).textContent).toContain('Connection failed')
    expect(document.body.textContent).not.toContain('private history transport detail')
  })
})