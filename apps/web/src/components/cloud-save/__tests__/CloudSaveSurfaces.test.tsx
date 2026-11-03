import { catalogSnapshot } from '@gekichumai/dxdata/snapshot'
import { getSongCatalog } from '@gekichumai/maimai-domain'
import { VersionEnum } from '@gekichumai/dxdata'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import i18n from 'i18next'
import type { ReactNode } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { type CloudSaveUi, CloudSaveUiContext } from '@/models/scores/CloudSaveUiContext'
import { createDemoCloudSave, type DemoCloudScoreRepository } from '@/models/scores/demoCloudSave'
import type { ScoreRepositoryStatus } from '@/models/scores/ScoreRepository'
import { initI18n } from '@/setup/init-i18n'
import { CloudSaveSection } from '../CloudSaveSection'
import { ImportHistoryList } from '../ImportHistoryList'
import { RecordProvenanceBadge, RecordProvenanceIcon } from '../ProvenanceBadge'
import { SaveSelector } from '../SaveSelector'
import { SyncIssuesList } from '../SyncIssuesList'
import { SyncStatusIndicator } from '../SyncStatusIndicator'
import { CloudImportConfirmDialog } from '../CloudImportConfirmDialog'

const catalog = getSongCatalog(catalogSnapshot, VersionEnum.PRiSMPLUS)

function demo(state: ScoreRepositoryStatus['state'] = 'idle') {
  return createDemoCloudSave(catalog, state)
}

function withCloud(ui: CloudSaveUi | null) {
  return ({ children }: { children: ReactNode }) => (
    <CloudSaveUiContext.Provider value={ui}>{children}</CloudSaveUiContext.Provider>
  )
}

/** The demo's records by provenance kind */
function sheetOf(repository: DemoCloudScoreRepository, index: number): string {
  return repository.entries()[index]!.sheetId
}

beforeAll(async () => {
  initI18n()
  await i18n.changeLanguage('en')
})

describe('cloud save surfaces on the local save', () => {
  it('render nothing at all', () => {
    const { container } = render(
      <>
        <SyncStatusIndicator />
        <SyncIssuesList />
        <SaveSelector />
        <ImportHistoryList />
        <CloudSaveSection />
        <RecordProvenanceIcon sheetId="dsht_e5nsvt8k2a" />
        <RecordProvenanceBadge sheetId="dsht_e5nsvt8k2a" />
        <CloudImportConfirmDialog />
      </>,
      { wrapper: withCloud(null) },
    )
    expect(container.innerHTML).toBe('')
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  })
})

describe('provenance badges', () => {
  it('render the wording of each record', () => {
    const { repository, ui } = demo()
    const sentences = [0, 1, 2, 3, 4, 5, 7].map((index) => {
      const { unmount } = render(<RecordProvenanceBadge sheetId={sheetOf(repository, index)} />, {
        wrapper: withCloud(ui),
      })
      const text = document.body.textContent
      unmount()
      return text
    })
    expect(sentences).toEqual([
      'Verified · maimai NET (JP) · friend code 1234… · fetched 2026-11-02',
      'Verified · LXNS · friend code 9876… · fetched 2026-11-01',
      'Verified · Diving-Fish · account demo… · fetched 2026-10-30',
      'From file (AquaDX) · not verified',
      'From file (claimed: LXNS) · not verified',
      'From this device (claimed: maimai NET) · not verified',
      'Edited (originally imported)',
    ])
  })

  it('show a named icon in the row, except for hand-entered scores', () => {
    const { repository, ui } = demo()
    render(
      <>
        <RecordProvenanceIcon sheetId={sheetOf(repository, 0)} />
        <RecordProvenanceIcon sheetId={sheetOf(repository, 6)} />
      </>,
      { wrapper: withCloud(ui) },
    )
    const icons = screen.getAllByRole('button')
    expect(icons).toHaveLength(1)
    expect(icons[0]?.getAttribute('aria-label')).toBe(
      'Verified · maimai NET (JP) · friend code 1234… · fetched 2026-11-02',
    )
    expect(icons[0]?.getAttribute('data-provenance')).toBe('verified')
  })
})

