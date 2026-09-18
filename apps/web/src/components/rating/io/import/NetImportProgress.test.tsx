import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initI18n } from '@/setup/init-i18n'
import { NetImportProgress } from './NetImportProgress'
import { NetImportSettingsProvider } from './NetImportSettingsContext'
import { NetImportSettingsButton } from './NetImportSettingsButton'
import { importFromNETRecords } from './importFromNETRecords'
import { netImportProgress } from './netImportProgressStore'

vi.mock('./importFromNETRecords', () => ({ importFromNETRecords: vi.fn() }))
vi.mock('@/models/context/useAppContext', () => ({ useAppContextDXDataVersion: () => 'circle-plus' }))

beforeAll(() => initI18n())
beforeEach(() => {
  vi.clearAllMocks()
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  })
  netImportProgress.update(null)
})
afterEach(cleanup)

const start = () => netImportProgress.update({ status: 'running', stage: 'auth:succeeded', progress: 0.2 })

describe('floating NET import progress', () => {
  it('starts compact, shows live progress on demand, and restores focus on Escape', async () => {
    start()
    render(<NetImportProgress />, { wrapper: NetImportSettingsProvider })
    expect(screen.queryByRole('region')).toBeNull()
    const trigger = screen.getByRole('button', { name: /Show import progress/ })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(trigger)
    expect(screen.getByRole('progressbar').getAttribute('value')).toBe('20')
    act(() => netImportProgress.update({ status: 'running', stage: 'fetch:music:in-progress:master', progress: 0.7 }))
    expect(screen.getByText('Fetching MASTER scores')).toBeTruthy()
    expect(screen.getByRole('progressbar').getAttribute('value')).toBe('70')
    fireEvent.keyDown(screen.getByRole('region'), { key: 'Escape' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger)
    await waitFor(() => expect(screen.queryByRole('region')).toBeNull())
    expect(netImportProgress.getSnapshot()?.status).toBe('running')
  })

  it('opens the shared settings dialog from progress and returns focus to the circle', async () => {
    start()
    render(<NetImportProgress />, { wrapper: NetImportSettingsProvider })
    const trigger = screen.getByRole('button', { name: /Show import progress/ })
    fireEvent.click(trigger)
    expect(screen.queryByRole('radio')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Auto-import settings' }))
    expect(screen.getByRole('dialog', { name: 'Auto-import settings' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Importing...' }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(trigger))
    expect(netImportProgress.getSnapshot()?.status).toBe('running')
  })

  it.each(['success', 'error'] as const)('retains %s details until dismissed', (status) => {
    start()
    render(<NetImportProgress />, { wrapper: NetImportSettingsProvider })
    act(() => netImportProgress.finish(status, 'Result details'))
    fireEvent.click(screen.getByRole('button', { name: /Show import progress/ }))
    expect(screen.getByText('Result details')).toBeTruthy()
    expect(screen.queryByRole('progressbar')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('renders no server markup even when a client import snapshot exists', () => {
    start()
    expect(renderToString(<NetImportProgress />)).toBe('')
  })
})
describe('global auto-import settings', () => {
  it('sets up remembered credentials and auto-import without starting an import', async () => {
    render(<NetImportSettingsButton />, { wrapper: NetImportSettingsProvider })
    const trigger = screen.getByRole('button', { name: 'Auto-import' })
    fireEvent.click(trigger)
    for (const radio of screen.getAllByRole('radio')) expect(radio.hasAttribute('disabled')).toBe(true)
    fireEvent.change(screen.getByLabelText('Your Sega ID'), { target: { value: 'fixture' } })
    fireEvent.change(screen.getByLabelText('Your Sega ID Password'), { target: { value: 'fixture-password' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Remember Credentials/ }))
    fireEvent.click(screen.getByRole('radio', { name: /^Merge/ }))
    expect(JSON.parse(localStorage.getItem('import-net-records')!)).toEqual({
      region: 'intl',
      username: 'fixture',
      password: 'fixture-password',
    })
    expect(localStorage.getItem('rating-auto-import-from-net')).toBe('"merge"')
    expect(importFromNETRecords).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    fireEvent.click(trigger)
    expect((screen.getByLabelText('Your Sega ID') as HTMLInputElement).value).toBe('fixture')
    expect((screen.getByRole('radio', { name: /^Merge/ }) as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByRole('checkbox', { name: /Remember Credentials/ }))
    expect(localStorage.getItem('import-net-records')).toBeNull()
    expect(localStorage.getItem('rating-auto-import-from-net')).toBe('false')
  })

  it('keeps the dialog open when the page that opened it unmounts', () => {
    const { rerender } = render(
      <NetImportSettingsProvider>
        <NetImportSettingsButton />
      </NetImportSettingsProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Auto-import' }))
    rerender(
      <NetImportSettingsProvider>
        <p>Another page</p>
      </NetImportSettingsProvider>,
    )
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('dialog', { name: 'Auto-import settings' })).toBeTruthy()
  })

  it('reads current settings on reopen and disables auto-import with a boolean', async () => {
    localStorage.setItem(
      'import-net-records',
      JSON.stringify({ region: 'jp', username: 'fixture', password: 'fixture' }),
    )
    render(<NetImportSettingsButton />, { wrapper: NetImportSettingsProvider })
    fireEvent.click(screen.getByRole('button', { name: 'Auto-import' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    localStorage.setItem('rating-auto-import-from-net', '"merge"')
    fireEvent.click(screen.getByRole('button', { name: 'Auto-import' }))
    expect((screen.getByRole('radio', { name: /^Merge/ }) as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: 'Disabled' }))
    expect(localStorage.getItem('rating-auto-import-from-net')).toBe('false')
  })

  it('starts a manual import with saved options and closes the dialog', async () => {
    localStorage.setItem(
      'import-net-records',
      JSON.stringify({ region: 'jp', username: 'fixture', password: 'fixture' }),
    )
    localStorage.setItem('rating-auto-import-from-net', '"merge"')
    render(<NetImportSettingsButton />, { wrapper: NetImportSettingsProvider })
    fireEvent.click(screen.getByRole('button', { name: 'Auto-import' }))
    fireEvent.click(screen.getByRole('button', { name: /Re-import Now/ }))
    expect(importFromNETRecords).toHaveBeenCalledWith('circle-plus', expect.anything(), 'merge', undefined, {
      region: 'jp',
      username: 'fixture',
      password: 'fixture',
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})