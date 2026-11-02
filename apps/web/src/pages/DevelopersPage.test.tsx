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
    expect(screen.getByText('https://miruku.dxrating.net/api/v1')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Set up MCP' }).getAttribute('href')).toContain('https://mcp.dxrating.net/')
    expect(screen.getByRole('link', { name: 'API docs' }).getAttribute('href')).toBe('https://miruku.dxrating.net/docs')
    expect(screen.getByRole('link', { name: 'OpenAPI' }).getAttribute('href')).toBe(
      'https://miruku.dxrating.net/spec.json',
    )
    expect(screen.getByRole('link', { name: 'dxdata' }).getAttribute('href')).toBe(
      'https://miruku.dxrating.net/api/v1/dxdata',
    )
  })

  it('states the dxdata license and how to credit it', () => {
    render(<DevelopersPage />)

    expect(screen.getByRole('heading', { level: 2, name: 'Terms' })).toBeTruthy()
    expect(screen.getByText('Data from DXRating (dxrating.net), CC BY-NC 4.0')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'CC BY-NC 4.0' }).getAttribute('href')).toBe(
      'https://creativecommons.org/licenses/by-nc/4.0/',
    )
  })
})