import { afterEach, describe, expect, it, vi } from 'vitest'

const changes = {
  records: [],
  nextSince: 5,
  hasMore: false,
  revision: 5,
  resetRequired: false,
  checksum: { count: 0, sumAchievement: 0 },
}

describe('privateApiClient', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('calls the private routes on the backend with the session cookie', async () => {
    vi.stubEnv('VITE_BACKEND_URL', 'https://api.example.test')
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      const body = url.pathname.endsWith('/me/features')
        ? { cloudSave: false, serverImports: false, optInAvailable: false }
        : url.pathname.endsWith('/mutations')
          ? { revision: 6, results: [] }
          : changes
      return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    const { privateApiClient } = await import('../privateApi')

    await expect(privateApiClient.features.get()).resolves.toEqual({
      cloudSave: false,
      serverImports: false,
      optInAvailable: false,
    })
    await expect(
      privateApiClient.cloudSave.records.changes({ id: 'dsav_main', since: 5, limit: 1000 }),
    ).resolves.toEqual(changes)
    await privateApiClient.cloudSave.records.mutate({
      id: 'dsav_main',
      mutations: [{ mutationId: '0190a6f0-0000-7000-8000-000000000000', op: 'delete', sheetId: 'dsht_e5nsvt8k2a' }],
    })

    const calls = fetchMock.mock.calls.map(([input, init]) => ({
      method: init?.method ?? (input instanceof Request ? input.method : 'GET'),
      url: input instanceof Request ? input.url : String(input),
      credentials: init?.credentials,
    }))
    expect(calls).toEqual([
      { method: 'GET', url: 'https://api.example.test/api/v1/me/features', credentials: 'include' },
      {
        method: 'GET',
        url: 'https://api.example.test/api/v1/saves/dsav_main/changes?since=5&limit=1000',
        credentials: 'include',
      },
      { method: 'POST', url: 'https://api.example.test/api/v1/saves/dsav_main/mutations', credentials: 'include' },
    ])
  })

  it('surfaces the error code, which the sync loop reads', async () => {
    vi.stubEnv('VITE_BACKEND_URL', 'https://api.example.test')
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ defined: false, code: 'NOT_FOUND', status: 404, message: 'Not found' }), {
            status: 404,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    )
    const { privateApiClient } = await import('../privateApi')

    await expect(privateApiClient.features.get()).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('privateApiClient errors in the sync loop', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('reads a 429 with its retryAfterSeconds as a backoff', async () => {
    vi.stubEnv('VITE_BACKEND_URL', 'https://api.example.test')
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              defined: true,
              code: 'TOO_MANY_REQUESTS',
              status: 429,
              message: 'Too many requests',
              data: { retryAfterSeconds: 12 },
            }),
            { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '12' } },
          ),
      ),
    )
    const [{ privateApiClient }, { classifySyncError }] = await Promise.all([
      import('../privateApi'),
      import('../../models/scores/CloudScoreRepository'),
    ])

    const error = await privateApiClient.cloudSave.records.changes({ id: 'dsav_main', since: 0, limit: 1000 }).then(
      () => null,
      (rejection: unknown) => rejection,
    )
    expect(classifySyncError(error)).toEqual({ kind: 'rate-limited', retryAfterMs: 12_000 })
  })
})