import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initI18n } from '@/setup/init-i18n'
import { LocalScoreRepository } from '@/models/scores/LocalScoreRepository'
import { ScoreRepositoryContext } from '@/models/scores/useScoreRepository'
import { CloudImportConfirmDialog } from '@/components/cloud-save/CloudImportConfirmDialog'
import { entriesToImportRecords, NothingToImportError } from '@/models/scores/cloudImports'
import { ExportSavePickerDialog } from '@/components/cloud-save/ExportSavePickerDialog'
import type { PlayEntry } from '@/components/rating/RatingCalculatorAddEntryForm'
import type { ScoreRepository } from '@/models/scores/ScoreRepository'
import { ImportFromJSONButtonListItem } from '../ImportFromJSONButtonListItem'

const { toast, toastError, toastSuccess } = vi.hoisted(() => ({
  toast: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({
  default: Object.assign(toast, { error: toastError, success: toastSuccess }),
}))

vi.mock('web-haptics/react', () => ({
  useWebHaptics: () => ({ trigger: vi.fn() }),
}))

const SAVED = [{ sheetId: 'dsht_5mk3yr8gme', achievementRate: 99.1 }]

/** Opens the menu item's file picker and picks a file with `content` */
async function importFile(content: string) {
  const createElement = document.createElement.bind(document)
  let input: HTMLInputElement | undefined
  const spy = vi
    .spyOn(document, 'createElement')
    .mockImplementation((tagName: string, options?: ElementCreationOptions) => {
      const element = createElement(tagName, options)
      if (tagName === 'input') {
        input = element as HTMLInputElement
        input.click = () => {}
      }
      return element
    })
  fireEvent.click(screen.getByRole('menuitem'))
  spy.mockRestore()

  const file = new File([content], 'dxrating.export.json', { type: 'application/json' })
  Object.defineProperty(input!, 'files', { value: [file] })
  input!.onchange?.({ target: input } as unknown as Event)
}

describe('ImportFromJSONButtonListItem', () => {
  let repository: LocalScoreRepository

  beforeAll(() => {
    initI18n()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    window.localStorage.setItem('rating-calculator-entries', JSON.stringify(SAVED))
    repository = new LocalScoreRepository(window.localStorage)
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ScoreRepositoryContext.Provider value={repository}>{children}</ScoreRepositoryContext.Provider>
    )
    render(<ImportFromJSONButtonListItem onClose={() => {}} />, { wrapper })
  })

  it('replaces the save with a valid rating file', async () => {
    const entries = [{ sheetId: 'dsht_e5nsvt8k2a', achievementRate: 100.5, comboFlag: 'ap', dxScore: 2000 }]
    await importFile(JSON.stringify(entries))

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Imported 1 records'))
    expect(repository.entries()).toEqual(entries)
    expect(window.localStorage.getItem('rating-calculator-entries')).toBe(JSON.stringify(entries))
  })

  it('imports an "all records" export of a save with entries of every kind back as it was', async () => {
    // What the "all records" export writes: the saved entries as they are
    const saved = [
      { sheetId: 'dsht_5mk3yr8gme', achievementRate: 99.1 },
      {
        sheetId: 'dsht_e5nsvt8k2a',
        identity: { songId: 'dsng_kkx38yfx4t', type: 'dx', difficulty: 'master' },
        achievementRate: 100.5432,
        comboFlag: 'ap',
        syncFlag: 'fsd',
        source: { provider: 'maimai-net', providerSongName: '君の知らない物語' },
      },
      {
        sheetId: 'dsht_mpd82wyms9',
        achievementRate: 97.12345,
        comboFlag: null,
        syncFlag: null,
        dxScore: 1234,
        source: { provider: 'diving-fish', providerId: 11451, providerSongName: 'Link', best50Bucket: 'b35' },
        providerConfig: { divingFish: { ratingEligibility: 'b35' } },
      },
      {
        sheetId: '君の知らない物語__dxrt__std__dxrt__expert',
        identity: { songId: '君の知らない物語', type: 'std', difficulty: 'expert' },
        achievementRate: 98,
      },
      { sheetId: 'retired song__dxrt__dx__dxrt__master', achievementRate: 97 },
      // typed into earlier add forms: out of range, and an empty field (`NaN`, written as `null`)
      { sheetId: 'dsht_23456789ab', achievementRate: 101.5 },
      { sheetId: 'dsht_3456789abc', achievementRate: Number.NaN },
    ]
    const exported = JSON.stringify(saved)
    repository.clear()

    await importFile(exported)

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Imported 7 records'))
    expect(toastError).not.toHaveBeenCalled()
    expect(JSON.parse(window.localStorage.getItem('rating-calculator-entries')!)).toEqual(JSON.parse(exported))
  })

  it('tells the visitor a file is not a rating file and keeps the save', async () => {
    await importFile(JSON.stringify({ userMusicDetailList: [] }))

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("This file isn't a DXRating rating export. Nothing was imported."),
    )
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(repository.entries()).toEqual(SAVED)
    expect(window.localStorage.getItem('rating-calculator-entries')).toBe(JSON.stringify(SAVED))
  })

  it('reports a file that is not JSON as before, keeping the save', async () => {
    await importFile('not json')

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1))
    expect(toastError.mock.calls[0]![0]).toMatch(/^Failed to import: /)
    expect(repository.entries()).toEqual(SAVED)
  })

  describe('on a cloud save', () => {
    function renderCloud(applyImport: ScoreRepository['applyImport']) {
      cleanup()
      const cloud = { kind: 'cloud', serverImportsEnabled: true, applyImport: vi.fn(applyImport) }
      render(
        <ScoreRepositoryContext.Provider value={cloud as never}>
          <ImportFromJSONButtonListItem onClose={() => {}} />
          <CloudImportConfirmDialog />
        </ScoreRepositoryContext.Provider>,
      )
      return cloud
    }

    const entries = [
      { sheetId: 'dsht_e5nsvt8k2a', achievementRate: 100.5 },
      { sheetId: 'dsht_5mk3yr8gme', achievementRate: 99 },
      { sheetId: 'dsht_23456789ab', achievementRate: 101.5 },
    ]

    it('counts what the server took and says how many were left out', async () => {
      renderCloud(async () => ({ count: 2, skipped: 1, rejected: 1 }))
      await importFile(JSON.stringify(entries))
      await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Import' })))

      await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Imported 2 records'))
      expect(toast).toHaveBeenCalledWith("1 record didn't match a chart and wasn't imported.")
      expect(toast).toHaveBeenCalledWith(
        "1 record has a value that can't be saved, such as a DX score out of range, and wasn't imported.",
      )
    })

    it("shows an error and never clears the save when no record passes the server's schema", async () => {
      const cloud = renderCloud(async () => ({ count: 1 }))
      await importFile(JSON.stringify([{ sheetId: 'dsht_e5nsvt8k2a', achievementRate: 100.5, dxScore: 100001 }]))

      await waitFor(() =>
        expect(toastError).toHaveBeenCalledWith(
          "None of these records can be imported: they match no chart or have values out of range. Your cloud save wasn't changed.",
        ),
      )
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(cloud.applyImport).not.toHaveBeenCalled()
      expect(toastSuccess).not.toHaveBeenCalled()
    })

    it('says nothing was imported, and the save kept, when no record matches a chart', async () => {
      renderCloud(async () => {
        throw new NothingToImportError(3)
      })
      await importFile(JSON.stringify(entries))
      await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Import' })))

      await waitFor(() =>
        expect(toastError).toHaveBeenCalledWith(
          "None of these records can be imported: they match no chart or have values out of range. Your cloud save wasn't changed.",
        ),
      )
      expect(toastSuccess).not.toHaveBeenCalled()
    })
  })

  describe('a "Download my data" file (GET /me/export)', () => {
    const provenance = (source: string, fields: Record<string, unknown> = {}) => ({
      source,
      claimedSource: null,
      fetchedBy: 'server',
      verification: 'verified',
      entryMethod: 'import',
      sourceAccountId: '123456789012345',
      importJobId: 'dimp_1',
      rawPayloadSha256: 'a'.repeat(64),
      fetchedAt: '2026-11-02T00:00:00.000Z',
      editedFromJobId: null,
      ...fields,
    })
    const record = (sheetId: string, achievement: number, source: string, fields: Record<string, unknown> = {}) => ({
      sheetId,
      achievement,
      achievementRate: achievement / 10000,
      comboFlag: null,
      syncFlag: null,
      dxScore: null,
      best50Bucket: null,
      providerRecordId: null,
      provenance: provenance(source, fields),
      revision: 3,
      valueChangedAt: '2026-11-02T00:00:00.000Z',
      clientEditedAt: null,
      deletedAt: null,
      dxrating: { source },
    })
    const save = (id: string, name: string, records: unknown[], deletedAt: string | null = null) => ({
      id,
      name,
      region: 'jp',
      gameVersion: null,
      clientProfileKey: null,
      revision: 3,
      recordCount: records.length,
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-02T00:00:00.000Z',
      latestSnapshot: null,
      deletedAt,
      records,
      tombstones: [],
      importJobs: [],
      events: [],
      snapshots: [],
    })
    const exportFile = (saves: unknown[]) =>
      JSON.stringify({ format: 'dxrating-cloud-save-export', version: 1, exportedAt: '2026-11-03T00:00:00Z', saves })

    const MAIN = save('dsav_main', 'Main', [
      record('dsht_e5nsvt8k2a', 1005432, 'maimai-net-jp'),
      record('dsht_5mk3yr8gme', 990000, 'manual', { verification: 'client_reported', fetchedBy: 'client' }),
      record('dsht_mpd82wyms9', 980000, 'dxrating-json', { claimedSource: 'lxns', verification: 'client_reported' }),
    ])

    it('imports into the local save, the provenance kept only as the claimed provider', async () => {
      await importFile(exportFile([MAIN, save('dsav_gone', 'Deleted', [record('dsht_23456789ab', 1e6, 'lxns')], 'x')]))

      await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Imported 3 records'))
      expect(repository.entries()).toEqual([
        {
          sheetId: 'dsht_e5nsvt8k2a',
          achievementRate: 100.5432,
          comboFlag: null,
          syncFlag: null,
          source: { provider: 'maimai-net' },
        },
        { sheetId: 'dsht_5mk3yr8gme', achievementRate: 99, comboFlag: null, syncFlag: null },
        {
          sheetId: 'dsht_mpd82wyms9',
          achievementRate: 98,
          comboFlag: null,
          syncFlag: null,
          source: { provider: 'lxns' },
        },
      ])
      expect(toast).toHaveBeenCalledWith(expect.stringMatching(/not verified/), expect.anything())
    })

    it('uploads to a cloud save as a DXRating JSON file: client_reported, the provider only claimed', async () => {
      cleanup()
      const applyImport = vi.fn(async (entries: PlayEntry[]) => ({ count: entries.length }))
      const cloud = { kind: 'cloud', serverImportsEnabled: true, applyImport }
      render(
        <ScoreRepositoryContext.Provider value={cloud as never}>
          <ImportFromJSONButtonListItem onClose={() => {}} />
          <CloudImportConfirmDialog />
          <ExportSavePickerDialog />
        </ScoreRepositoryContext.Provider>,
      )

      await importFile(exportFile([MAIN, save('dsav_intl', 'Intl', [record('dsht_23456789ab', 1000000, 'lxns')])]))
      // Two saves: the user picks one
      fireEvent.click(await screen.findByRole('button', { name: /^Main/ }))
      await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Import' })))

      await waitFor(() => expect(applyImport).toHaveBeenCalledTimes(1))
      const [entries, meta] = applyImport.mock.calls[0]! as unknown as [PlayEntry[], { source: string }]
      expect(meta.source).toBe('dxrating-json')
      const { records } = entriesToImportRecords(entries, { source: 'dxrating-json', claimedSource: null })
      expect(records.map((item) => [item.sheetId, item.claimedSource])).toEqual([
        ['dsht_e5nsvt8k2a', 'maimai-net'],
        ['dsht_5mk3yr8gme', null],
        ['dsht_mpd82wyms9', 'lxns'],
      ])
      // Nothing of the file's verification, job or account goes to the server
      expect(JSON.stringify(records)).not.toMatch(/verified|dimp_|123456789012345|fetchedBy/)
    })

    it('cancelling the save picker imports nothing and says nothing', async () => {
      cleanup()
      const entriesBefore = repository.entries()
      render(
        <ScoreRepositoryContext.Provider value={repository}>
          <ImportFromJSONButtonListItem onClose={() => {}} />
          <ExportSavePickerDialog />
        </ScoreRepositoryContext.Provider>,
      )

      await importFile(exportFile([MAIN, save('dsav_intl', 'Intl', [record('dsht_23456789ab', 1000000, 'lxns')])]))
      expect(await screen.findByRole('button', { name: /^Main/ })).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      await waitFor(() => expect(screen.queryByRole('button', { name: /^Main/ })).toBeNull())
      // Let anything the cancel would have started settle
      await act(async () => {})
      expect(repository.entries()).toEqual(entriesBefore)
      expect(window.localStorage.getItem('rating-calculator-entries')).toBe(JSON.stringify(SAVED))
      expect(toastSuccess).not.toHaveBeenCalled()
      expect(toastError).not.toHaveBeenCalled()
      expect(toast).not.toHaveBeenCalled()
    })
  })
})