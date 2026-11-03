import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'
import { initI18n } from '@/setup/init-i18n'
import { DevelopersPage } from './DevelopersPage'

describe('DevelopersPage', () => {
  beforeAll(() => {
    initI18n()
  })

  it('offers the MCP server and the REST API, each with one primary action', () => {
    render(<DevelopersPage />)

    expect(screen.getByRole('heading', { level: 1, name: 'Build with DXRating' })).toBeTruthy()
    expect(screen.getByText('https://mcp.dxrating.net/mcp')).toBeTruthy()
    expect(screen.getByText('https://miruku.dxrating.net/api/v1/dxdata')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Set up MCP' }).getAttribute('href')).toContain('https://mcp.dxrating.net/')
    expect(screen.getByRole('link', { name: 'API docs' }).getAttribute('href')).toBe('https://miruku.dxrating.net/docs')
    expect(screen.getByRole('link', { name: 'OpenAPI' }).getAttribute('href')).toBe(
      'https://miruku.dxrating.net/spec.json',
    )
    expect(screen.getAllByRole('link', { name: 'Changelog' })[0].getAttribute('href')).toBe(
      'https://github.com/gekichumai/dxrating/issues/427',
    )
  })

  it('states data terms and how to credit DXRating', () => {
    render(<DevelopersPage />)

    expect(screen.getByRole('heading', { level: 2, name: 'Terms' })).toBeTruthy()
    expect(screen.getByText('Data from DXRating (dxrating.net)')).toBeTruthy()
    expect(screen.queryByText(/CC BY-NC/)).toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: 'API stability' })).toBeTruthy()
  })
})