import { normalizeAdminError } from '../data/admin-errors'
import type { AdminAuthSnapshot, AdminAuthUnavailableSource, AdminPrincipal } from './admin-auth-context'

type AdminAuthSubscriber = () => void
type ClearProtectedState = () => Promise<void>
type PendingPhase = Extract<AdminAuthSnapshot, { status: 'pending' }>['phase']
type ClearTarget = Extract<
  AdminAuthSnapshot,
  {
    status: 'authenticated' | 'forbidden' | 'fresh-login-required' | 'signing-out' | 'unauthenticated'
  }
>

export type AdminAuthController = {
  readonly beginAuthorizationCheck: () => number | undefined
  readonly beginSessionCheck: () => number | undefined
  readonly beginSignOut: () => Promise<void>
  readonly completeSignOut: () => void
  readonly failSignOut: () => void
  readonly getState: () => AdminAuthSnapshot
  readonly handleBootstrapError: (error: unknown, checkId?: number) => boolean
  readonly handleFeatureError: (error: unknown) => boolean
  readonly handleSessionMissing: (checkId?: number) => Promise<void>
  readonly markAuthenticated: (principal: AdminPrincipal, checkId?: number) => boolean
  readonly markUnavailable: (source: AdminAuthUnavailableSource, checkId?: number) => boolean
  readonly subscribe: (subscriber: AdminAuthSubscriber) => () => void
}

