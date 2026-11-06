import type { ImportJobDTO, SaveDTO, UserFeatures } from '@gekichumai/api-contract'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import i18n from 'i18next'
import { type ReactNode, StrictMode, useState } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlayEntry } from '@/components/rating/RatingCalculatorAddEntryForm'
import { type ActiveSave, ActiveSaveContext } from '@/models/scores/ActiveSaveContext'
import { CloudMigrationContext } from '@/models/scores/CloudMigrationContext'
import { CLOUD_BACKUP_STORAGE_KEY, type CloudMigrationApi } from '@/models/scores/cloudMigration'
import {
  CLOUD_SAVE_CONSENT_VERSION,
  type CloudSaveActions,
  CloudSaveActionsContext,
  exportBodyToBlob,
  exportFileName,
} from '@/models/scores/cloudSaveActions'
import { initI18n } from '@/setup/init-i18n'
import { CloudMigrationDialog } from '../CloudMigrationDialog'
import { CloudMigrationPrompt } from '../CloudMigrationPrompt'
import { CloudSaveOptIn } from '../CloudSaveOptIn'
import { CloudSaveSection } from '../CloudSaveSection'
import { DownloadMyDataButton } from '../DownloadMyDataButton'
import { SyncStatusIndicator } from '../SyncStatusIndicator'
import { CloudSaveUiContext } from '@/models/scores/CloudSaveUiContext'
import { createDemoCloudSave } from '@/models/scores/demoCloudSave'
import { catalogSnapshot } from '@gekichumai/dxdata/snapshot'
import { VersionEnum } from '@gekichumai/dxdata'
import { getSongCatalog } from '@gekichumai/maimai-domain'

const posthog = vi.hoisted(() => ({ capture: vi.fn() }))
vi.mock('posthog-js', () => ({ default: posthog }))

const { toast } = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))
vi.mock('react-hot-toast', () => ({ default: toast }))

const SHEET_A = 'dsht_e5nsvt8k2a'
const SHEET_B = 'dsht_5mk3yr8gme'
const ENTRIES: PlayEntry[] = [
  {
    sheetId: SHEET_A,
    achievementRate: 100.5,
    comboFlag: 'ap',
    syncFlag: null,
    source: { provider: 'lxns' },
  },
  { sheetId: SHEET_B, achievementRate: 99 },
]

const FEATURES_ON: UserFeatures = {
  cloudSave: true,
  serverImports: true,
  optInAvailable: false,
}
const FEATURES_OPT_IN: UserFeatures = {
  cloudSave: false,
  serverImports: false,
  optInAvailable: true,
}

const job = (fields: Partial<ImportJobDTO> = {}): ImportJobDTO => ({
  id: 'dimp_1',
  saveId: 'dsav_1',
  source: 'legacy-local',
  fetchedBy: 'client',
  trigger: 'migration',
  sourceAccountId: null,
  sourceAccountKind: null,
  status: 'succeeded',
  startedAt: '2026-11-03T00:00:00.000Z',
  fetchedAt: null,
  finishedAt: '2026-11-03T00:00:01.000Z',
  rawPayloadSha256: null,
  counts: {
    fetched: 2,
    inserted: 2,
    improved: 0,
    provenanceUpgraded: 0,
    unchanged: 0,
    keptUserEdit: 0,
    skippedDeleted: 0,
    skippedUnknownSheet: 0,
    rejected: 0,
  },
  errorCode: null,
  ...fields,
})

const existingSave = (fields: Partial<SaveDTO> = {}): SaveDTO => ({
  id: 'dsav_other',
  name: 'Phone',
  region: 'jp',
  gameVersion: null,
  clientProfileKey: 'web-local',
  revision: 7,
  recordCount: 40,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-02T00:00:00.000Z',
  latestSnapshot: null,
  ...fields,
})

function migrationApi(saves: SaveDTO[] = []) {
  const api = {
    listSaves: vi.fn(async () => saves.map((save) => ({ ...save }))),
    createSave: vi.fn(async (input: { name: string; region: SaveDTO['region']; clientProfileKey: string }) => ({
      ...existingSave({ id: 'dsav_new', revision: 0, recordCount: 0 }),
      ...input,
    })),
    clientImport: vi.fn(async (input: { id: string }) => ({
      job: job({ saveId: input.id }),
      revision: 1,
    })),
    replace: vi.fn(async (input: { id: string; ifRevision: number }) => ({
      job: job({ saveId: input.id, trigger: 'user' }),
      revision: input.ifRevision + 1,
    })),
    getImportJob: vi.fn(async () => job()),
  } satisfies CloudMigrationApi
  return api
}

