import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AppContextProvider } from '@/models/context/AppContext'
import { DXRank } from '../DXRank'

const renderRank = (rank: string | null) =>
  render(
    <AppContextProvider>
      <DXRank rank={rank} />
    </AppContextProvider>,
  )

describe('DXRank', () => {
  it('shows the rank artwork, described without duplicating DX', () => {
    renderRank('SSS')

    expect(screen.getByRole('img', { name: 'Rank SSS' }).getAttribute('src')).toBe(
      'https://shama.dxrating.net/images/rank/circle-plus/SSS.png',
    )
  })

  it('uses the placeholder instead of requesting a rank image when rank is missing', () => {
    const { container } = renderRank(null)

    expect(screen.queryByRole('img')).toBeNull()
    expect(container.querySelector('[src]')).toBeNull()
  })
})