export const createAdminAuthController = ({
  clearProtectedState,
}: {
  readonly clearProtectedState: ClearProtectedState
}): AdminAuthController => {
  let state: AdminAuthSnapshot = {
    status: 'pending',
    phase: 'session',
    checkId: 0,
  }
  let nextCheckId = 0
  let everAuthenticated = false
  let lastAuthenticatedPrincipal: AdminPrincipal | undefined
  let clearTarget: ClearTarget | undefined
  let clearing: Promise<void> | undefined
  const subscribers = new Set<AdminAuthSubscriber>()

  const setState = (next: AdminAuthSnapshot) => {
    state = next
    for (const subscriber of [...subscribers]) {
      try {
        subscriber()
      } catch {
        // A rendering or telemetry subscriber cannot interrupt a security
        // transition or prevent the remaining subscribers from observing it.
      }
    }
  }

  const isCurrentCheck = (phase: PendingPhase, checkId?: number): boolean =>
    state.status === 'pending' && state.phase === phase && (checkId === undefined || state.checkId === checkId)

  const clearTo = (target: ClearTarget): Promise<void> => {
    clearTarget = target

    if (clearing) {
      setState({ status: 'clearing', destination: target.status })
      return clearing
    }

    const operation = Promise.resolve()
      .then(clearProtectedState)
      .catch(() => {
        // The shared runtime operation clears in a finally path. Even if
        // cancellation reports a failure, this controller must stay blocked
        // and finish at the requested fail-closed state.
      })
      .then(() => {
        const finalTarget = clearTarget ?? target
        clearTarget = undefined
        clearing = undefined
        if (finalTarget.status === 'authenticated') {
          everAuthenticated = true
          lastAuthenticatedPrincipal = finalTarget.principal
        } else {
          lastAuthenticatedPrincipal = undefined
        }
        setState(finalTarget)
      })

    clearing = operation
    setState({ status: 'clearing', destination: target.status })
    return operation
  }

  const unauthenticatedTarget = (): ClearTarget => ({
    status: 'unauthenticated',
    reason: everAuthenticated ? 'expired-or-revoked' : 'initial',
  })

  const loseAuthorization = (kind: 'forbidden' | 'fresh-login-required' | 'unauthenticated'): boolean => {
    if (state.status === 'signing-out') return true

    const target: ClearTarget =
      kind === 'forbidden'
        ? { status: 'forbidden' }
        : kind === 'fresh-login-required'
          ? { status: 'fresh-login-required' }
          : unauthenticatedTarget()

    if (state.status === 'forbidden' || state.status === 'fresh-login-required' || state.status === 'unauthenticated') {
      setState(target)
      return true
    }

    void clearTo(target)
    return true
  }

  const beginCheck = (phase: PendingPhase): number | undefined => {
    if (state.status === 'clearing' || state.status === 'signing-out') return undefined
    const checkId = ++nextCheckId
    setState({ status: 'pending', phase, checkId })
    return checkId
  }

  const losesPrivilege = (previous: AdminPrincipal, next: AdminPrincipal): boolean => {
    if (previous.userId !== next.userId) return true
    if (previous.effectiveRole === 'super_admin' && next.effectiveRole !== 'super_admin') return true

    return Object.entries(previous.capabilities).some(
      ([capability, granted]) => granted && !next.capabilities[capability as keyof AdminPrincipal['capabilities']],
    )
  }

  return {
    beginAuthorizationCheck: () => beginCheck('authorization'),
    beginSessionCheck: () => beginCheck('session'),
    beginSignOut: async () => {
      if (state.status === 'signing-out') return
      await clearTo({ status: 'signing-out' })
    },
    completeSignOut: () => {
      if (state.status === 'signing-out') setState({ status: 'unauthenticated', reason: 'signed-out' })
    },
    failSignOut: () => {
      if (state.status === 'signing-out') setState({ status: 'unavailable', source: 'sign-out' })
    },
    getState: () => state,
    handleBootstrapError: (error, checkId) => {
      if (checkId !== undefined && !isCurrentCheck('authorization', checkId)) return false
      if (checkId === undefined && state.status !== 'authenticated' && !isCurrentCheck('authorization')) return false

      const kind = normalizeAdminError(error).kind
      if (kind === 'unauthenticated') return loseAuthorization('unauthenticated')
      if (kind === 'forbidden') return loseAuthorization('forbidden')
      if (kind === 'fresh-login-required') return loseAuthorization('fresh-login-required')
      if (kind === 'client-incompatible' || kind === 'cancelled') return false

      setState({ status: 'unavailable', source: 'authorization' })
      return true
    },
    handleFeatureError: (error) => {
      const kind = normalizeAdminError(error).kind
      if (kind === 'unauthenticated') return loseAuthorization('unauthenticated')
      if (kind === 'fresh-login-required') return loseAuthorization('fresh-login-required')
      if (kind !== 'forbidden') return false

      // A feature can be forbidden because of its target or capability, so it
      // is not proof that the current session lost administrator authority.
      // Re-run bootstrap and purge only if that authoritative check fails.
      if (state.status === 'authenticated') {
        beginCheck('authorization')
        return true
      }
      return isCurrentCheck('authorization')
    },
    handleSessionMissing: async (checkId) => {
      if (checkId !== undefined && !isCurrentCheck('session', checkId)) return
      if (checkId === undefined && (state.status === 'forbidden' || state.status === 'fresh-login-required')) {
        setState(unauthenticatedTarget())
        return
      }
      if (checkId === undefined && state.status === 'clearing') {
        if (state.destination !== 'signing-out') await clearTo(unauthenticatedTarget())
        return
      }
      if (
        checkId === undefined &&
        state.status !== 'authenticated' &&
        state.status !== 'unavailable' &&
        !isCurrentCheck('session') &&
        !isCurrentCheck('authorization')
      ) {
        return
      }
      await clearTo(unauthenticatedTarget())
    },
    markAuthenticated: (principal, checkId) => {
      if (!isCurrentCheck('authorization', checkId)) return false
      if (lastAuthenticatedPrincipal && losesPrivilege(lastAuthenticatedPrincipal, principal)) {
        void clearTo({ status: 'authenticated', principal })
        return true
      }
      everAuthenticated = true
      lastAuthenticatedPrincipal = principal
      setState({ status: 'authenticated', principal })
      return true
    },
    markUnavailable: (source, checkId) => {
      if (state.status === 'clearing' || state.status === 'signing-out') return false

      if (checkId !== undefined) {
        const phase = source === 'session' ? 'session' : source === 'authorization' ? 'authorization' : undefined
        if (!phase || !isCurrentCheck(phase, checkId)) return false
      }

      setState({ status: 'unavailable', source })
      return true
    },
    subscribe: (subscriber) => {
      subscribers.add(subscriber)
      return () => subscribers.delete(subscriber)
    },
  }
}