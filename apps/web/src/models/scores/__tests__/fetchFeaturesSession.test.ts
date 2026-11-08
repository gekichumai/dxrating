import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultActiveSaveDependencies } from '../ActiveSaveContext'
import { clearUserFeaturesCache, getUserFeatures } from '../userFeatures'

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), getFeatures: vi.fn() }))

vi.mock('../../../lib/auth-client', () => ({ authClient: { getSession: mocks.getSession, useSession: vi.fn() } }))
vi.mock('../../../lib/privateApi', () => ({ privateApiClient: { features: { get: mocks.getFeatures } } }))

const session = (id: string) => ({ data: { user: { id } } })
const FEATURES_B = { cloudSave: false, serverImports: false, optInAvailable: false }

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  }
}

afterEach(() => {
  vi.clearAllMocks()
  clearUserFeaturesCache(null)
})

describe('defaultActiveSaveDependencies.fetchFeatures', () => {
  it("never caches another account's features as this one's when the session changed while the client loaded", async () => {
    // A asks; by the time the request leaves, B is signed in
    mocks.getSession.mockResolvedValue(session('user-b'))
    mocks.getFeatures.mockResolvedValue(FEATURES_B)
    const storage = memoryStorage()

    await getUserFeatures('user-a', defaultActiveSaveDependencies.fetchFeatures, storage)

    expect(mocks.getFeatures).not.toHaveBeenCalled()
    expect(storage.length).toBe(0)
  })

  it('never caches an answer when the session changed while the request was in flight', async () => {
    mocks.getSession.mockResolvedValueOnce(session('user-a')).mockResolvedValue(session('user-b'))
    mocks.getFeatures.mockResolvedValue(FEATURES_B)
    const storage = memoryStorage()

    await getUserFeatures('user-a', defaultActiveSaveDependencies.fetchFeatures, storage)

    expect(storage.length).toBe(0)
  })

  it('caches the features of the account still signed in', async () => {
    mocks.getSession.mockResolvedValue(session('user-a'))
    mocks.getFeatures.mockResolvedValue({ cloudSave: true, serverImports: false, optInAvailable: false })
    const storage = memoryStorage()

    expect(await getUserFeatures('user-a', defaultActiveSaveDependencies.fetchFeatures, storage)).toMatchObject({
      cloudSave: true,
    })
    expect(storage.length).toBe(1)
  })
})