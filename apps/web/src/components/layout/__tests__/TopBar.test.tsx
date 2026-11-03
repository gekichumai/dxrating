import { AppContextProvider } from '@/models/context/AppContext'
import { initI18n } from '@/setup/init-i18n'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { TopBar } from '../TopBar'

vi.mock('~icons/mdi/github', () => ({
  default: ({ className }: { className?: string }) => <svg className={className} />,
}))

vi.mock('~icons/simple-icons/discord', () => ({
  default: ({ className }: { className?: string }) => <svg className={className} />,
}))

vi.mock('~icons/simple-icons/modelcontextprotocol', () => ({
  default: ({ className }: { className?: string }) => <svg className={className} />,
}))

vi.mock('~icons/simple-icons/qq', () => ({
  default: ({ className }: { className?: string }) => <svg className={className} />,
}))

vi.mock('~icons/mdi/code-braces', () => ({
  default: ({ className }: { className?: string }) => <svg className={className} />,
}))

vi.mock('~icons/mdi/chevron-down', () => ({
  default: ({ className }: { className?: string }) => <svg className={className} />,
}))

vi.mock('../../global/Logo', () => ({
  Logo: () => <div>DXRating.net</div>,
}))

vi.mock('../../global/preferences/LocaleSelector', () => ({
  LocaleSelector: () => <button type="button" aria-label="Language" />,
}))

vi.mock('../../global/preferences/UserChip', () => ({
  UserChip: () => <button type="button" aria-label="User profile" />,
}))

vi.mock('../../global/site-meta/About', () => ({
  About: () => <button type="button" aria-label="About DXRating" />,
}))

vi.mock('../../../utils/bundle', () => ({
  BUNDLE: {
    version: 'v1.6.138',
    buildTime: new Date('2026-05-18T15:50:00.000Z'),
  },
}))

describe('TopBar', () => {
  beforeAll(() => {
    initI18n()
  })

  it('names icon-only community links for assistive technology', () => {
    render(
      <AppContextProvider>
        <TopBar />
      </AppContextProvider>,
    )

    expect(screen.getByRole('link', { name: 'Join the DXRating Discord server' }).getAttribute('href')).toBe(
      'https://discord.gg/8CFgUPxyrU',
    )
    expect(screen.getByRole('link', { name: 'Open DXRating on GitHub' }).getAttribute('href')).toBe(
      'https://github.com/gekichumai/dxrating',
    )
    expect(
      screen.getByRole('link', { name: 'Join the DXRating QQ group (developer chat)' }).getAttribute('href'),
    ).toMatch(/^https:\/\/qun\.qq\.com\//)
  })

  it('collects community links into one menu for small screens', () => {
    render(
      <AppContextProvider>
        <TopBar />
      </AppContextProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Community' }))

    const menu = screen.getByRole('menu')
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Discord', 'QQ group', 'GitHub', 'AI assistants (MCP)', 'Developers & API'])
    expect(within(menu).getByRole('menuitem', { name: 'AI assistants (MCP)' }).getAttribute('href')).toBe(
      'https://mcp.dxrating.net/?via=dxrating-home',
    )
    expect(within(menu).getByRole('menuitem', { name: 'Developers & API' }).getAttribute('href')).toBe('/developers')
  })

  it('links to the MCP setup guide with a descriptive label', () => {
    render(
      <AppContextProvider>
        <TopBar />
      </AppContextProvider>,
    )

    expect(
      screen
        .getByRole('link', { name: 'Use DXRating in AI assistants like Claude, ChatGPT and Cursor (MCP server)' })
        .getAttribute('href'),
    ).toBe('https://mcp.dxrating.net/?via=dxrating-home')
  })

  it('links to the developer page next to the MCP entry', () => {
    render(
      <AppContextProvider>
        <TopBar />
      </AppContextProvider>,
    )

    expect(
      screen.getByRole('link', { name: 'Developers: public API, OpenAPI spec and docs' }).getAttribute('href'),
    ).toBe('/developers')
  })

  it('uses a higher contrast version stamp over the themed header color', () => {
    render(
      <AppContextProvider>
        <TopBar />
      </AppContextProvider>,
    )

    expect(screen.getByText(/v1\.6\.138/).className).toContain('text-black/75')
  })
})