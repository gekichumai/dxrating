import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type CloudSaveUi, CloudSaveUiContext } from '@/models/scores/CloudSaveUiContext'
import { CloudScoreRepository } from '@/models/scores/CloudScoreRepository'
import { FakeCloudSaveServer, verifiedProvenance } from '@/models/scores/__tests__/fakeCloudSaveServer'
import { SyncIssuesList } from '../SyncIssuesList'
import { SyncStatusIndicator } from '../SyncStatusIndicator'
import { m } from '@/paraglide/messages'

/**
 * The sync surfaces over the real `CloudScoreRepository` (an in-memory server and IndexedDB): its issues, its
 * status notifications and what `reapplyIssue` / `dismissIssue` send.
 */

const SHEET_A = 'dsht_e5nsvt8k2a'

let server: FakeCloudSaveServer
let repository: CloudScoreRepository

function withCloud(ui: CloudSaveUi) {
  return ({ children }: { children: ReactNode }) => (
    <CloudSaveUiContext.Provider value={ui}>{children}</CloudSaveUiContext.Provider>
  )
}

/** A manual change sent after a maimai NET import verified a better score: kept by the server as an issue */
async function withSupersededChange() {
  server.put(SHEET_A, 990000)
  await repository.sync()
  server.put(SHEET_A, 1002000, verifiedProvenance())
  repository.setManual({ sheetId: SHEET_A, achievementRate: 98.5 }, 'typed')
  await repository.sync()
  expect(repository.status.issues).toHaveLength(1)
}

function renderSurfaces() {
  const ui: CloudSaveUi = { controller: repository, listSaves: async () => [], setActiveSaveId: vi.fn() }
  return render(
    <>
      <SyncStatusIndicator />
      <SyncIssuesList />
    </>,
    { wrapper: withCloud(ui) },
  )
}

const statusButton = () => screen.getByRole('button', { name: /^Cloud save/ })

beforeEach(async () => {
  server = new FakeCloudSaveServer()
  repository = await CloudScoreRepository.open({
    userId: 'user-1',
    saveId: 'dsav_one',
    api: server.api,
    indexedDB: new IDBFactory(),
    locks: null,
    createChannel: null,
    eventTarget: null,
    visibilityTarget: null,
    isVisible: () => true,
  })
})

afterEach(async () => {
  await repository.dispose({ flushTimeoutMs: 0 })
})

describe('sync surfaces over CloudScoreRepository', () => {
  it('shows the issue the server reported and applies the intent again on purpose', async () => {
    await withSupersededChange()
    renderSurfaces()

    expect(statusButton().getAttribute('aria-label')).toBe('Cloud save, Up to date, 1 sync issue')
    const item = screen.getByRole('listitem')
    expect(item.textContent).toContain('Your change: 98.5000%')
    expect(item.textContent).toContain('A newer verified score was kept.')

    act(() => fireEvent.click(within(item).getByRole('button', { name: 'Use my value anyway' })))
    expect(screen.queryByRole('listitem')).toBeNull()
    // Queued as a change of its own, then sent over the server's record
    await waitFor(() => expect(statusButton().getAttribute('aria-label')).toContain('1 change waiting to sync'))
    await act(() => repository.sync())

    expect(server.records.get(SHEET_A)).toMatchObject({
      achievement: 985000,
      provenance: { verification: 'user_edited' },
    })
    expect(statusButton().getAttribute('aria-label')).toBe('Cloud save, Up to date')
  })

  it('dismisses the issue and keeps the server record', async () => {
    await withSupersededChange()
    renderSurfaces()

    act(() => fireEvent.click(within(screen.getByRole('listitem')).getByRole('button', { name: 'Dismiss' })))
    await act(() => repository.sync())

    expect(screen.queryByRole('listitem')).toBeNull()
    expect(repository.status.issues).toEqual([])
    expect(statusButton().getAttribute('aria-label')).toBe('Cloud save, Up to date')
    expect(server.records.get(SHEET_A)).toMatchObject({
      achievement: 1002000,
      provenance: { verification: 'verified' },
    })
  })

  it('announces a sync that stops working, through a live region outside the popover', async () => {
    renderSurfaces()
    await act(() => repository.sync())
    const status = screen.getByRole('status')
    expect(status.textContent).toBe('')

    server.failures.push({ status: 503, code: 'SERVICE_UNAVAILABLE' })
    repository.setManual({ sheetId: SHEET_A, achievementRate: 99 }, 'typed')
    await act(() => repository.sync())

    expect(statusButton().getAttribute('data-sync-state')).toBe('error')
    expect(screen.getByRole('status').textContent).toBe("Can't sync right now")
  })
})