import { AppContextProvider } from '@/models/context/AppContext'
import { initI18n } from '@/setup/init-i18n'
import { render, screen } from '@testing-library/react'
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

  it('names the selected version-region combobox and its logo image', () => {
    render(
      <AppContextProvider>
        <VersionRegionSwitcher />
      </AppContextProvider>,
    )

    expect(screen.getByRole('combobox', { name: 'Select DXData Version and Region' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'maimai DX CiRCLE PLUS logo' }).getAttribute('fetchpriority')).toBe('high')
  })
})