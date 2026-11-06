import { AppContextProvider } from '@/models/context/AppContext'
import { initI18n } from '@/setup/init-i18n'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { TopBar } from '../TopBar'
import { type CloudSaveUi, CloudSaveUiContext } from '@/models/scores/CloudSaveUiContext'

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

// ThemeSelector needs MUI's CssVarsProvider; its own behaviour is not under test here
vi.mock('../../global/preferences/ThemeSelector', () => ({
  ThemeSelector: () => <button type="button" aria-label="Appearance" />,
  DisplayPreferencesMenu: () => <button type="button" aria-label="Language and appearance" />,
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

function cloudUi(status: CloudSaveUi['controller']['status']): CloudSaveUi {
  return {
    controller: {
      kind: 'cloud',
      saveId: 'dsav_main',
      status,
      subscribe: () => () => {},
      get: () => undefined,
      reapplyIssue: () => {},
      dismissIssue: () => {},
      listImportJobs: async () => [],
    },
    listSaves: async () => [],
    setActiveSaveId: () => {},
  }
}

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

  it('uses the primary text token for the version stamp on the tinted header', () => {
    render(
      <AppContextProvider>
        <TopBar />
      </AppContextProvider>,
    )

    expect(screen.getByText(/v1\.6\.138/).className).toContain('text-fg-1')
  })

  it('shows no sync status on the local save', () => {
    render(
      <AppContextProvider>
        <TopBar />
      </AppContextProvider>,
    )
    expect(screen.queryByRole('button', { name: /^Cloud save/ })).toBeNull()
  })

  it('puts the sync pill in the header action pill, before the account button, and keeps every other control', () => {
    render(
      <AppContextProvider>
        <CloudSaveUiContext.Provider
          value={cloudUi({ state: 'error', pendingCount: 3, lastSyncedRevision: 3, issues: [] })}
        >
          <TopBar />
        </CloudSaveUiContext.Provider>
      </AppContextProvider>,
    )
    const sync = screen.getByRole('button', { name: /^Cloud save/ })
    const account = screen.getByRole('button', { name: 'User profile' })
    // Same glass pill, and the sync state sits right before the account it belongs to
    expect(sync.parentElement).toBe(account.parentElement)
    expect(sync.compareDocumentPosition(account) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(sync.className).toContain('size-9')
    for (const name of ['Community', 'About DXRating']) expect(screen.getByRole('button', { name })).toBeTruthy()
    // Below 375px the sync pill takes the community menu's place, so the pill keeps the local-save width
    const community = screen.getByRole('button', { name: 'Community' }).closest('[data-sync-pill]')
    expect(community?.className).toContain('hidden')
    expect(community?.className).toContain('2xs:flex')
  })

  it('shows the sync status while a cloud save is active', () => {
    const status = { state: 'offline', pendingCount: 2, lastSyncedRevision: 3, issues: [] } as const
    const ui = {
      controller: {
        kind: 'cloud',
        saveId: 'dsav_main',
        status,
        subscribe: () => () => {},
        get: () => undefined,
        reapplyIssue: () => {},
        dismissIssue: () => {},
        listImportJobs: async () => [],
      },
      listSaves: async () => [],
      setActiveSaveId: () => {},
    } satisfies CloudSaveUi
    render(
      <AppContextProvider>
        <CloudSaveUiContext.Provider value={ui}>
          <TopBar />
        </CloudSaveUiContext.Provider>
      </AppContextProvider>,
    )
    expect(screen.getByRole('button', { name: 'Cloud save, Offline, 2 changes waiting to sync' })).toBeTruthy()
  })
})