import { ADMIN_CONTRACT_COMPATIBILITY_ID, ADMIN_CONTRACT_HEADER } from '@gekichumai/admin-contract'
import { ORPCError } from '@orpc/client'
import { describe, expect, it, vi } from 'vitest'
import {
  createAdminClientIncompatibleError,
  createAdminCompatibilityController,
  getAdminCompatibilityReloadMarkerKey,
  isAdminClientIncompatibleError,
  readAdminClientIncompatibleResponse,
  rejectAdminClientIncompatibleResponse,
  type AdminClientIncompatibleData,
  type AdminCompatibilityStorage,
} from './compatibility'

const mismatch: AdminClientIncompatibleData = {
  requestId: '18d7118c-ec70-4603-9176-cffea8a6cd8f',
  expected: `sha256:${'f'.repeat(64)}`,
  received: ADMIN_CONTRACT_COMPATIBILITY_ID,
}

const mismatchResponse = (data: unknown = mismatch, overrides: Record<string, unknown> = {}) =>
  Response.json(
    {
      defined: true,
      code: 'ADMIN_CLIENT_INCOMPATIBLE',
      status: 409,
      message: 'safe compatibility message',
      data,
      ...overrides,
    },
    { status: 409 },
  )

const createMemoryStorage = (entries: Readonly<Record<string, string>> = {}) => {
  const values = new Map(Object.entries(entries))
  const storage: AdminCompatibilityStorage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    removeItem: vi.fn((key: string) => {
      values.delete(key)
    }),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value)
    }),
  }
  return { storage, values }
}

describe('raw administrator compatibility response', () => {
  it('recognizes only the typed mismatch envelope and leaves the original body readable', async () => {
    const response = mismatchResponse()

    await expect(readAdminClientIncompatibleResponse(response)).resolves.toEqual(mismatch)
    await expect(response.json()).resolves.toMatchObject({
      code: 'ADMIN_CLIENT_INCOMPATIBLE',
      data: mismatch,
    })
  })

  it.each([
    ['wrong HTTP status', Response.json({ code: 'ADMIN_CLIENT_INCOMPATIBLE' }, { status: 500 })],
    ['invalid JSON', new Response('not-json', { status: 409 })],
    ['undefined error', mismatchResponse(mismatch, { defined: false })],
    ['different code', mismatchResponse(mismatch, { code: 'CONFLICT' })],
    ['different body status', mismatchResponse(mismatch, { status: 400 })],
    ['unsafe request identifier', mismatchResponse({ ...mismatch, requestId: 'credential=do-not-echo' })],
    ['invalid expected identifier', mismatchResponse({ ...mismatch, expected: 'latest' })],
    ['invalid received identifier', mismatchResponse({ ...mismatch, received: ADMIN_CONTRACT_HEADER })],
  ])('does not classify %s as a compatibility mismatch', async (_description, response) => {
    await expect(readAdminClientIncompatibleResponse(response)).resolves.toBeUndefined()
  })

  it('throws a typed oRPC mismatch before returning a response to the feature decoder', async () => {
    await expect(rejectAdminClientIncompatibleResponse(mismatchResponse())).rejects.toSatisfy(
      isAdminClientIncompatibleError,
    )

    const ordinaryResponse = Response.json({ active: false, expiresAt: null })
    await expect(rejectAdminClientIncompatibleResponse(ordinaryResponse)).resolves.toBe(ordinaryResponse)
  })

  it('requires both the typed code and validated safe data when recognizing errors', () => {
    expect(isAdminClientIncompatibleError(createAdminClientIncompatibleError(mismatch))).toBe(true)
    expect(
      isAdminClientIncompatibleError(
        new ORPCError('CONFLICT', { defined: true, status: 409, data: { requestId: mismatch.requestId } }),
      ),
    ).toBe(false)
    expect(
      isAdminClientIncompatibleError(
        new ORPCError('ADMIN_CLIENT_INCOMPATIBLE', {
          defined: true,
          status: 409,
          data: { ...mismatch, requestId: 'unsafe' },
        }),
      ),
    ).toBe(false)
  })
})

