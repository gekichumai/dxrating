import {
  ADMIN_CLIENT_INCOMPATIBLE_MESSAGE,
  ADMIN_CONTRACT_COMPATIBILITY_ID,
  AdminClientIncompatibleDataSchema,
} from '@gekichumai/admin-contract'
import { ORPCError } from '@orpc/client'

export type AdminClientIncompatibleData = ReturnType<typeof AdminClientIncompatibleDataSchema.parse>
export type AdminClientIncompatibleError = ORPCError<'ADMIN_CLIENT_INCOMPATIBLE', AdminClientIncompatibleData>

type JsonRecord = Readonly<Record<string, unknown>>

const isJsonRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const createAdminClientIncompatibleError = (data: AdminClientIncompatibleData): AdminClientIncompatibleError =>
  new ORPCError('ADMIN_CLIENT_INCOMPATIBLE', {
    data,
    defined: true,
    message: ADMIN_CLIENT_INCOMPATIBLE_MESSAGE,
    status: 409,
  })

export const isAdminClientIncompatibleError = (error: unknown): error is AdminClientIncompatibleError =>
  error instanceof ORPCError &&
  error.defined &&
  error.code === 'ADMIN_CLIENT_INCOMPATIBLE' &&
  AdminClientIncompatibleDataSchema.safeParse(error.data).success

export const readAdminClientIncompatibleResponse = async (
  response: Response,
): Promise<AdminClientIncompatibleData | undefined> => {
  if (response.status !== 409) return undefined

  let body: unknown
  try {
    body = await response.clone().json()
  } catch {
    return undefined
  }

  if (
    !isJsonRecord(body) ||
    body.defined !== true ||
    body.code !== 'ADMIN_CLIENT_INCOMPATIBLE' ||
    body.status !== 409
  ) {
    return undefined
  }

  const data = AdminClientIncompatibleDataSchema.safeParse(body.data)
  return data.success ? data.data : undefined
}

/**
 * Checks the stable compatibility error envelope before oRPC attempts to decode
 * a feature response with this build's contract.
 */
export const rejectAdminClientIncompatibleResponse = async (response: Response): Promise<Response> => {
  const mismatch = await readAdminClientIncompatibleResponse(response)
  if (mismatch) throw createAdminClientIncompatibleError(mismatch)
  return response
}

export type AdminCompatibilityTerminalReason =
  | 'already_reloaded'
  | 'cache_clear_failed'
  | 'reload_failed'
  | 'storage_unavailable'
  | 'storage_write_failed'

export type AdminCompatibilityState =
  | { readonly status: 'unchecked' }
  | { readonly status: 'compatible' }
  | { readonly status: 'blocking'; readonly mismatch: AdminClientIncompatibleData }
  | { readonly status: 'reload_available'; readonly mismatch: AdminClientIncompatibleData }
  | { readonly status: 'reloading'; readonly mismatch: AdminClientIncompatibleData }
  | {
      readonly status: 'update_required'
      readonly mismatch: AdminClientIncompatibleData
      readonly reason: AdminCompatibilityTerminalReason
    }

export type AdminCompatibilityStorage = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>

export const getAdminCompatibilityReloadMarkerKey = (
  compatibilityId: string = ADMIN_CONTRACT_COMPATIBILITY_ID,
): string => `dxrating.admin.contract-reload.${compatibilityId}`

const getSessionStorage = (): AdminCompatibilityStorage | undefined => {
  try {
    return globalThis.sessionStorage
  } catch {
    return undefined
  }
}

export type CreateAdminCompatibilityControllerOptions = {
  readonly cancelAndClear: () => Promise<void> | void
  readonly compatibilityId?: string
  readonly reload: () => void
  readonly storage?: AdminCompatibilityStorage | null
}

export type AdminCompatibilityController = {
  readonly getState: () => AdminCompatibilityState
  readonly handleError: (error: unknown) => Promise<boolean>
  readonly markCompatible: () => void
  readonly requestReload: () => boolean
  readonly subscribe: (listener: () => void) => () => void
}

export const createAdminCompatibilityController = ({
  cancelAndClear,
  compatibilityId = ADMIN_CONTRACT_COMPATIBILITY_ID,
  reload,
  storage,
}: CreateAdminCompatibilityControllerOptions): AdminCompatibilityController => {
  const markerKey = getAdminCompatibilityReloadMarkerKey(compatibilityId)
  let state: AdminCompatibilityState = { status: 'unchecked' }
  let pendingMismatch: Promise<boolean> | undefined
  const listeners = new Set<() => void>()
  const resolveStorage = (): AdminCompatibilityStorage | undefined =>
    storage === undefined ? getSessionStorage() : (storage ?? undefined)

  const setState = (nextState: AdminCompatibilityState) => {
    state = nextState
    for (const listener of listeners) {
      try {
        listener()
      } catch {
        // A presentation subscriber must not alter compatibility enforcement.
      }
    }
  }

  const handleMismatch = async (mismatch: AdminClientIncompatibleData): Promise<boolean> => {
    setState({ status: 'blocking', mismatch })
    try {
      await cancelAndClear()
    } catch {
      setState({ status: 'update_required', mismatch, reason: 'cache_clear_failed' })
      return true
    }

    const availableStorage = resolveStorage()
    if (!availableStorage) {
      setState({ status: 'update_required', mismatch, reason: 'storage_unavailable' })
      return true
    }

    try {
      setState(
        availableStorage.getItem(markerKey)
          ? { status: 'update_required', mismatch, reason: 'already_reloaded' }
          : { status: 'reload_available', mismatch },
      )
    } catch {
      setState({ status: 'update_required', mismatch, reason: 'storage_unavailable' })
    }
    return true
  }

  return {
    getState: () => state,
    handleError: async (error) => {
      if (!isAdminClientIncompatibleError(error)) return false
      if (pendingMismatch) return pendingMismatch
      if (state.status !== 'unchecked' && state.status !== 'compatible') return true

      pendingMismatch = handleMismatch(error.data).finally(() => {
        pendingMismatch = undefined
      })
      return pendingMismatch
    },
    markCompatible: () => {
      if (state.status !== 'unchecked' && state.status !== 'compatible') return
      const availableStorage = resolveStorage()
      if (availableStorage) {
        try {
          availableStorage.removeItem(markerKey)
        } catch {
          // Compatibility is proven by the backend response. A storage cleanup
          // failure only makes a later mismatch fail closed.
        }
      }
      setState({ status: 'compatible' })
    },
    requestReload: () => {
      if (state.status !== 'reload_available') return false
      const mismatch = state.mismatch
      const availableStorage = resolveStorage()
      if (!availableStorage) {
        setState({ status: 'update_required', mismatch, reason: 'storage_unavailable' })
        return false
      }

      try {
        availableStorage.setItem(markerKey, 'attempted')
      } catch {
        setState({ status: 'update_required', mismatch, reason: 'storage_write_failed' })
        return false
      }

      setState({ status: 'reloading', mismatch })
      try {
        reload()
        return true
      } catch {
        setState({ status: 'update_required', mismatch, reason: 'reload_failed' })
        return false
      }
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}