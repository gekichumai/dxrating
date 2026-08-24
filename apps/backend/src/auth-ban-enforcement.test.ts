import type { Pool } from 'pg'
import { describe, expect, it, vi } from 'vitest'
import { APIError } from 'better-auth/api'
import {
  ACCOUNT_BANNED_CODE,
  ACCOUNT_BANNED_MESSAGE,
  AUTH_OPERATION_FAILED_CODE,
  AUTH_OPERATION_FAILED_MESSAGE,
  createPrivateAuthOperationFailedResponse,
  createPasskeyBanCallbacks,
  getProjectedAuthBanDenial,
  getProvenAuthBanUserId,
  logBanAwareBetterAuthMessage,
  logUnexpectedBetterAuthError,
  projectAccountBannedResponse,
  runWithAuthBanRequestState,
  withOauthAccountBanCheck,
} from './auth-ban-enforcement.js'
import type { EvaluatedUserBanState } from './admin/user-ban-store.js'

const activeBan = (overrides: Partial<EvaluatedUserBanState> = {}): EvaluatedUserBanState => ({
  subjectUserId: 'banned-user',
  stateVersion: '4',
  establishedAction: 'ban',
  status: 'permanently_banned',
  active: true,
  banStartedAt: new Date('2026-08-24T00:00:00.000Z'),
  banExpiresAt: null,
  banReason: 'Repeated abusive comments',
  actorUserId: 'admin-user',
  evaluatedAt: new Date('2026-08-24T00:01:00.000Z'),
  ...overrides,
})