describe('administrator compatibility reload controller', () => {
  it('clears unsafe state, then permits exactly one user-triggered reload', async () => {
    const { storage, values } = createMemoryStorage()
    const cancelAndClear = vi.fn(async () => {})
    const reload = vi.fn()
    const controller = createAdminCompatibilityController({ cancelAndClear, reload, storage })
    const error = createAdminClientIncompatibleError(mismatch)

    await expect(controller.handleError(error)).resolves.toBe(true)
    expect(cancelAndClear).toHaveBeenCalledTimes(1)
    expect(reload).not.toHaveBeenCalled()
    expect(controller.getState()).toEqual({ status: 'reload_available', mismatch })

    expect(controller.requestReload()).toBe(true)
    expect(storage.setItem).toHaveBeenCalledWith(
      getAdminCompatibilityReloadMarkerKey(ADMIN_CONTRACT_COMPATIBILITY_ID),
      'attempted',
    )
    expect(values.get(getAdminCompatibilityReloadMarkerKey())).toBe('attempted')
    expect(reload).toHaveBeenCalledTimes(1)
    expect(controller.getState()).toEqual({ status: 'reloading', mismatch })

    expect(controller.requestReload()).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('notifies subscribers for mismatch, reload, and compatible state transitions', async () => {
    const { storage } = createMemoryStorage()
    const controller = createAdminCompatibilityController({
      cancelAndClear: vi.fn(),
      reload: vi.fn(),
      storage,
    })
    const states: string[] = []
    const unsubscribe = controller.subscribe(() => states.push(controller.getState().status))

    controller.markCompatible()
    await controller.handleError(createAdminClientIncompatibleError(mismatch))
    expect(controller.requestReload()).toBe(true)
    unsubscribe()
    await controller.handleError(createAdminClientIncompatibleError(mismatch))

    expect(states).toEqual(['compatible', 'blocking', 'reload_available', 'reloading'])
  })

  it('notifies reloading before a reload failure becomes terminal', async () => {
    const { storage } = createMemoryStorage()
    const controller = createAdminCompatibilityController({
      cancelAndClear: vi.fn(),
      reload: () => {
        throw new Error('reload unavailable')
      },
      storage,
    })
    const states: string[] = []
    controller.subscribe(() => states.push(controller.getState().status))

    await controller.handleError(createAdminClientIncompatibleError(mismatch))
    controller.requestReload()

    expect(states).toEqual(['blocking', 'reload_available', 'reloading', 'update_required'])
  })

  it('isolates compatibility enforcement from failing subscribers', async () => {
    const { storage } = createMemoryStorage()
    const observingListener = vi.fn()
    const controller = createAdminCompatibilityController({ cancelAndClear: vi.fn(), reload: vi.fn(), storage })
    controller.subscribe(() => {
      throw new Error('presentation failure')
    })
    controller.subscribe(observingListener)

    await controller.handleError(createAdminClientIncompatibleError(mismatch))

    expect(observingListener).toHaveBeenCalledTimes(2)
    expect(controller.getState()).toMatchObject({ status: 'reload_available' })
  })

  it('makes a mismatch after the attempted reload terminal', async () => {
    const markerKey = getAdminCompatibilityReloadMarkerKey()
    const { storage } = createMemoryStorage({ [markerKey]: 'attempted' })
    const cancelAndClear = vi.fn()
    const reload = vi.fn()
    const controller = createAdminCompatibilityController({ cancelAndClear, reload, storage })

    await controller.handleError(createAdminClientIncompatibleError(mismatch))

    expect(cancelAndClear).toHaveBeenCalledTimes(1)
    expect(controller.getState()).toEqual({
      status: 'update_required',
      mismatch,
      reason: 'already_reloaded',
    })
    expect(controller.requestReload()).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('keys attempts by the compiled identifier', async () => {
    const firstId = `sha256:${'1'.repeat(64)}`
    const secondId = `sha256:${'2'.repeat(64)}`
    const firstKey = getAdminCompatibilityReloadMarkerKey(firstId)
    const { storage } = createMemoryStorage({ [firstKey]: 'attempted' })
    const first = createAdminCompatibilityController({
      cancelAndClear: vi.fn(),
      compatibilityId: firstId,
      reload: vi.fn(),
      storage,
    })
    const second = createAdminCompatibilityController({
      cancelAndClear: vi.fn(),
      compatibilityId: secondId,
      reload: vi.fn(),
      storage,
    })

    await first.handleError(createAdminClientIncompatibleError(mismatch))
    await second.handleError(createAdminClientIncompatibleError(mismatch))

    expect(first.getState()).toMatchObject({ status: 'update_required', reason: 'already_reloaded' })
    expect(second.getState()).toMatchObject({ status: 'reload_available' })
  })

  it.each([
    ['missing storage', null],
    [
      'unreadable storage',
      {
        getItem: () => {
          throw new Error('blocked')
        },
        removeItem: vi.fn(),
        setItem: vi.fn(),
      } satisfies AdminCompatibilityStorage,
    ],
  ])('fails closed with %s', async (_description, storage) => {
    const reload = vi.fn()
    const controller = createAdminCompatibilityController({ cancelAndClear: vi.fn(), reload, storage })

    await controller.handleError(createAdminClientIncompatibleError(mismatch))

    expect(controller.getState()).toEqual({
      status: 'update_required',
      mismatch,
      reason: 'storage_unavailable',
    })
    expect(controller.requestReload()).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('fails closed when protected cached state cannot be cleared', async () => {
    const { storage } = createMemoryStorage()
    const controller = createAdminCompatibilityController({
      cancelAndClear: () => {
        throw new Error('cache failure')
      },
      reload: vi.fn(),
      storage,
    })

    await controller.handleError(createAdminClientIncompatibleError(mismatch))

    expect(storage.getItem).not.toHaveBeenCalled()
    expect(controller.getState()).toEqual({
      status: 'update_required',
      mismatch,
      reason: 'cache_clear_failed',
    })
  })

  it('does not reload when writing the one-attempt marker fails', async () => {
    const storage: AdminCompatibilityStorage = {
      getItem: () => null,
      removeItem: vi.fn(),
      setItem: () => {
        throw new Error('quota')
      },
    }
    const reload = vi.fn()
    const controller = createAdminCompatibilityController({ cancelAndClear: vi.fn(), reload, storage })
    await controller.handleError(createAdminClientIncompatibleError(mismatch))

    expect(controller.requestReload()).toBe(false)
    expect(reload).not.toHaveBeenCalled()
    expect(controller.getState()).toEqual({
      status: 'update_required',
      mismatch,
      reason: 'storage_write_failed',
    })
  })

  it('keeps the marker after a reload callback fails so the action cannot loop', async () => {
    const { storage, values } = createMemoryStorage()
    const controller = createAdminCompatibilityController({
      cancelAndClear: vi.fn(),
      reload: () => {
        throw new Error('reload unavailable')
      },
      storage,
    })
    await controller.handleError(createAdminClientIncompatibleError(mismatch))

    expect(controller.requestReload()).toBe(false)
    expect(values.get(getAdminCompatibilityReloadMarkerKey())).toBe('attempted')
    expect(controller.getState()).toEqual({
      status: 'update_required',
      mismatch,
      reason: 'reload_failed',
    })
  })

  it('clears the attempt marker after a compatible bootstrap succeeds', async () => {
    const markerKey = getAdminCompatibilityReloadMarkerKey()
    const { storage, values } = createMemoryStorage({ [markerKey]: 'attempted' })
    const controller = createAdminCompatibilityController({ cancelAndClear: vi.fn(), reload: vi.fn(), storage })

    controller.markCompatible()

    expect(storage.removeItem).toHaveBeenCalledWith(markerKey)
    expect(values.has(markerKey)).toBe(false)
    expect(controller.getState()).toEqual({ status: 'compatible' })
  })

  it('does not let a late successful response reopen the application after a mismatch', async () => {
    const { storage, values } = createMemoryStorage()
    const controller = createAdminCompatibilityController({ cancelAndClear: vi.fn(), reload: vi.fn(), storage })
    await controller.handleError(createAdminClientIncompatibleError(mismatch))
    expect(controller.requestReload()).toBe(true)

    controller.markCompatible()

    expect(controller.getState()).toEqual({ status: 'reloading', mismatch })
    expect(values.get(getAdminCompatibilityReloadMarkerKey())).toBe('attempted')
  })

  it('ignores unrelated errors without touching protected state', async () => {
    const { storage } = createMemoryStorage()
    const cancelAndClear = vi.fn()
    const controller = createAdminCompatibilityController({ cancelAndClear, reload: vi.fn(), storage })

    await expect(controller.handleError(new Error('network unavailable'))).resolves.toBe(false)
    expect(cancelAndClear).not.toHaveBeenCalled()
    expect(storage.getItem).not.toHaveBeenCalled()
    expect(controller.getState()).toEqual({ status: 'unchecked' })
  })

  it('coalesces concurrent handling so protected state is cleared once', async () => {
    const { storage } = createMemoryStorage()
    let releaseClear: (() => void) | undefined
    const cancelAndClear = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseClear = resolve
        }),
    )
    const controller = createAdminCompatibilityController({ cancelAndClear, reload: vi.fn(), storage })
    const error = createAdminClientIncompatibleError(mismatch)

    const first = controller.handleError(error)
    const second = controller.handleError(error)
    expect(controller.getState()).toEqual({ status: 'blocking', mismatch })
    releaseClear?.()

    await expect(Promise.all([first, second])).resolves.toEqual([true, true])
    expect(cancelAndClear).toHaveBeenCalledTimes(1)
  })

  it('ignores duplicate mismatch delivery after the application is already blocked', async () => {
    const { storage } = createMemoryStorage()
    const cancelAndClear = vi.fn()
    const controller = createAdminCompatibilityController({ cancelAndClear, reload: vi.fn(), storage })
    const error = createAdminClientIncompatibleError(mismatch)

    await controller.handleError(error)
    const stateAfterFirstMismatch = controller.getState()
    await expect(controller.handleError(error)).resolves.toBe(true)

    expect(cancelAndClear).toHaveBeenCalledOnce()
    expect(controller.getState()).toBe(stateAfterFirstMismatch)
  })
})