function activeSave(fields: Partial<ActiveSave> = {}): ActiveSave {
  return {
    kind: 'local',
    decided: true,
    saveId: null,
    cloudRepository: null,
    setActiveSaveId: vi.fn(),
    flushBeforeSignOut: async () => {},
    listSaves: async () => [],
    userId: 'user-1',
    features: FEATURES_ON,
    refreshFeatures: vi.fn(),
    ...fields,
  }
}

function renderDialog(api: CloudMigrationApi) {
  const onActivate = vi.fn()
  const onClose = vi.fn()
  render(
    <CloudMigrationDialog
      open
      onClose={onClose}
      entries={ENTRIES}
      region="intl"
      api={api}
      storage={window.localStorage}
      onActivate={onActivate}
    />,
  )
  return { onActivate, onClose }
}

/** Every captured event, by name */
const captured = () =>
  posthog.capture.mock.calls.map(([name, properties]) => ({
    name,
    properties,
  }))

/** Account, save, job and chart IDs, names and credentials never reach analytics */
function expectNoIdentifiers() {
  const payload = JSON.stringify(posthog.capture.mock.calls)
  expect(payload).not.toMatch(/user-1|dsav_|dimp_|dsht_|Phone|device|@/)
}

beforeAll(async () => {
  initI18n()
  await i18n.changeLanguage('en')
})

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  window.sessionStorage.clear()
  window.localStorage.setItem('rating-calculator-entries', JSON.stringify(ENTRIES))
})

afterEach(() => cleanup())

describe('CloudMigrationDialog: no cloud save yet', () => {
  it('backs the local save up only when asked, then makes the new save active', async () => {
    const api = migrationApi()
    const { onActivate } = renderDialog(api)

    const backUp = await screen.findByRole('button', {
      name: 'Back up to cloud',
    })
    expect(api.createSave).not.toHaveBeenCalled()
    // Previously imported records are not verified: the user is told how to get verified ones
    expect(screen.getByText(/saved as “not verified”/)).toBeTruthy()
    fireEvent.click(backUp)

    await screen.findByText('2 records are now in your cloud save.')
    expect(api.createSave).toHaveBeenCalledWith({
      name: 'My scores',
      region: 'intl',
      clientProfileKey: 'web-local',
    })
    expect(api.clientImport).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'dsav_new',
        source: 'legacy-local',
        trigger: 'migration',
        idempotencyKey: expect.stringMatching(/^migrate-[\w-]+-web-local-[0-9a-f]{16}-\w{8}$/),
      }),
    )
    expect(onActivate).toHaveBeenCalledWith('dsav_new')
    expect(window.localStorage.getItem(CLOUD_BACKUP_STORAGE_KEY)).not.toBeNull()

    expect(captured().map((event) => event.name)).toEqual([
      'cloudsave_migration_started',
      'cloudsave_migration_succeeded',
      'cloudsave_enabled',
    ])
    expect(captured()[0]!.properties).toEqual({
      mode: 'fresh',
      record_count: 2,
    })
    expect(captured()[1]!.properties).toEqual({
      mode: 'fresh',
      record_count: 2,
      duration_ms: expect.any(Number),
    })
    expect(captured()[2]!.properties).toEqual({ via: 'migration' })
    expectNoIdentifiers()
  })

  it('leaves the loading step under StrictMode (its effects run twice in dev)', async () => {
    const api = migrationApi()
    render(
      <StrictMode>
        <CloudMigrationDialog
          open
          onClose={vi.fn()}
          entries={ENTRIES}
          region="intl"
          api={api}
          storage={window.localStorage}
          onActivate={vi.fn()}
        />
      </StrictMode>,
    )
    expect(await screen.findByRole('button', { name: 'Back up to cloud' })).toBeTruthy()
  })

  it('offers a retry with the same key after a failure, and reports the failure by code only', async () => {
    const api = migrationApi()
    api.clientImport.mockRejectedValueOnce({
      status: 400,
      code: 'BAD_REQUEST',
      message: 'user-1 dsav_new',
    })
    const { onActivate } = renderDialog(api)

    fireEvent.click(await screen.findByRole('button', { name: 'Back up to cloud' }))
    await screen.findByText('Couldn’t back up')
    expect(onActivate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByText('Backed up')

    const keys = api.clientImport.mock.calls.map(
      ([input]) => (input as unknown as { idempotencyKey: string }).idempotencyKey,
    )
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBe(keys[1])
    expect(onActivate).toHaveBeenCalledWith('dsav_new')
    const failed = captured().find((event) => event.name === 'cloudsave_migration_failed')
    expect(failed?.properties).toEqual({
      mode: 'fresh',
      error_code: 'http_400',
      duration_ms: expect.any(Number),
    })
    expectNoIdentifiers()
  })
})

