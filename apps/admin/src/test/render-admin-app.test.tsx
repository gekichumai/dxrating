import { describe, expect, it } from 'vitest'
import { renderAdminApp } from './render-admin-app'

describe('administrator application test harness', () => {
  it('creates isolated router, data, compatibility, and deterministic Query Client contexts', async () => {
    const firstAuth = { status: 'unauthenticated' } as const
    const secondAuth = { status: 'forbidden' } as const
    const first = await renderAdminApp('/', { auth: firstAuth })
    first.queryClient.setQueryData(['admin', 'private-test-value'], { value: 1 })
    first.unmount()

    const second = await renderAdminApp('/', { auth: secondAuth })

    expect(second.router).not.toBe(first.router)
    expect(second.queryClient).not.toBe(first.queryClient)
    expect(second.data).not.toBe(first.data)
    expect(second.compatibility).not.toBe(first.compatibility)
    expect(first.auth).toBe(firstAuth)
    expect(second.auth).toBe(secondAuth)
    expect(second.queryClient.getQueryData(['admin', 'private-test-value'])).toBeUndefined()
    expect(second.queryClient.getDefaultOptions().queries).toMatchObject({
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
      retry: false,
    })
  })
})