import { VersionEnum } from '@gekichumai/dxdata'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { VersionMultiSelect, VersionPicker } from '../VersionPicker'

const AVAILABLE = [
  VersionEnum.FiNALE,
  VersionEnum.MiLK,
  VersionEnum.MiLKPLUS,
  VersionEnum.PRiSM,
  VersionEnum.PRiSMPLUS,
  VersionEnum.CiRCLE,
  VersionEnum.CiRCLEPLUS,
  VersionEnum.MAGiCAL,
]

function Filter({ initial }: { initial: VersionEnum[] }) {
  const [value, setValue] = useState<VersionEnum[]>(initial)
  return (
    <>
      <output data-testid="value">{value.join('|')}</output>
      <VersionMultiSelect
        available={AVAILABLE}
        value={value}
        onChange={setValue}
        label="Version"
        allLabel="All versions"
      />
    </>
  )
}

const openFilter = () => fireEvent.click(screen.getByRole('button', { name: /^Version:/ }))

describe('VersionPicker', () => {
  afterEach(cleanup)

  it('marks every chosen version and applies the draft only when closed', async () => {
    render(<Filter initial={[VersionEnum.PRiSM, VersionEnum.CiRCLEPLUS]} />)
    expect(screen.getByRole('button', { name: 'Version: CiRCLE PLUS, PRiSM' })).toBeTruthy()
    openFilter()

    const prism = await screen.findByRole('option', { name: 'PRiSM' })
    expect(prism.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('option', { name: 'PRiSM PLUS' }).getAttribute('aria-selected')).toBe('false')
    expect(screen.getByRole('listbox', { name: 'DX' }).getAttribute('aria-multiselectable')).toBe('true')

    fireEvent.click(screen.getByRole('option', { name: 'PRiSM PLUS' }))
    expect(screen.getByRole('option', { name: 'PRiSM PLUS' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByTestId('value').textContent).toBe('PRiSM|CiRCLE PLUS')

    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByTestId('value').textContent).toBe('PRiSM|CiRCLE PLUS|PRiSM PLUS')
  })

  it('selects all and clears', async () => {
    render(<Filter initial={[VersionEnum.MAGiCAL]} />)
    openFilter()
    fireEvent.click(await screen.findByRole('button', { name: 'Select all' }))
    expect(screen.getAllByRole('option', { selected: true, hidden: true })).toHaveLength(AVAILABLE.length)
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.queryAllByRole('option', { selected: true, hidden: true })).toHaveLength(0)
    fireEvent.click(screen.getByRole('option', { name: 'CiRCLE' }))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByTestId('value').textContent).toBe('CiRCLE')
  })

  it('opens on the classic page when the selection is there', async () => {
    render(<Filter initial={[VersionEnum.MiLK]} />)
    openFilter()
    const tab = await screen.findByRole('tab', { name: /Classic/ })
    expect(tab.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('option', { name: 'MiLK' })).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('option', { name: 'MiLK' })))
  })

  it('pairs each version with its PLUS and moves focus with the arrow keys', async () => {
    let picked: string | null = null
    render(
      <VersionPicker
        open
        onClose={() => {}}
        title="Choose"
        options={AVAILABLE.slice(3).map((version) => ({
          key: version,
          version,
          selected: version === VersionEnum.CiRCLE,
        }))}
        onPick={(option) => {
          picked = option.key
        }}
      />,
    )
    const circle = await screen.findByRole('option', { name: 'CiRCLE' })
    expect(circle.getAttribute('aria-selected')).toBe('true')
    // Single choice: a single list, not multiselectable, with one tab stop
    expect(screen.getByRole('listbox').getAttribute('aria-multiselectable')).toBeNull()
    expect(circle.tabIndex).toBe(0)
    // The PLUS sits right after its base
    expect(within(circle.closest('li')!).getByRole('option', { name: 'CiRCLE PLUS' })).toBeTruthy()

    circle.focus()
    fireEvent.keyDown(circle, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(screen.getByRole('option', { name: 'CiRCLE PLUS' }))
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' })
    fireEvent.click(document.activeElement!)
    expect(picked).toBe(VersionEnum.CiRCLEPLUS)
  })
})