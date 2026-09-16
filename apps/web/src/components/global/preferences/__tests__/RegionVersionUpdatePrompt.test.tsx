import { AppContextProvider, type AppContextStates } from '@/models/context/AppContext'
import { useAppContext } from '@/models/context/useAppContext'
import { initI18n } from '@/setup/init-i18n'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { RegionVersionUpdatePrompt } from '../RegionVersionUpdatePrompt'
import { VersionRegionSwitcher } from '../VersionRegionSwitcher'

vi.mock('~icons/mdi/information', () => ({ default: () => <svg /> }))

function CurrentSelection() {
  const { version, region } = useAppContext()
  return (
    <output>
      {version}:{region}
    </output>
  )
}

function mount() {
  return render(
    <AppContextProvider>
      <CurrentSelection />
      <RegionVersionUpdatePrompt />
      <VersionRegionSwitcher />
    </AppContextProvider>,
  )
}

let storage: Map<string, string>
function saveSelection(version: AppContextStates['version'], region: AppContextStates['region']) {
  storage.set('app-context', JSON.stringify({ version, region }))
}

describe('regional version updates', () => {
  beforeAll(() => initI18n())
  beforeEach(() => {
    cleanup()
    storage = new Map()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    })
  })

  it('keeps the saved Japan version until the user accepts, then persists the upgrade', () => {
    saveSelection('circle-plus', 'jp')
    mount()
    expect(screen.getByRole('status', { hidden: true }).textContent).toBe('circle-plus:jp')
    expect(screen.getByRole('dialog').textContent).toContain('Japan now has MAGiCAL')
    expect(JSON.parse(storage.get('app-context')!).version).toBe('circle-plus')
    fireEvent.click(screen.getByRole('button', { name: 'Use MAGiCAL' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('status', { hidden: true }).textContent).toBe('magical:jp')
    expect(JSON.parse(storage.get('app-context')!)).toEqual({ version: 'magical', region: 'jp' })
  })

  it('retains a declined version and does not ask again on reload', () => {
    saveSelection('circle', 'intl')
    const view = mount()
    fireEvent.click(screen.getByRole('button', { name: 'Keep CiRCLE' }))
    expect(screen.getByRole('status', { hidden: true }).textContent).toBe('circle:intl')
    expect(screen.getByRole('combobox').textContent).toContain('International')
    view.unmount()
    mount()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('status', { hidden: true }).textContent).toBe('circle:intl')
    fireEvent.mouseDown(screen.getByRole('combobox'))
    expect(screen.getByRole('option', { name: 'CiRCLE · International' })).toBeTruthy()
    expect(screen.getByRole('option', { name: /CiRCLE PLUS.*International/ })).toBeTruthy()
  })

  it('asks for a new release even when an earlier release was declined', () => {
    saveSelection('circle', 'jp')
    storage.set('region-version-update-dismissed:jp:circle-plus', 'true')
    mount()
    expect(screen.getByRole('button', { name: 'Use MAGiCAL' })).toBeTruthy()
  })

  it.each([
    ['magical', 'jp'],
    ['circle-plus', 'intl'],
    ['prism', 'cn'],
    ['magical', 'intl'],
    ['circle', '_generic'],
  ] as const)('does not prompt for %s in %s', (version, region) => {
    saveSelection(version, region)
    mount()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('status', { hidden: true }).textContent).toBe(`${version}:${region}`)
  })

  it('does not prompt new visitors', () => {
    mount()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('allows declining and accepting when storage writes fail', () => {
    saveSelection('circle-plus', 'jp')
    window.localStorage.setItem = () => {
      throw new Error('blocked')
    }
    const view = mount()
    fireEvent.click(screen.getByRole('button', { name: 'Keep CiRCLE PLUS' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    view.unmount()
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Use MAGiCAL' }))
    expect(screen.getByRole('status', { hidden: true }).textContent).toBe('magical:jp')
  })
})