import type { ImportJobDTO } from '@gekichumai/api-contract'
import { catalogSnapshot } from '@gekichumai/dxdata/snapshot'
import { VersionEnum } from '@gekichumai/dxdata'
import { getSongCatalog } from '@gekichumai/maimai-domain'
import { act, fireEvent, render, screen } from '@testing-library/react'
import i18n from 'i18next'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { CloudImportConfirmDialog } from '@/components/cloud-save/CloudImportConfirmDialog'
import { autoNetImportKey } from '@/models/scores/cloudImports'
import { LocalScoreRepository } from '@/models/scores/LocalScoreRepository'
import type {
  ImportProgress,
  ScoreRepository,
  ServerImportArgs,
  ServerImportKind,
} from '@/models/scores/ScoreRepository'
import { initI18n } from '@/setup/init-i18n'
import { importFallbackEntries, importFileEntries, importPath } from '../cloudImport'
import { importFromNETRecords } from '../importFromNETRecords'
import { netImportProgress } from '../netImportProgressStore'

vi.mock('@microsoft/fetch-event-source', () => ({ fetchEventSource: vi.fn() }))

const catalog = getSongCatalog(catalogSnapshot, VersionEnum.PRiSMPLUS)
const ENTRY = { sheetId: 'dsht_e5nsvt8k2a', achievementRate: 100.5 }

const job: ImportJobDTO = {
  id: 'dimp_1',
  saveId: 'dsav_one',
  source: 'maimai-net-jp',
  fetchedBy: 'server',
  trigger: 'auto',
  sourceAccountId: null,
  sourceAccountKind: null,
  status: 'succeeded',
  startedAt: '2026-11-03T00:00:00.000Z',
  fetchedAt: null,
  finishedAt: null,
  rawPayloadSha256: null,
  counts: {
    fetched: 10,
    inserted: 2,
    improved: 3,
    provenanceUpgraded: 0,
    unchanged: 5,
    keptUserEdit: 0,
    skippedDeleted: 0,
    skippedUnknownSheet: 0,
    rejected: 0,
  },
  errorCode: null,
}

/** A cloud repository whose calls are recorded */
function fakeCloud(serverImportsEnabled = true) {
  const serverImports: { kind: ServerImportKind; args: unknown }[] = []
  const repository = {
    kind: 'cloud',
    serverImportsEnabled,
    applyImport: vi.fn(async (entries: unknown[]) => ({ count: entries.length })),
    async *runServerImport<K extends ServerImportKind>(
      kind: K,
      args: ServerImportArgs[K],
    ): AsyncGenerator<ImportProgress> {
      serverImports.push({ kind, args })
      yield { stage: 'auth:in-progress', progress: 0.1 }
      yield { stage: 'done', progress: 1, job }
    },
  } as unknown as ScoreRepository & { applyImport: ReturnType<typeof vi.fn> }
  return { repository, serverImports }
}

beforeAll(async () => {
  initI18n()
  await i18n.changeLanguage('en')
})

afterEach(() => {
  localStorage.clear()
  netImportProgress.update(null)
})

describe('importPath', () => {
  it('keeps the local save local and picks the server or the §7.4 fallback for a cloud save', () => {
    expect(importPath(new LocalScoreRepository(null))).toBe('local')
    expect(importPath({ kind: 'cloud', serverImportsEnabled: true })).toBe('server')
    expect(importPath({ kind: 'cloud' })).toBe('server')
    expect(importPath({ kind: 'cloud', serverImportsEnabled: false })).toBe('client-fallback')
  })
})

describe('importFileEntries', () => {
  it('imports into the local save exactly as before, without asking', async () => {
    render(<CloudImportConfirmDialog />)
    const repository = LocalScoreRepository.inMemory([{ sheetId: 'dsht_5mk3yr8gme', achievementRate: 99 }])
    const applyImport = vi.spyOn(repository, 'applyImport')

    await importFileEntries(repository, [ENTRY], { source: 'aqua-dx', mode: 'replace' })

    expect(applyImport).toHaveBeenCalledWith([ENTRY], { source: 'aqua-dx', mode: 'replace' })
    expect(repository.entries()).toEqual([ENTRY])
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('asks a cloud save to merge by default', async () => {
    render(<CloudImportConfirmDialog />)
    const { repository } = fakeCloud()
    const pending = importFileEntries(repository, [ENTRY], { source: 'aqua-dx', mode: 'replace' })

    expect((await screen.findByRole('dialog')).textContent).toContain('Import 1 score into your cloud save?')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Import' })))

    await expect(pending).resolves.toEqual({ count: 1 })
    expect(repository.applyImport).toHaveBeenCalledWith([ENTRY], { source: 'aqua-dx', mode: 'merge' })
  })

  it('clears the cloud save first only after a second confirmation', async () => {
    render(<CloudImportConfirmDialog />)
    const { repository } = fakeCloud()
    const pending = importFileEntries(repository, [ENTRY, ENTRY], { source: 'mu-net', mode: 'replace' })

    await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Clear save first…' })))
    expect(screen.getByRole('dialog').textContent).toContain('Clear the save, then import?')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Clear and import' })))

    await pending
    expect(repository.applyImport).toHaveBeenCalledWith([ENTRY, ENTRY], { source: 'mu-net', mode: 'replace' })
  })

  it('imports nothing when the user cancels', async () => {
    render(<CloudImportConfirmDialog />)
    const { repository } = fakeCloud()
    const pending = importFileEntries(repository, [ENTRY], { source: 'dxrating-json', mode: 'replace' })
    await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Cancel' })))
    await expect(pending).resolves.toBeNull()
    expect(repository.applyImport).not.toHaveBeenCalled()
  })
})

describe('importFallbackEntries', () => {
  it('merges provider records (never replacing the save) for the §7.4 upload', async () => {
    const { repository } = fakeCloud(false)
    await importFallbackEntries(repository, [ENTRY], 'diving-fish')
    expect(repository.applyImport).toHaveBeenCalledWith([ENTRY], { source: 'diving-fish', mode: 'merge' })
  })
})

describe('importFromNETRecords on a cloud save', () => {
  it('runs the automatic import on the server with trigger auto and the 15-minute key, uploading nothing', async () => {
    localStorage.setItem('import-net-records', JSON.stringify({ region: 'jp', username: 'sega', password: 'pw' }))
    const { repository, serverImports } = fakeCloud()
    const key = autoNetImportKey('dsav_one')

    await importFromNETRecords(catalog, repository, 'replace', undefined, undefined, {
      trigger: 'auto',
      idempotencyKey: key,
    })

    expect(serverImports).toEqual([
      {
        kind: 'maimai-net',
        args: { region: 'jp', id: 'sega', password: 'pw', trigger: 'auto', idempotencyKey: key },
      },
    ])
    expect(repository.applyImport).not.toHaveBeenCalled()
    expect(netImportProgress.getSnapshot()?.status).toBe('success')
    expect(localStorage.getItem('net-import-last-success')).not.toBeNull()
  })

  it('runs a manual import with trigger user and a fresh key per action', async () => {
    const { repository, serverImports } = fakeCloud()
    await importFromNETRecords(catalog, repository, 'merge', undefined, {
      region: 'intl',
      username: 'a',
      password: 'b',
    })
    expect(serverImports[0]).toMatchObject({ kind: 'maimai-net', args: { region: 'intl', trigger: 'user' } })
    expect((serverImports[0]!.args as { idempotencyKey?: string }).idempotencyKey).toBeUndefined()
    expect(repository.applyImport).not.toHaveBeenCalled()
  })
})