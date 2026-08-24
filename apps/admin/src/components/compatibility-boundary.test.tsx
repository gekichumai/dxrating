import { MantineProvider } from '@mantine/core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createAdminClientIncompatibleError, createAdminCompatibilityController } from '../data/compatibility'
import { TranslationProvider } from '../i18n'
import { adminTheme } from '../theme'
import { AdminCompatibilityBoundary } from './compatibility-boundary'

const mismatch = {
  requestId: '18d7118c-ec70-4603-9176-cffea8a6cd8f',
  expected: `sha256:${'f'.repeat(64)}`,
  received: `sha256:${'0'.repeat(64)}`,
}

const renderBoundary = (controller: ReturnType<typeof createAdminCompatibilityController>) =>
  render(
    <TranslationProvider>
      <MantineProvider theme={adminTheme}>
        <AdminCompatibilityBoundary controller={controller}>
          <div>Protected administrator feature</div>
        </AdminCompatibilityBoundary>
      </MantineProvider>
    </TranslationProvider>,
  )

describe('administrator compatibility boundary', () => {
  it('allows unchecked content until the authentication bootstrap step proves compatibility', () => {
    const controller = createAdminCompatibilityController({
      cancelAndClear: vi.fn(),
      reload: vi.fn(),
      storage: null,
    })

    renderBoundary(controller)

    expect(screen.getByText('Protected administrator feature')).toBeTruthy()
  })

  it('unmounts protected content synchronously before cache clearing completes', async () => {
    let releaseClear: (() => void) | undefined
    const controller = createAdminCompatibilityController({
      cancelAndClear: () =>
        new Promise<void>((resolve) => {
          releaseClear = resolve
        }),
      reload: vi.fn(),
      storage: null,
    })
    renderBoundary(controller)

    let handling: Promise<boolean> | undefined
    act(() => {
      handling = controller.handleError(createAdminClientIncompatibleError(mismatch))
    })

    expect(screen.queryByText('Protected administrator feature')).toBeNull()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Stopping administrator operations')

    releaseClear?.()
    await act(async () => {
      await handling
    })
  })

  it('offers one user-triggered reload, then replaces the action with a busy state', async () => {
    const values = new Map<string, string>()
    const reload = vi.fn()
    const controller = createAdminCompatibilityController({
      cancelAndClear: vi.fn(),
      reload,
      storage: {
        getItem: (key) => values.get(key) ?? null,
        removeItem: (key) => values.delete(key),
        setItem: (key, value) => values.set(key, value),
      },
    })
    renderBoundary(controller)

    await act(async () => {
      await controller.handleError(createAdminClientIncompatibleError(mismatch))
    })
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading.textContent).toBe('Admin update available')
    expect(document.activeElement).toBe(heading)
    expect(document.title).toBe('Admin update available · admin')
    expect(screen.getByRole('alert').textContent).toContain(mismatch.requestId)

    fireEvent.click(screen.getByRole('button', { name: 'Reload admin' }))

    expect(reload).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Reload admin' })).toBeNull()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Reloading admin')
  })

  it('shows a terminal state without another reload after an attempted recovery', async () => {
    const controller = createAdminCompatibilityController({
      cancelAndClear: vi.fn(),
      reload: vi.fn(),
      storage: {
        getItem: () => 'attempted',
        removeItem: vi.fn(),
        setItem: vi.fn(),
      },
    })
    renderBoundary(controller)

    await act(async () => {
      await controller.handleError(createAdminClientIncompatibleError(mismatch))
    })

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Administrator update required')
    expect(screen.queryByRole('button', { name: 'Reload admin' })).toBeNull()
  })
})