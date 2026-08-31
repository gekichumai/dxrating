import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'
import { initI18n } from '@/setup/init-i18n'
import { DevelopersPage } from './DevelopersPage'

describe('DevelopersPage', () => {
  beforeAll(() => {
    initI18n()
  })

  it('renders authoritative API and agent discovery resources', () => {
    render(<DevelopersPage />)

    expect(screen.getByRole('heading', { level: 1, name: 'DXRating API and agent resources' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'https://miruku.dxrating.net/api/v1' }).getAttribute('href')).toBe(
      'https://miruku.dxrating.net/api/v1',
    )
    expect(screen.getByRole('link', { name: 'https://miruku.dxrating.net/spec.json' }).getAttribute('href')).toBe(
      'https://miruku.dxrating.net/spec.json',
    )
    expect(screen.getByRole('link', { name: 'https://dxrating.net/.well-known/api-catalog' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'https://dxrating.net/llms.txt' })).toBeTruthy()
  })
})