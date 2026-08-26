import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TranslationProvider, translate } from '../i18n'
import { AdminRouteError, RouteLoading } from './route-states'

const renderState = (state: React.ReactNode) =>
  render(
    <TranslationProvider>
      <MantineProvider>{state}</MantineProvider>
    </TranslationProvider>,
  )

describe('administrator route states', () => {
  it('announces the shared loading skeleton', () => {
    renderState(<RouteLoading />)
    expect(screen.getByRole('status', { name: translate('loading.label') })).toBeTruthy()
  })

  it('offers a retry without exposing the thrown error', () => {
    const reset = vi.fn()
    renderState(<AdminRouteError error={new Error('sensitive details')} info={{ componentStack: '' }} reset={reset} />)

    expect(screen.queryByText('sensitive details')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: translate('routeError.title') }))
    expect(document.title).toBe(`${translate('routeError.title')} · ${translate('app.name')}`)
    fireEvent.click(screen.getByRole('button', { name: translate('actions.retry') }))
    expect(reset).toHaveBeenCalledOnce()
  })
})