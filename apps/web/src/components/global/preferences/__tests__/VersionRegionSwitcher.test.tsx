import { AppContextProvider } from '@/models/context/AppContext'
import { initI18n } from '@/setup/init-i18n'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import { VersionRegionSwitcher } from '../VersionRegionSwitcher'

vi.mock('~icons/mdi/information', () => ({
  default: ({ className }: { className?: string }) => <svg className={className} />,
}))

describe('VersionRegionSwitcher', () => {
  beforeAll(() => {
    initI18n()
  })

  it('offers the current regional releases', async () => {
    render(
      <AppContextProvider>
        <VersionRegionSwitcher />
      </AppContextProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: /^Choose game version and region/ }))
    expect(await screen.findByRole('option', { name: /MAGiCAL.*Japan/i })).toBeTruthy()
    expect(await screen.findByRole('option', { name: /CiRCLE PLUS.*International/i })).toBeTruthy()
  })

  it('names the selected version-region combobox and its logo image', () => {
    render(
      <AppContextProvider>
        <VersionRegionSwitcher />
      </AppContextProvider>,
    )

    expect(screen.getByRole('button', { name: /^Choose game version and region: MAGiCAL · Japan$/ })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'MAGiCAL logo' }).getAttribute('fetchpriority')).toBe('high')
  })

  it('applies a pick once the picker has closed, so the wipe is not hidden behind it', async () => {
    render(
      <AppContextProvider>
        <VersionRegionSwitcher />
      </AppContextProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: /^Choose game version and region/ }))
    fireEvent.click(await screen.findByRole('option', { name: /CiRCLE PLUS.*International/i }))

    // Still the old choice while the picker is closing, but marked busy so the wait is announced
    const trigger = screen.getByRole('button', { name: /MAGiCAL · Japan$/, hidden: true })
    expect(trigger.getAttribute('aria-busy')).toBe('true')
    await waitFor(
      () => {
        expect(screen.queryByRole('dialog')).toBeNull()
        expect(
          screen.getByRole('button', { name: /^Choose game version and region: CiRCLE PLUS · International$/ }),
        ).toBeTruthy()
        expect(screen.getByRole('button', { name: /CiRCLE PLUS · International$/ }).hasAttribute('aria-busy')).toBe(
          false,
        )
      },
      { timeout: 3000 },
    )
  })
})