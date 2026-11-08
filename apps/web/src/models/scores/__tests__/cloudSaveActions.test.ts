import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultCloudSaveActions } from '../cloudSaveActions'
import { MigrationCancelledError, runCloudMigration } from '../cloudMigration'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  createSave: vi.fn(),
  clientImport: vi.fn(),
  optInCloudSave: vi.fn(),
  boundTo: [] as string[],
}))

vi.mock('../../../lib/auth-client', () => ({ authClient: { getSession: mocks.getSession } }))
vi.mock('../../../lib/privateApi', () => {
  const client = {
    features: { optInCloudSave: mocks.optInCloudSave },
    cloudSave: {
      saves: { create: mocks.createSave },
      imports: { client: mocks.clientImport },
    },
  }
  return { privateApiClient: client, privateApiClientFor: (userId: string) => (mocks.boundTo.push(userId), client) }
})

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
  mocks.boundTo.length = 0
})

const accountMismatch = () =>
  Object.assign(new Error('The session belongs to another account'), {
    code: 'CONFLICT',
    status: 409,
    data: { reason: 'ACCOUNT_MISMATCH' },
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

  it('sends no opt-in when the guard stops it once the private client loaded', async () => {
    const controller = new AbortController()
    const beforeSend = vi.fn(async () => {
      throw new MigrationCancelledError()
    })
    await expect(defaultCloudSaveActions.optIn('v', { signal: controller.signal, beforeSend })).rejects.toBeInstanceOf(
      MigrationCancelledError,
    )
    expect(beforeSend).toHaveBeenCalledTimes(1)
    expect(mocks.optInCloudSave).not.toHaveBeenCalled()
  })

  it('sends each write through the client bound to the migration account', async () => {
    mocks.getSession.mockResolvedValue(session('user-a'))
    mocks.createSave.mockRejectedValue(Object.assign(new Error('nope'), { status: 400 }))
    await expect(migrate()).rejects.toThrow('nope')
    expect(mocks.boundTo).toEqual(['user-a'])
  })

  it('stops the migration when the server refuses a write for another account (409 ACCOUNT_MISMATCH)', async () => {
    // The session switched after the last check in the browser: only the server can see it
    mocks.getSession.mockResolvedValue(session('user-a'))
    mocks.createSave.mockRejectedValue(accountMismatch())
    await expect(migrate()).rejects.toBeInstanceOf(MigrationCancelledError)
    expect(mocks.createSave).toHaveBeenCalledTimes(1)
  })

  it('binds the opt-in to the account that agreed, and reads its refusal as a cancellation', async () => {
    mocks.optInCloudSave.mockRejectedValue(accountMismatch())
    const beforeSend = vi.fn(async () => {})
    await expect(defaultCloudSaveActions.optIn('v', { beforeSend, expectedUserId: 'user-a' })).rejects.toBeInstanceOf(
      MigrationCancelledError,
    )
    expect(mocks.boundTo).toEqual(['user-a'])
  })
})