describe('SyncIssuesList', () => {
  it('shows the value, method and time of a superseded intent and why it was not applied', () => {
    const { ui } = demo()
    render(<SyncIssuesList />, { wrapper: withCloud(ui) })
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]?.textContent).toContain('Your change: 100.1000% FC · typed')
    expect(items[0]?.textContent).toContain('A newer verified score was kept.')
    expect(within(items[0]!).getByRole('button', { name: 'Use my value anyway' })).toBeTruthy()
    expect(items[1]?.textContent).toContain('Your change: removed')
    // A rejected change can only be dismissed
    expect(within(items[2]!).queryByRole('button', { name: 'Use my value anyway' })).toBeNull()
  })

  it('applies an intent again or dismisses it', () => {
    const { repository, ui } = demo()
    const reapply = vi.spyOn(repository, 'reapplyIssue')
    const dismiss = vi.spyOn(repository, 'dismissIssue')
    const firstSheet = repository.status.issues[0]!.sheetId
    render(<SyncIssuesList />, { wrapper: withCloud(ui) })

    fireEvent.click(within(screen.getAllByRole('listitem')[0]!).getByRole('button', { name: 'Use my value anyway' }))
    expect(reapply).toHaveBeenCalledWith('demo-issue-1')
    // The user's value now stands, as an edit of the imported record
    expect(repository.get(firstSheet)?.achievement).toBe(1001000)
    expect(repository.get(firstSheet)?.provenance?.verification).toBe('user_edited')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)

    fireEvent.click(within(screen.getAllByRole('listitem')[0]!).getByRole('button', { name: 'Dismiss' }))
    expect(dismiss).toHaveBeenCalledWith('demo-issue-2')
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })
})

describe('SyncStatusIndicator', () => {
  it.each([
    ['idle', 'Cloud save, Up to date, 3 sync issues'],
    ['syncing', 'Cloud save, Syncing…, 3 changes waiting to sync, 3 sync issues'],
    ['offline', 'Cloud save, Offline, 3 changes waiting to sync, 3 sync issues'],
    ['error', "Cloud save, Can't sync right now, 3 changes waiting to sync, 3 sync issues"],
  ] as const)('names the %s state, the pending count and the issues', (state, label) => {
    const { ui } = demo(state)
    render(<SyncStatusIndicator />, { wrapper: withCloud(ui) })
    const button = screen.getByRole('button', { name: label })
    expect(button?.getAttribute('data-sync-state')).toBe(state)
  })

  it('marks the issue count with white text on a fill dark enough to read', () => {
    const { ui } = demo()
    const { container } = render(<SyncStatusIndicator />, { wrapper: withCloud(ui) })
    const badge = container.querySelector('.bg-amber-700')
    expect(badge?.textContent).toBe('3')
    expect(container.querySelector('.bg-amber-500')).toBeNull()
  })

  it('keeps the cloud still while syncing (no rotating glyph)', () => {
    const { ui } = demo('syncing')
    const { container } = render(<SyncStatusIndicator />, { wrapper: withCloud(ui) })
    expect(container.querySelector('.cloud-save-pulse')).not.toBeNull()
    expect(container.querySelector('.cloud-save-spin')).toBeNull()
  })

  it('announces offline, errors and issues in a live region, not every sync', () => {
    for (const [state, text] of [
      ['syncing', '3 sync issues'],
      ['offline', 'Offline, 3 sync issues'],
      ['error', "Can't sync right now, 3 sync issues"],
    ] as const) {
      const { ui } = demo(state)
      const { unmount } = render(<SyncStatusIndicator />, { wrapper: withCloud(ui) })
      expect(screen.getByRole('status').textContent).toBe(text)
      unmount()
    }
  })

  it('opens the sync issues', () => {
    const { ui } = demo('offline')
    render(<SyncStatusIndicator />, { wrapper: withCloud(ui) })
    fireEvent.click(screen.getByRole('button'))
    const dialog = screen.getByRole('dialog', { name: 'Cloud save' })
    expect(dialog?.textContent).toContain('Offline · 3 changes waiting to sync')
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(3)
  })
})