describe('CloudMigrationDialog: failures a retry cannot fix', () => {
  it('the save limit says what to do instead, with no retry', async () => {
    const api = migrationApi()
    api.createSave.mockRejectedValue({
      status: 409,
      code: 'CONFLICT',
      data: { reason: 'SAVE_LIMIT', limit: 10 },
    })
    const { onClose } = renderDialog(api)

    fireEvent.click(await screen.findByRole('button', { name: 'Back up to cloud' }))
    expect(await screen.findByText(/switch the game region to that save’s region/)).toBeTruthy()
    expect(screen.getByText('Nothing on this device was changed.')).toBeTruthy()
    expect(screen.queryByText(/try again at any time/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('nothing to upload: no retry either', async () => {
    const api = migrationApi()
    const onClose = vi.fn()
    render(
      <CloudMigrationDialog
        open
        onClose={onClose}
        entries={[{ sheetId: 'legacy__dxrt__x', achievementRate: 99 }]}
        region="intl"
        api={api}
        storage={window.localStorage}
        onActivate={vi.fn()}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Back up to cloud' }))
    await screen.findByText('Couldn’t back up')
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(api.clientImport).not.toHaveBeenCalled()
  })
})

describe('CloudMigrationDialog: a cloud save from another device', () => {
  it('counts the cloud records in words of their own', async () => {
    renderDialog(migrationApi([existingSave({ recordCount: 1 })]))
    expect(await screen.findByText('“Phone” (JP) has 1 record. This device has 2 records.')).toBeTruthy()
  })

  it('a replace over an empty cloud save says so instead of "all 0 records"', async () => {
    renderDialog(migrationApi([existingSave({ recordCount: 0 })]))
    fireEvent.click(await screen.findByRole('button', { name: 'Advanced' }))
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Replace cloud with this device',
      }),
    )
    expect(
      screen.getByText(
        /“Phone” has no records\. It will get the 2 records from this device, and your other devices will get the change too\./,
      ),
    ).toBeTruthy()
  })

  it('merges by default', async () => {
    const api = migrationApi([existingSave()])
    const { onActivate } = renderDialog(api)

    expect(await screen.findByText('You already have a cloud save')).toBeTruthy()
    expect(
      (
        screen.getByRole('radio', {
          name: /Merge \(keep the best of both\)/,
        }) as HTMLInputElement
      ).checked,
    ).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }))

    await screen.findByText('Backed up')
    expect(api.createSave).not.toHaveBeenCalled()
    expect(api.clientImport).toHaveBeenCalledWith(expect.objectContaining({ id: 'dsav_other', trigger: 'migration' }))
    expect(onActivate).toHaveBeenCalledWith('dsav_other')
    expect(captured()[0]!.properties).toEqual({
      mode: 'merge',
      record_count: 2,
    })
  })

  it('"use cloud only" uploads nothing and keeps a backup', async () => {
    const api = migrationApi([existingSave()])
    const { onActivate } = renderDialog(api)

    fireEvent.click(await screen.findByRole('radio', { name: /Use cloud only/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Use cloud save' }))

    await screen.findByText('This device now uses your cloud save.')
    // Nothing was uploaded: no "backed up" wording
    expect(screen.getByText('Now using your cloud save')).toBeTruthy()
    expect(screen.queryByText('Backed up')).toBeNull()
    expect(api.clientImport).not.toHaveBeenCalled()
    expect(api.replace).not.toHaveBeenCalled()
    expect(onActivate).toHaveBeenCalledWith('dsav_other')
    expect(window.localStorage.getItem(CLOUD_BACKUP_STORAGE_KEY)).not.toBeNull()
    expect(captured()[0]!.properties).toEqual({
      mode: 'cloud_only',
      record_count: 0,
    })
  })

  it('replaces only after a second confirmation, and asks again when the save changed (412)', async () => {
    const saves = [existingSave()]
    const api = migrationApi(saves)
    api.replace.mockRejectedValueOnce({
      status: 412,
      code: 'PRECONDITION_FAILED',
      data: { revision: 9 },
    })
    const { onActivate } = renderDialog(api)

    fireEvent.click(await screen.findByRole('button', { name: 'Advanced' }))
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Replace cloud with this device',
      }),
    )
    expect(api.replace).not.toHaveBeenCalled()
    expect(screen.getByText('Replace the cloud save?')).toBeTruthy()

    // Another device wrote meanwhile
    saves[0] = existingSave({ revision: 9, recordCount: 41 })
    fireEvent.click(screen.getByRole('button', { name: 'Replace cloud save' }))

    expect(await screen.findByText(/changed on another device/)).toBeTruthy()
    expect(api.replace).toHaveBeenCalledWith(expect.objectContaining({ ifRevision: 7 }))
    expect(onActivate).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }))
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Replace cloud with this device',
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Replace cloud save' }))

    await screen.findByText('Backed up')
    expect(api.replace).toHaveBeenLastCalledWith(
      expect.objectContaining({
        ifRevision: 9,
        idempotencyKey: expect.stringMatching(/-r9$/),
      }),
    )
    expect(onActivate).toHaveBeenCalledWith('dsav_other')
    expect(captured().filter((event) => event.name === 'cloudsave_migration_failed')[0]!.properties).toMatchObject({
      mode: 'replace',
      error_code: 'conflict',
    })
  })
})

