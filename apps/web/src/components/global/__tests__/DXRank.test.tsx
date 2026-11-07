import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DXRank } from '../DXRank'

vi.mock('@/models/context/useAppContext', () => ({
  useAppContextSlugVersion: () => 'circle-plus',
}))

describe('DXRank', () => {
  it('describes rank images without duplicating DX in the alt text', () => {
    render(<DXRank rank="SSS" />)

    expect(screen.getByRole('img', { name: 'Rank SSS' }).getAttribute('src')).toBe(
      'https://shama.dxrating.net/images/rank/circle-plus/SSS.png',
    )
  })

  it('uses the placeholder instead of requesting a rank image when rank is missing', () => {
    const { container } = render(<DXRank rank={null} className="h-8" />)

    expect(screen.queryByRole('img')).toBeNull()
    expect(container.firstElementChild?.className).toContain('bg-gray-200')
    expect(container.firstElementChild?.className).toContain('h-8')
  })
})