describe('SaveSelector', () => {
  it('lists the saves with region, record count, B50 and last sync, and switches the active save', async () => {
    const { repository, ui } = demo()
    const setActiveSaveId = vi.fn((saveId: string) => repository.switchSave(saveId))
    render(<SaveSelector />, { wrapper: withCloud({ ...ui, setActiveSaveId }) })

    const options = await screen.findAllByRole('button')
    expect(options).toHaveLength(3)
    expect(options[0]?.getAttribute('aria-current')).toBe('true')
    expect(options[0]?.textContent).toContain('Main card')
    expect(options[0]?.textContent).toContain('JP')
    expect(options[0]?.textContent).toContain('1,287 records · B50 15,992 · last synced 2026-11-02')
    expect(options[1]?.textContent).toContain('Intl')
    expect(options[1]?.textContent).not.toContain('B50')

    // The active save: nothing to switch to
    fireEvent.click(options[0]!)
    expect(setActiveSaveId).not.toHaveBeenCalled()
    fireEvent.click(options[1]!)
    expect(setActiveSaveId).toHaveBeenCalledWith('dsav_demo_intl')
    await waitFor(() => expect(screen.getAllByRole('button')[1]?.getAttribute('aria-current')).toBe('true'))
  })

  it('says so when the saves cannot load, and loads them again on "Try again"', async () => {
    const { ui } = demo()
    const listSaves = vi.fn(ui.listSaves).mockRejectedValueOnce(new Error('offline'))
    render(<SaveSelector />, { wrapper: withCloud({ ...ui, listSaves }) })
    expect((await screen.findByRole('alert')).textContent).toBe("Couldn't load your saves.")

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findAllByRole('button', { current: true })).toHaveLength(1)
    expect(listSaves).toHaveBeenCalledTimes(2)
  })

  it('says when there are no saves yet', async () => {
    const { ui } = demo()
    render(<SaveSelector />, { wrapper: withCloud({ ...ui, listSaves: async () => [] }) })
    expect(await screen.findByText('No cloud saves yet.')).toBeTruthy()
    expect(screen.queryByRole('list')).toBeNull()
  })
})

describe('ImportHistoryList', () => {
  it('lists each job with what it changed', async () => {
    const { ui } = demo()
    render(<ImportHistoryList />, { wrapper: withCloud(ui) })
    const items = await screen.findAllByRole('listitem')
    expect(items).toHaveLength(4)
    expect(items[0]?.textContent).toContain('maimai NET (JP)')
    expect(items[0]?.textContent).toContain('Automatic')
    expect(items[0]?.textContent).toContain('3 new · 5 improved · 1278 unchanged · 1 kept your edit')
    expect(items[1]?.textContent).toContain('210 now verified')
    expect(items[2]?.textContent).toContain('20 unknown charts')
    // In words, never the bare code
    expect(items[3]?.textContent).toContain('Failed: Unable to sign in. Check your SEGA ID and password.')
    expect(items[3]?.textContent).not.toContain('INVALID_CREDENTIALS')
  })

  it('loads the history again on "Try again" after a failure', async () => {
    const { repository, ui } = demo()
    const listImportJobs = vi.spyOn(repository, 'listImportJobs').mockRejectedValueOnce(new Error('offline'))
    render(<ImportHistoryList />, { wrapper: withCloud(ui) })
    expect((await screen.findByRole('alert')).textContent).toBe("Couldn't load the import history.")

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findAllByRole('listitem')).toHaveLength(4)
    expect(listImportJobs).toHaveBeenCalledTimes(2)
  })
})

describe('CloudSaveSection', () => {
  it('groups saves, sync issues and import history', async () => {
    const { ui } = demo()
    render(<CloudSaveSection />, { wrapper: withCloud(ui) })
    expect(screen.getByRole('heading', { level: 1, name: 'Cloud save' })).toBeTruthy()
    for (const name of ['Saves', 'Sync issues', 'Import history']) {
      expect(screen.getByRole('region', { name })).toBeTruthy()
    }
    await act(async () => {})
  })
})