describe('CloudMigrationPrompt', () => {
  it('renders nothing without an offer', () => {
    const { container } = render(<CloudMigrationPrompt />)
    expect(container.innerHTML).toBe('')
  })

  it('opens the dialog when asked, and "Not now" hides it for the session', () => {
    const open = vi.fn()
    const offer = { available: true, localCount: 2, open }
    const { unmount } = render(
      <CloudMigrationContext.Provider value={offer}>
        <CloudMigrationPrompt />
      </CloudMigrationContext.Provider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Back up to cloud' }))
    expect(open).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(screen.queryByRole('button', { name: 'Back up to cloud' })).toBeNull()
    unmount()

    render(
      <CloudMigrationContext.Provider value={offer}>
        <CloudMigrationPrompt />
      </CloudMigrationContext.Provider>,
    )
    expect(screen.queryByRole('button', { name: 'Back up to cloud' })).toBeNull()
  })
})

function actions(overrides: Partial<CloudSaveActions> = {}): CloudSaveActions {
  return {
    migration: migrationApi(),
    optIn: vi.fn(async () => FEATURES_ON),
    exportData: vi.fn(async () => ({
      blob: new Blob(['{}']),
      fileName: 'dxrating-cloud-export-x.json',
    })),
    ...overrides,
  }
}

function withAccount(save: ActiveSave, cloudActions: CloudSaveActions) {
  return ({ children }: { children: ReactNode }) => (
    <ActiveSaveContext.Provider value={save}>
      <CloudSaveActionsContext.Provider value={cloudActions}>{children}</CloudSaveActionsContext.Provider>
    </ActiveSaveContext.Provider>
  )
}

describe('CloudMigrationPrompt focus', () => {
  it('"Not now" moves the focus to the Import menu before the prompt goes', () => {
    const offer = { available: true, localCount: 2, open: vi.fn() }
    render(
      <CloudMigrationContext.Provider value={offer}>
        <div>
          <button type="button" data-cloud-migration-focus-return="">
            Import
          </button>
          <CloudMigrationPrompt />
        </div>
      </CloudMigrationContext.Provider>,
    )
    const close = screen.getByRole('button', { name: 'Not now' })
    close.focus()
    fireEvent.click(close)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Import' }))
  })
})

describe('CloudSaveOptIn', () => {
  it('shows the consent text, records the consent version, then reads the features again', async () => {
    const save = activeSave({ features: FEATURES_OPT_IN })
    const cloudActions = actions()
    render(<CloudSaveOptIn />, { wrapper: withAccount(save, cloudActions) })

    fireEvent.click(screen.getByRole('switch', { name: 'Cloud save (beta)' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Turn on cloud save (beta)?',
    })
    expect(cloudActions.optIn).not.toHaveBeenCalled()
    expect(within(dialog).getByText(/provider account IDs/)).toBeTruthy()
    expect(within(dialog).getByText(/rating snapshots your devices save/)).toBeTruthy()
    expect(within(dialog).getByText(/Kept until you delete them.*up to 100 rating snapshots/)).toBeTruthy()
    expect(within(dialog).getByText('Your SEGA ID password is never stored.')).toBeTruthy()
    // Nothing promises a way out that does not exist yet
    expect(within(dialog).getByText(/can’t turn the beta off in the app yet/)).toBeTruthy()
    expect(within(dialog).getByRole('link', { name: 'privacy policy' }).getAttribute('href')).toBe(
      '/privacy-policy#privacy-cloud',
    )

    fireEvent.click(within(dialog).getByRole('button', { name: 'Agree and turn on' }))

    await waitFor(() => expect(save.refreshFeatures).toHaveBeenCalledTimes(1))
    expect(cloudActions.optIn).toHaveBeenCalledWith(CLOUD_SAVE_CONSENT_VERSION)
    expect(CLOUD_SAVE_CONSENT_VERSION).toBe('2026-11-cloud-save-v2')
    expect(captured()).toEqual([{ name: 'cloudsave_enabled', properties: { via: 'opt_in' } }])
  })

  it('cancelling sends nothing', async () => {
    const save = activeSave({ features: FEATURES_OPT_IN })
    const cloudActions = actions()
    render(<CloudSaveOptIn />, { wrapper: withAccount(save, cloudActions) })

    fireEvent.click(screen.getByRole('switch', { name: 'Cloud save (beta)' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))

    expect(cloudActions.optIn).not.toHaveBeenCalled()
    expect(save.refreshFeatures).not.toHaveBeenCalled()
  })

  it('renders nothing unless the server offers the opt-in', () => {
    for (const features of [null, FEATURES_ON]) {
      const { container, unmount } = render(<CloudSaveOptIn />, {
        wrapper: withAccount(activeSave({ features }), actions()),
      })
      expect(container.innerHTML).toBe('')
      unmount()
    }
  })
})

describe('"Download my data"', () => {
  it('downloads GET /me/export as a file', async () => {
    const blob = new Blob(['{"format":"dxrating-cloud-save-export"}'], {
      type: 'application/json',
    })
    const cloudActions = actions({
      exportData: vi.fn(async () => ({ blob, fileName: 'export.json' })),
    })
    const createObjectURL = vi.fn(() => 'blob:export')
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() })
    const clicked: HTMLAnchorElement[] = []
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this)
    })
    try {
      render(<DownloadMyDataButton />, {
        wrapper: withAccount(activeSave(), cloudActions),
      })
      fireEvent.click(screen.getByRole('button', { name: 'Download my data' }))

      await waitFor(() => expect(clicked).toHaveLength(1))
      expect(createObjectURL).toHaveBeenCalledWith(blob)
      expect(clicked[0]!.download).toBe('export.json')
      expect(clicked[0]!.href).toBe('blob:export')
      expect(toast.success).toHaveBeenCalled()
    } finally {
      click.mockRestore()
    }
  })

  it('keeps the focus while preparing, says so politely, and ignores a second press', async () => {
    let finish!: (value: { blob: Blob; fileName: string }) => void
    const exportData = vi.fn(() => new Promise<{ blob: Blob; fileName: string }>((resolve) => (finish = resolve)))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:x'),
      revokeObjectURL: vi.fn(),
    })
    try {
      render(<DownloadMyDataButton />, {
        wrapper: withAccount(activeSave(), actions({ exportData })),
      })
      const button = screen.getByRole('button', { name: 'Download my data' })
      button.focus()
      fireEvent.click(button)

      const busy = await screen.findByRole('button', { name: 'Preparing…' })
      expect(busy).toBe(button)
      expect(busy.hasAttribute('disabled')).toBe(false)
      expect(busy.getAttribute('aria-disabled')).toBe('true')
      expect(document.activeElement).toBe(busy)
      expect(screen.getByRole('status').textContent).toBe('Preparing…')
      fireEvent.click(busy)
      expect(exportData).toHaveBeenCalledTimes(1)

      await act(async () => finish({ blob: new Blob(['{}']), fileName: 'x.json' }))
      expect(await screen.findByRole('button', { name: 'Download my data' })).toBe(button)
      expect(screen.getByRole('status').textContent).toBe('')
    } finally {
      click.mockRestore()
    }
  })

  it('says when the daily limit is reached', async () => {
    const cloudActions = actions({
      exportData: vi.fn(async () => {
        throw {
          status: 429,
          code: 'TOO_MANY_REQUESTS',
          data: { retryAfterSeconds: 60 },
        }
      }),
    })
    render(<DownloadMyDataButton />, {
      wrapper: withAccount(activeSave(), cloudActions),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Download my data' }))
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/several times today/), expect.anything()),
    )
  })

  it('turns the oRPC answer into a file', async () => {
    expect(
      exportFileName({
        'content-disposition': 'attachment; filename="dxrating-cloud-export-1.json"',
      }),
    ).toBe('dxrating-cloud-export-1.json')
    expect(exportFileName({}, new Date('2026-11-03T00:00:00.000Z'))).toBe(
      'dxrating-cloud-export-2026-11-03T00-00-00-000Z.json',
    )
    // A parsed JSON body is written back as JSON; a blob is used as it is
    const parsed = exportBodyToBlob({
      format: 'dxrating-cloud-save-export',
      saves: [],
    })
    expect(JSON.parse(await parsed.text())).toEqual({
      format: 'dxrating-cloud-save-export',
      saves: [],
    })
    const blob = new Blob(['x'])
    expect(exportBodyToBlob(blob)).toBe(blob)
  })
})

