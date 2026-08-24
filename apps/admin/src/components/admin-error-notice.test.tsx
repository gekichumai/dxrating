import { fireEvent, render, screen } from '@testing-library/react'
import { ORPCError } from '@orpc/client'
import { describe, expect, it, vi } from 'vitest'
import { AdminProviders } from '../providers'
import { AdminErrorNotice } from './admin-error-notice'

const renderError = (error: unknown, callbacks = {}) =>
  render(
    <AdminProviders>
      <AdminErrorNotice error={error} {...callbacks} />
    </AdminProviders>,
  )

const definedError = (code: string, status: number, requestId: string | null = null) =>
  new ORPCError(code, {
    data: { requestId },
    defined: true,
    message: 'Raw server text must never be rendered',
    status,
  })

describe('administrator error notice', () => {
  it.each([
    ['UNAUTHENTICATED', 401, 'Sign-in required'],
    ['FORBIDDEN', 403, 'Access denied'],
    ['VALIDATION_FAILED', 400, 'Check the information'],
    ['CONFLICT', 409, 'Information changed'],
    ['NOT_FOUND', 404, 'Item not found'],
    ['STEP_UP_RATE_LIMITED', 429, 'Identity confirmation paused'],
    ['INTERNAL_SERVER_ERROR', 500, 'Server error'],
  ])('gives %s a distinct accessible presentation', (code, status, title) => {
    renderError(definedError(code, status))

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain(title)
    expect(alert.textContent).not.toContain('Raw server text')
  })

  it('keeps recent-authentication and fresh-login recovery paths distinct', () => {
    const onStepUp = vi.fn()
    const { rerender } = render(
      <AdminProviders>
        <AdminErrorNotice error={definedError('RECENT_AUTH_REQUIRED', 401)} onStepUp={onStepUp} />
      </AdminProviders>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Verify identity' }))
    expect(onStepUp).toHaveBeenCalledOnce()
    expect(screen.queryByRole('link', { name: 'Sign in again' })).toBeNull()

    rerender(
      <AdminProviders>
        <AdminErrorNotice error={definedError('FRESH_LOGIN_REQUIRED', 401)} onStepUp={onStepUp} />
      </AdminProviders>,
    )
    expect(screen.getByRole('link', { name: 'Sign in again' }).getAttribute('href')).toBe('/sign-in')
    expect(screen.queryByRole('button', { name: 'Verify identity' })).toBeNull()
  })

  it('offers refresh for conflicts without presenting automatic retry', () => {
    const onRefresh = vi.fn()
    const onRetry = vi.fn()
    renderError(definedError('CONFLICT', 409), { onRefresh, onRetry })

    fireEvent.click(screen.getByRole('button', { name: 'Refresh current state' }))
    expect(onRefresh).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })

  it('shows only a validated correlation identifier', () => {
    const requestId = '550e8400-e29b-41d4-a716-446655440000'
    const { rerender } = render(
      <AdminProviders>
        <AdminErrorNotice error={definedError('INTERNAL_SERVER_ERROR', 500, requestId)} />
      </AdminProviders>,
    )
    expect(screen.getByRole('alert').textContent).toContain(requestId)

    rerender(
      <AdminProviders>
        <AdminErrorNotice error={definedError('INTERNAL_SERVER_ERROR', 500, 'unsafe-id')} />
      </AdminProviders>,
    )
    expect(screen.getByRole('alert').textContent).not.toContain('unsafe-id')
  })

  it('does not render cancellations as failures', () => {
    const cancelled = new Error('cancelled')
    cancelled.name = 'AbortError'
    renderError(cancelled)

    expect(screen.queryByRole('alert')).toBeNull()
  })
})