describe('Better Auth ban enforcement primitives', () => {
  it('keeps an unproven database-guard failure generic and private', async () => {
    const response = createPrivateAuthOperationFailedResponse()

    expect(response.status).toBe(500)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(response.headers.get('CDN-Cache-Control')).toBe('no-store')
    expect(response.headers.get('Cloudflare-CDN-Cache-Control')).toBe('no-store')
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer')
    const body = await response.json()
    expect(body).toEqual({
      code: AUTH_OPERATION_FAILED_CODE,
      message: AUTH_OPERATION_FAILED_MESSAGE,
    })
    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain(ACCOUNT_BANNED_CODE)
    expect(serialized).not.toContain('private moderation reason')
    expect(serialized).not.toContain('banned-user')
  })

  it('projects the stable typed response without internal identity or event metadata', () => {
    expect(projectAccountBannedResponse(activeBan())).toEqual({
      code: ACCOUNT_BANNED_CODE,
      message: ACCOUNT_BANNED_MESSAGE,
      reason: 'Repeated abusive comments',
      expiresAt: null,
    })
    expect(
      projectAccountBannedResponse(
        activeBan({
          status: 'temporarily_banned',
          banExpiresAt: new Date('2026-08-25T00:00:00.000Z'),
        }),
      ),
    ).toEqual({
      code: ACCOUNT_BANNED_CODE,
      message: ACCOUNT_BANNED_MESSAGE,
      reason: 'Repeated abusive comments',
      expiresAt: '2026-08-25T00:00:00.000Z',
    })
  })

  it('keeps passkey denial details request-local while throwing only a sanitized error', async () => {
    const database = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('FROM passkey')) return { rows: [{ user_id: 'banned-user' }] }
        return {
          rows: [
            {
              subject_user_id: 'banned-user',
              established_action: 'ban',
              ban_started_at: new Date('2026-08-24T00:00:00.000Z'),
              ban_expires_at: null,
              ban_reason: 'Repeated abusive comments',
              actor_user_id: 'admin-user',
              established_by_event_id: '4',
              evaluated_at: new Date('2026-08-24T00:01:00.000Z'),
              active: true,
              status: 'permanently_banned',
            },
          ],
        }
      }),
    } as unknown as Pool
    const callbacks = createPasskeyBanCallbacks(database)
    let sanitizedError: unknown

    await runWithAuthBanRequestState(async () => {
      try {
        await callbacks.authentication.afterVerification({ clientData: { id: 'credential-id' } })
      } catch (error) {
        sanitizedError = error
      }
      expect(sanitizedError).toMatchObject({
        code: ACCOUNT_BANNED_CODE,
        message: 'Verified authentication is unavailable',
      })
      expect(Object.getOwnPropertyDescriptor(sanitizedError, 'code')).toMatchObject({ enumerable: false })
      expect(JSON.stringify(sanitizedError)).not.toContain(ACCOUNT_BANNED_CODE)
      await expect(getProvenAuthBanUserId()).resolves.toBe('banned-user')
      await expect(getProjectedAuthBanDenial()).resolves.toEqual({
        code: ACCOUNT_BANNED_CODE,
        message: ACCOUNT_BANNED_MESSAGE,
        reason: 'Repeated abusive comments',
        expiresAt: null,
      })
    })

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    logBanAwareBetterAuthMessage('error', 'Failed to verify authentication', sanitizedError)
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('suppresses the database race backstop in plugin-internal logging and preserves other console levels', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    logBanAwareBetterAuthMessage('error', 'Failed to verify authentication', {
      message: 'Failed query with private parameters',
      cause: {
        code: 'DXB01',
        constraint: 'active_user_ban_write_guard',
        message: 'Account write is unavailable',
      },
    })
    expect(consoleError).not.toHaveBeenCalled()
    expect(consoleWarn).not.toHaveBeenCalled()
    expect(consoleLog).not.toHaveBeenCalled()

    const unexpected = new Error('Unexpected adapter failure')
    logBanAwareBetterAuthMessage('error', 'Unexpected error', unexpected)
    logBanAwareBetterAuthMessage('warn', 'Unexpected warning')
    logBanAwareBetterAuthMessage('info', 'Unexpected information')
    expect(consoleError).toHaveBeenCalledOnce()
    expect(consoleWarn).toHaveBeenCalledOnce()
    expect(consoleLog).toHaveBeenCalledOnce()

    consoleError.mockRestore()
    consoleWarn.mockRestore()
    consoleLog.mockRestore()
  })

  it('redacts account identifiers from Better Auth structured and interpolated log messages', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const privateEmail = 'unregistered-private-account@example.test'
    const privateUserId = 'private-user-id-915821'

    logBanAwareBetterAuthMessage('error', 'User not found', {
      email: privateEmail,
      userId: privateUserId,
    })
    logBanAwareBetterAuthMessage('info', `Sign-up attempt for existing email: ${privateEmail}`)

    expect(consoleError).toHaveBeenCalledOnce()
    expect(String(consoleError.mock.calls[0]?.[0])).toContain('Better Auth error event')
    expect(consoleLog).toHaveBeenCalledOnce()
    expect(String(consoleLog.mock.calls[0]?.[0])).toContain('Better Auth information event')
    const serializedLogs = JSON.stringify([...consoleError.mock.calls, ...consoleLog.mock.calls])
    expect(serializedLogs).not.toContain(privateEmail)
    expect(serializedLogs).not.toContain(privateUserId)

    consoleError.mockRestore()
    consoleLog.mockRestore()
  })

  it('checks a proven OAuth identity by exact provider account before Better Auth can mutate it', async () => {
    const events: string[] = []
    const getUserInfo = vi.fn(async () => {
      events.push('provider-proof')
      return {
        user: { id: 'provider-subject', email: 'identity@example.com' },
        data: { sub: 'provider-subject' },
      }
    })
    const query = vi.fn(async (sql: string, parameters?: readonly unknown[]) => {
      if (sql.includes('FROM account')) {
        events.push('exact-account-lookup')
        expect(sql).toContain('provider_id = $1 AND account_id = $2')
        expect(sql.toLowerCase()).not.toContain('email')
        expect(parameters).toEqual(['google', 'provider-subject'])
        return { rows: [{ user_id: 'banned-user' }] }
      }
      events.push('authoritative-ban-lookup')
      return {
        rows: [
          {
            subject_user_id: 'banned-user',
            established_action: 'ban',
            ban_started_at: new Date('2026-08-24T00:00:00.000Z'),
            ban_expires_at: null,
            ban_reason: 'Repeated abusive comments',
            actor_user_id: 'admin-user',
            established_by_event_id: '4',
            evaluated_at: new Date('2026-08-24T00:01:00.000Z'),
            active: true,
            status: 'permanently_banned',
          },
        ],
      }
    })
    const wrapped = withOauthAccountBanCheck({ query } as unknown as Pool, 'google', getUserInfo)

    await runWithAuthBanRequestState(async () => {
      await expect(wrapped()).rejects.toMatchObject({
        statusCode: 403,
        body: {
          code: ACCOUNT_BANNED_CODE,
          message: ACCOUNT_BANNED_MESSAGE,
          reason: 'Repeated abusive comments',
          expiresAt: null,
        },
      })
      expect(events).toEqual(['provider-proof', 'exact-account-lookup', 'authoritative-ban-lookup'])
      await expect(getProvenAuthBanUserId()).resolves.toBe('banned-user')
    })
  })

  it('leaves an unlinked proven OAuth identity to the existing generic sign-up/link policy', async () => {
    const result = {
      user: { id: 'unlinked-provider-subject', email: 'unlinked@example.com' },
      data: { sub: 'unlinked-provider-subject' },
    }
    const getUserInfo = vi.fn(async () => result)
    const query = vi.fn(async (_sql: string, _parameters?: readonly unknown[]) => ({ rows: [] }))
    const wrapped = withOauthAccountBanCheck({ query } as unknown as Pool, 'github', getUserInfo)

    await runWithAuthBanRequestState(async () => {
      await expect(wrapped()).resolves.toBe(result)
      await expect(getProvenAuthBanUserId()).resolves.toBeNull()
    })
    expect(query).toHaveBeenCalledTimes(1)
    expect(query.mock.calls[0]?.[1]).toEqual(['github', 'unlinked-provider-subject'])
  })

  it('does not retain proof identity beyond the outer request scope', async () => {
    await expect(getProvenAuthBanUserId()).resolves.toBeNull()
    await expect(getProjectedAuthBanDenial()).resolves.toBeNull()
  })

  it('suppresses expected typed and database-race denials while retaining unexpected error logging', () => {
    const logger = { error: vi.fn() }
    logUnexpectedBetterAuthError(
      new APIError('FORBIDDEN', {
        code: ACCOUNT_BANNED_CODE,
        message: ACCOUNT_BANNED_MESSAGE,
        reason: 'Must never be logged',
        expiresAt: null,
      }),
      logger,
    )
    expect(() =>
      logUnexpectedBetterAuthError(
        {
          message: 'Failed query with private parameters',
          cause: {
            code: 'DXB01',
            constraint: 'active_user_ban_write_guard',
            message: 'Account write is unavailable',
          },
        },
        logger,
      ),
    ).toThrowError(
      expect.objectContaining({
        status: 'INTERNAL_SERVER_ERROR',
        body: {
          code: 'AUTH_OPERATION_FAILED',
          message: 'Authentication operation failed',
        },
      }),
    )
    expect(logger.error).not.toHaveBeenCalled()

    const unexpectedCause = new Error('Unexpected adapter failure')
    const unexpected = new Error('Unexpected wrapped failure', { cause: unexpectedCause })
    logUnexpectedBetterAuthError(unexpected, logger)
    expect(logger.error).toHaveBeenLastCalledWith('Error', unexpected)

    const internal = new APIError('INTERNAL_SERVER_ERROR', { message: 'Unexpected internal failure' })
    logUnexpectedBetterAuthError(internal, logger)
    expect(logger.error).toHaveBeenLastCalledWith('INTERNAL_SERVER_ERROR', internal)
  })
})