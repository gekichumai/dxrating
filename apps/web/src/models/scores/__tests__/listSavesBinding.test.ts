import { CLOUD_SAVE_EXPECTED_USER_HEADER } from '@gekichumai/api-contract'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultActiveSaveDependencies } from '../ActiveSaveContext'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('defaultActiveSaveDependencies.listSaves', () => {
  it('names the deciding account, so the server refuses the list of an account signed in from another tab', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ saves: [] }))

    await defaultActiveSaveDependencies.listSaves('user-a')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [input, init] = fetchSpy.mock.calls[0]!
    expect(new Request(input, init).headers.get(CLOUD_SAVE_EXPECTED_USER_HEADER)).toBe('user-a')
  })
})