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

  it('uses a higher contrast version stamp over the themed header color', () => {
    render(
      <AppContextProvider>
        <TopBar />
      </AppContextProvider>,
    )

    expect(screen.getByText(/v1\.6\.138/).className).toContain('text-black/75')
  })

  it('shows no sync status on the local save', () => {
    render(
      <AppContextProvider>
        <TopBar />
      </AppContextProvider>,
    )
    expect(screen.queryByRole('button', { name: /^Cloud save/ })).toBeNull()
  })

  it('keeps the local-save header unchanged: full community trigger, usual icon button padding', () => {
    const { container } = render(
      <AppContextProvider>
        <TopBar />
      </AppContextProvider>,
    )
    const trigger = screen.getByRole('button', { name: 'Community' })
    expect(trigger.hasAttribute('data-compact')).toBe(false)
    expect(trigger.className).toContain('2xs:p-1')
    // Discord, QQ and GitHub, then the MCP and API badges (shown from 375px and 480px)
    // The badges, not the ripple
    const badges = [...trigger.children].filter((child) => child.className.includes('rounded-full'))
    expect(badges).toHaveLength(5)
    expect(badges[3]?.className).toContain('2xs:flex')
    expect(badges[0]?.getAttribute('style')).toBeNull()
    const row = container.querySelector('[class*="MuiIconButton-root"]')
    expect(row?.hasAttribute('data-sync-pill')).toBe(false)
    expect(row?.className).toContain('[&_.MuiIconButton-root]:p-1.5')
  })

  it('makes room for the sync pill below 480px: compact community trigger, tighter icon buttons below 375px', () => {
    const { container } = render(
      <AppContextProvider>
        <CloudSaveUiContext.Provider
          value={cloudUi({ state: 'error', pendingCount: 3, lastSyncedRevision: 3, issues: [] })}
        >
          <TopBar />
        </CloudSaveUiContext.Provider>
      </AppContextProvider>,
    )
    const trigger = screen.getByRole('button', { name: 'Community' })
    expect(trigger.getAttribute('data-compact')).toBe('true')
    expect(trigger.className).toContain('xs:p-1')
    expect(trigger.className).not.toContain('2xs:p-1')
    // The badges, not the ripple
    const badges = [...trigger.children].filter((child) => child.className.includes('rounded-full'))
    // The three community badges stay; the MCP badge waits for 480px (the menu still lists it)
    expect(badges[0]?.className).toContain('size-5')
    expect(badges[3]?.className).toContain('xs:flex')
    expect(badges[3]?.className).not.toContain('2xs:flex')
    // Discord stays on top of the tight stack
    expect((badges[0] as HTMLElement).style.zIndex).toBe('3')
    expect((badges[2] as HTMLElement).style.zIndex).toBe('1')
    const row = container.querySelector('[data-sync-pill="true"]')
    expect(row?.className).toContain('[&_.MuiIconButton-root]:p-1')
    expect(row?.className).not.toContain('[&_.MuiIconButton-root]:p-1.5')
    expect(row?.className).toContain('2xs:[&_.MuiIconButton-root]:p-2')
    // Every header control still renders
    for (const name of ['Language', 'About DXRating', 'User profile'])
      expect(screen.getByRole('button', { name })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Cloud save/ })).toBeTruthy()

    fireEvent.click(trigger)
    expect(within(screen.getByRole('menu')).getAllByRole('menuitem')).toHaveLength(5)
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