describe('CloudSaveSection', () => {
  it('with cloud save on and the local save active: back up to cloud, and download my data', () => {
    const open = vi.fn()
    render(
      <CloudMigrationContext.Provider value={{ available: true, localCount: 2, open }}>
        <CloudSaveSection />
      </CloudMigrationContext.Provider>,
      { wrapper: withAccount(activeSave(), actions()) },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Back up to cloud' }))
    expect(open).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Download my data' })).toBeTruthy()
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('with the opt-in offered: only the opt-in, no export of data that is not there', () => {
    render(<CloudSaveSection />, {
      wrapper: withAccount(activeSave({ features: FEATURES_OPT_IN }), actions()),
    })
    expect(screen.getByRole('switch', { name: 'Cloud save (beta)' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Download my data' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Back up to cloud' })).toBeNull()
  })

  it('after the opt-in, the focus goes to the section heading, not the page, as the switch goes', async () => {
    const cloudActions = actions()
    const Account = () => {
      const [features, setFeatures] = useState<UserFeatures>(FEATURES_OPT_IN)
      const save = activeSave({ features, refreshFeatures: () => setFeatures(FEATURES_ON) })
      return (
        <ActiveSaveContext.Provider value={save}>
          <CloudSaveActionsContext.Provider value={cloudActions}>
            <div>
              <CloudSaveSection />
            </div>
          </CloudSaveActionsContext.Provider>
        </ActiveSaveContext.Provider>
      )
    }
    render(<Account />)
    const toggle = screen.getByRole('switch', { name: 'Cloud save (beta)' })
    toggle.focus()
    fireEvent.click(toggle)
    const consent = await screen.findByRole('dialog', { name: 'Turn on cloud save (beta)?' })
    fireEvent.click(within(consent).getByRole('button', { name: 'Agree and turn on' }))

    await waitFor(() => expect(screen.queryByRole('switch')).toBeNull())
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Cloud save' })),
    )
    expect(screen.getByRole('button', { name: 'Download my data' })).toBeTruthy()
  })

  it('with cloud save off, or signed out: nothing', () => {
    for (const save of [
      activeSave({
        features: {
          cloudSave: false,
          serverImports: false,
          optInAvailable: false,
        },
      }),
      activeSave({ userId: null, features: null }),
    ]) {
      const { container, unmount } = render(<CloudSaveSection />, {
        wrapper: withAccount(save, actions()),
      })
      expect(container.innerHTML).toBe('')
      unmount()
    }
  })
})

describe('sync_conflict_shown', () => {
  it('is sent once per sync issue the header shows, with its kind only', () => {
    const { ui, repository } = createDemoCloudSave(getSongCatalog(catalogSnapshot, VersionEnum.PRiSMPLUS))
    const issues = repository.status.issues
    expect(issues.length).toBeGreaterThan(0)
    const view = render(
      <CloudSaveUiContext.Provider value={ui}>
        <SyncStatusIndicator />
      </CloudSaveUiContext.Provider>,
    )
    view.rerender(
      <CloudSaveUiContext.Provider value={ui}>
        <SyncStatusIndicator />
      </CloudSaveUiContext.Provider>,
    )

    const shown = captured().filter((event) => event.name === 'sync_conflict_shown')
    expect(shown.map((event) => event.properties)).toEqual(issues.map((issue) => ({ kind: issue.kind })))
    expectNoIdentifiers()
  })
})

// Lets pending effects settle in the tests above that unmount early
afterEach(async () => {
  await act(async () => {})
})