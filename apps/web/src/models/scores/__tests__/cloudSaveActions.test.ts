import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultCloudSaveActions } from '../cloudSaveActions'
import { MigrationCancelledError, runCloudMigration } from '../cloudMigration'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  createSave: vi.fn(),
  clientImport: vi.fn(),
}))

vi.mock('../../../lib/auth-client', () => ({ authClient: { getSession: mocks.getSession } }))
vi.mock('../../../lib/privateApi', () => ({
  privateApiClient: {
    cloudSave: {
      saves: { create: mocks.createSave },
      imports: { client: mocks.clientImport },
    },
  },
}))

const session = (id: string) => ({ data: { user: { id } } })

const migrate = (signal?: AbortSignal) =>
  runCloudMigration({
    api: defaultCloudSaveActions.migration,
    entries: [{ sheetId: 'dsht_e5nsvt8k2a', achievementRate: 99 }],
    mode: 'fresh',
    region: 'jp',
    name: 'Main',
    deviceId: 'device',
    storage: null,
    userId: 'user-a',
    signal,
    migrateLegacyEntries: async (entries) => entries,
  })

afterEach(() => {
  vi.clearAllMocks()
})

describe('defaultCloudSaveActions.migration', () => {
  it('sends no write once the session became another account while the private client loaded', async () => {
    // The check before the write sees A; by the time the client is ready to send, B has signed in
    mocks.getSession.mockResolvedValueOnce(session('user-a')).mockResolvedValue(session('user-b'))

    await expect(migrate()).rejects.toBeInstanceOf(MigrationCancelledError)
    expect(mocks.createSave).not.toHaveBeenCalled()
  })

  it('sends no write once the migration was cancelled while the private client loaded', async () => {
    const controller = new AbortController()
    mocks.getSession.mockResolvedValueOnce(session('user-a')).mockImplementation(async () => {
      controller.abort()
      return session('user-a')
    })

    await expect(migrate(controller.signal)).rejects.toBeInstanceOf(MigrationCancelledError)
    expect(mocks.createSave).not.toHaveBeenCalled()
  })

  it('gives the migration signal to the request it sends', async () => {
    const controller = new AbortController()
    mocks.getSession.mockResolvedValue(session('user-a'))
    mocks.createSave.mockRejectedValue(Object.assign(new Error('nope'), { status: 400 }))

    await expect(migrate(controller.signal)).rejects.toThrow('nope')
    expect(mocks.createSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Main' }), {
      signal: controller.signal,
    })
  })
})