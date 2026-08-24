import { ORPCError } from '@orpc/client'
import { describe, expect, it, vi } from 'vitest'
import { createAdminAuthController } from './admin-auth-controller'
import type { AdminPrincipal } from './admin-auth-context'

const principal = (
  effectiveRole: 'admin' | 'super_admin' = 'admin',
  userId = `${effectiveRole}-id`,
): AdminPrincipal => ({
  userId,
  effectiveRole,
  capabilities: {
    canModerateUsers: true,
    canModerateAdministrators: effectiveRole === 'super_admin',
    canManageAdministrators: effectiveRole === 'super_admin',
  },
})

const adminError = (code: string, status: number) =>
  new ORPCError(code, {
    data: { requestId: null },
    defined: true,
    message: 'raw administrator error',
    status,
  })

const authenticate = (controller: ReturnType<typeof createAdminAuthController>, value = principal()) => {
  const checkId = controller.beginAuthorizationCheck()
  expect(checkId).toBeTypeOf('number')
  expect(controller.markAuthenticated(value, checkId)).toBe(true)
}

const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

describe('administrator authentication controller', () => {
  it('moves from session loading through an authoritative bootstrap result', () => {
    const controller = createAdminAuthController({
      clearProtectedState: vi.fn(),
    })

    expect(controller.getState()).toEqual({
      status: 'pending',
      phase: 'session',
      checkId: 0,
    })
    const sessionCheck = controller.beginSessionCheck()
    expect(controller.getState()).toEqual({
      status: 'pending',
      phase: 'session',
      checkId: sessionCheck,
    })
    const authorizationCheck = controller.beginAuthorizationCheck()
    expect(controller.getState()).toEqual({
      status: 'pending',
      phase: 'authorization',
      checkId: authorizationCheck,
    })

    expect(controller.markAuthenticated(principal('super_admin'), authorizationCheck)).toBe(true)
    expect(controller.getState()).toEqual({
      status: 'authenticated',
      principal: principal('super_admin'),
    })
  })

  it('rejects stale session and authorization completions', async () => {
    const clearProtectedState = vi.fn(async () => undefined)
    const controller = createAdminAuthController({ clearProtectedState })
    const staleSessionCheck = controller.beginSessionCheck()!
    const currentSessionCheck = controller.beginSessionCheck()!

    await controller.handleSessionMissing(staleSessionCheck)
    expect(clearProtectedState).not.toHaveBeenCalled()
    expect(controller.markUnavailable('session', staleSessionCheck)).toBe(false)

    const staleAuthorizationCheck = controller.beginAuthorizationCheck()!
    const currentAuthorizationCheck = controller.beginAuthorizationCheck()!
    expect(controller.markAuthenticated(principal(), staleAuthorizationCheck)).toBe(false)
    expect(controller.handleBootstrapError(adminError('FORBIDDEN', 403), staleAuthorizationCheck)).toBe(false)
    expect(clearProtectedState).not.toHaveBeenCalled()

    expect(controller.markAuthenticated(principal(), currentAuthorizationCheck)).toBe(true)
    expect(controller.getState().status).toBe('authenticated')
    expect(currentSessionCheck).not.toBe(staleSessionCheck)
  })

  it('rechecks a generic feature denial before purging authorization', async () => {
    const clearProtectedState = vi.fn(async () => undefined)
    const controller = createAdminAuthController({ clearProtectedState })
    authenticate(controller)

    expect(controller.handleFeatureError(adminError('FORBIDDEN', 403))).toBe(true)
    const pending = controller.getState()
    expect(pending).toMatchObject({
      status: 'pending',
      phase: 'authorization',
    })
    expect(clearProtectedState).not.toHaveBeenCalled()

    expect(controller.markAuthenticated(principal(), pending.status === 'pending' ? pending.checkId : -1)).toBe(true)
    expect(controller.getState().status).toBe('authenticated')
    expect(clearProtectedState).not.toHaveBeenCalled()

    expect(controller.handleFeatureError(adminError('FORBIDDEN', 403))).toBe(true)
    const rejected = controller.getState()
    expect(
      controller.handleBootstrapError(
        adminError('FORBIDDEN', 403),
        rejected.status === 'pending' ? rejected.checkId : -1,
      ),
    ).toBe(true)
    expect(controller.getState()).toEqual({
      status: 'clearing',
      destination: 'forbidden',
    })
    await vi.waitFor(() => expect(controller.getState()).toEqual({ status: 'forbidden' }))
    expect(clearProtectedState).toHaveBeenCalledOnce()
  })

  it.each([
    ['account replacement', principal('admin', 'replacement-id')],
    ['role reduction', principal('admin', 'administrator-id')],
    [
      'capability reduction',
      {
        ...principal('super_admin', 'administrator-id'),
        capabilities: {
          canModerateUsers: false,
          canModerateAdministrators: true,
          canManageAdministrators: true,
        },
      },
    ],
  ] as const)('purges before publishing a successful bootstrap %s', async (_label, nextPrincipal) => {
    const pendingClear = deferred()
    const clearProtectedState = vi.fn(() => pendingClear.promise)
    const controller = createAdminAuthController({ clearProtectedState })
    authenticate(controller, principal('super_admin', 'administrator-id'))

    const checkId = controller.beginAuthorizationCheck()!
    expect(controller.markAuthenticated(nextPrincipal, checkId)).toBe(true)
    expect(controller.getState()).toEqual({
      status: 'clearing',
      destination: 'authenticated',
    })
    expect(controller.beginAuthorizationCheck()).toBeUndefined()

    await vi.waitFor(() => expect(clearProtectedState).toHaveBeenCalledOnce())
    pendingClear.resolve()
    await vi.waitFor(() =>
      expect(controller.getState()).toEqual({
        status: 'authenticated',
        principal: nextPrincipal,
      }),
    )
  })

  it('publishes a privilege expansion without purging protected state', () => {
    const clearProtectedState = vi.fn(async () => undefined)
    const controller = createAdminAuthController({ clearProtectedState })
    authenticate(controller, principal('admin', 'administrator-id'))

    const expanded = principal('super_admin', 'administrator-id')
    const checkId = controller.beginAuthorizationCheck()!
    expect(controller.markAuthenticated(expanded, checkId)).toBe(true)
    expect(controller.getState()).toEqual({ status: 'authenticated', principal: expanded })
    expect(clearProtectedState).not.toHaveBeenCalled()
  })

  it('lets session loss override an in-progress privilege-change clear', async () => {
    const pendingClear = deferred()
    const controller = createAdminAuthController({ clearProtectedState: () => pendingClear.promise })
    authenticate(controller, principal('super_admin', 'administrator-id'))

    const checkId = controller.beginAuthorizationCheck()!
    controller.markAuthenticated(principal('admin', 'administrator-id'), checkId)
    const missing = controller.handleSessionMissing()
    expect(controller.getState()).toEqual({
      status: 'clearing',
      destination: 'unauthenticated',
    })

    pendingClear.resolve()
    await missing
    expect(controller.getState()).toEqual({
      status: 'unauthenticated',
      reason: 'expired-or-revoked',
    })
  })

  it.each([
    ['UNAUTHENTICATED', 401, { status: 'unauthenticated', reason: 'expired-or-revoked' }],
    ['FRESH_LOGIN_REQUIRED', 401, { status: 'fresh-login-required' }],
  ] as const)('fails closed immediately for a feature %s response', async (code, status, terminal) => {
    const clearProtectedState = vi.fn(async () => undefined)
    const controller = createAdminAuthController({ clearProtectedState })
    authenticate(controller)

    expect(controller.handleFeatureError(adminError(code, status))).toBe(true)
    expect(controller.getState()).toMatchObject({ status: 'clearing' })
    await vi.waitFor(() => expect(controller.getState()).toEqual(terminal))
    expect(clearProtectedState).toHaveBeenCalledOnce()
  })

  it('distinguishes an initially missing session from a revoked authenticated session', async () => {
    const initialClear = vi.fn(async () => undefined)
    const initial = createAdminAuthController({
      clearProtectedState: initialClear,
    })
    await initial.handleSessionMissing(0)
    expect(initial.getState()).toEqual({
      status: 'unauthenticated',
      reason: 'initial',
    })
    expect(initialClear).toHaveBeenCalledOnce()

    const revokedClear = vi.fn(async () => undefined)
    const revoked = createAdminAuthController({
      clearProtectedState: revokedClear,
    })
    authenticate(revoked)
    await revoked.handleSessionMissing()
    expect(revoked.getState()).toEqual({
      status: 'unauthenticated',
      reason: 'expired-or-revoked',
    })
    expect(revokedClear).toHaveBeenCalledOnce()
  })

  it.each([
    ['FORBIDDEN', 403],
    ['FRESH_LOGIN_REQUIRED', 401],
  ] as const)('moves a cleared %s state to unauthenticated when the session disappears', async (code, status) => {
    const clearProtectedState = vi.fn(async () => undefined)
    const controller = createAdminAuthController({ clearProtectedState })
    authenticate(controller)
    const checkId = controller.beginAuthorizationCheck()!
    controller.handleBootstrapError(adminError(code, status), checkId)
    await vi.waitFor(() => expect(controller.getState().status).not.toBe('clearing'))

    await controller.handleSessionMissing()

    expect(controller.getState()).toEqual({
      status: 'unauthenticated',
      reason: 'expired-or-revoked',
    })
    expect(clearProtectedState).toHaveBeenCalledOnce()
  })

  it('does not purge twice when a cleared session is replaced by another account', async () => {
    const clearProtectedState = vi.fn(async () => undefined)
    const controller = createAdminAuthController({ clearProtectedState })
    authenticate(controller, principal('admin', 'first-id'))

    await controller.handleSessionMissing()
    const checkId = controller.beginAuthorizationCheck()!
    expect(controller.markAuthenticated(principal('admin', 'replacement-id'), checkId)).toBe(true)

    expect(controller.getState()).toEqual({
      status: 'authenticated',
      principal: principal('admin', 'replacement-id'),
    })
    expect(clearProtectedState).toHaveBeenCalledOnce()
  })

  it('purges before reporting successful or failed sign-out', async () => {
    const successfulClear = vi.fn(async () => undefined)
    const successful = createAdminAuthController({
      clearProtectedState: successfulClear,
    })
    authenticate(successful)
    await successful.beginSignOut()
    expect(successful.getState()).toEqual({ status: 'signing-out' })
    successful.completeSignOut()
    expect(successful.getState()).toEqual({
      status: 'unauthenticated',
      reason: 'signed-out',
    })
    expect(successfulClear).toHaveBeenCalledOnce()

    const failedClear = vi.fn(async () => undefined)
    const failed = createAdminAuthController({
      clearProtectedState: failedClear,
    })
    authenticate(failed)
    await failed.beginSignOut()
    failed.failSignOut()
    expect(failed.getState()).toEqual({
      status: 'unavailable',
      source: 'sign-out',
    })
    expect(failedClear).toHaveBeenCalledOnce()
  })

  it('coalesces concurrent protected-state purges and lets explicit sign-out choose the final state', async () => {
    const pendingClear = deferred()
    const clearProtectedState = vi.fn(() => pendingClear.promise)
    const controller = createAdminAuthController({ clearProtectedState })
    authenticate(controller)

    controller.handleFeatureError(adminError('UNAUTHENTICATED', 401))
    const signOut = controller.beginSignOut()
    expect(controller.getState()).toEqual({
      status: 'clearing',
      destination: 'signing-out',
    })

    await vi.waitFor(() => expect(clearProtectedState).toHaveBeenCalledOnce())
    pendingClear.resolve()
    await signOut
    expect(controller.getState()).toEqual({ status: 'signing-out' })
    expect(clearProtectedState).toHaveBeenCalledOnce()
  })

  it('stays fail closed when cancellation reports a failure', async () => {
    const controller = createAdminAuthController({
      clearProtectedState: vi.fn(async () => {
        throw new Error('cancellation failed after cache clear')
      }),
    })
    const checkId = controller.beginAuthorizationCheck()!

    controller.handleBootstrapError(adminError('FORBIDDEN', 403), checkId)
    await vi.waitFor(() => expect(controller.getState()).toEqual({ status: 'forbidden' }))
  })

  it('isolates subscriber failures and supports clean unsubscription', () => {
    const controller = createAdminAuthController({
      clearProtectedState: vi.fn(),
    })
    const broken = vi.fn(() => {
      throw new Error('subscriber failure')
    })
    const healthy = vi.fn()
    controller.subscribe(broken)
    const unsubscribe = controller.subscribe(healthy)

    expect(() => controller.beginSessionCheck()).not.toThrow()
    expect(broken).toHaveBeenCalledOnce()
    expect(healthy).toHaveBeenCalledOnce()

    unsubscribe()
    controller.beginSessionCheck()
    expect(broken).toHaveBeenCalledTimes(2)
    expect(healthy).toHaveBeenCalledOnce()
  })
})