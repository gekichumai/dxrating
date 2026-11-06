import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { ActiveSaveContext, type ActiveSave } from '@/models/scores/ActiveSaveContext'
import { initI18n } from '@/setup/init-i18n'
import { UserProfileModal } from '../UserProfileModal'
import { VersionEnum } from '@gekichumai/dxdata'
import { catalogSnapshot } from '@gekichumai/dxdata/snapshot'
import { getSongCatalog } from '@gekichumai/maimai-domain'
import { CloudSaveUiContext } from '@/models/scores/CloudSaveUiContext'
import { createDemoCloudSave } from '@/models/scores/demoCloudSave'

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn(async () => ({})) }))

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: () => ({
      data: { user: { id: 'user-1', name: 'Demo', email: 'demo@example.com', image: null } },
      isPending: false,
    }),
    signOut,
    listAccounts: vi.fn(async () => ({ data: [] })),
  },
}))

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))

describe('UserProfileModal', () => {
  beforeAll(() => {
    initI18n()
  })

  it('flushes the cloud save before signing out', async () => {
    const order: string[] = []
    let finishFlush: () => void = () => {}
    const activeSave: ActiveSave = {
      kind: 'cloud',
      decided: true,
      saveId: 'dsav_main',
      cloudRepository: null,
      setActiveSaveId: () => {},
      listSaves: async () => [],
      userId: 'user-1',
      features: null,
      refreshFeatures: () => {},
      flushBeforeSignOut: () =>
        new Promise<void>((resolve) => {
          order.push('flush')
          finishFlush = () => {
            order.push('flushed')
            resolve()
          }
        }),
    }
    signOut.mockImplementation(async () => {
      order.push('sign-out')
      return {}
    })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <ActiveSaveContext.Provider value={activeSave}>{children}</ActiveSaveContext.Provider>
      </QueryClientProvider>
    )

    render(<UserProfileModal open onClose={() => {}} />, { wrapper })
    fireEvent.click(screen.getAllByRole('button', { name: /^Log out$|^Sign out$/ })[0]!)
    const confirm = await screen.findAllByRole('button', { name: /^Log out$|^Sign out$/ })
    fireEvent.click(confirm.at(-1)!)

    await waitFor(() => expect(order).toEqual(['flush']))
    expect(signOut).not.toHaveBeenCalled()
    finishFlush()
    await waitFor(() => expect(order).toEqual(['flush', 'flushed', 'sign-out']))
  })

  it('lists the cloud save section only while a cloud save is active', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const local = render(
      <QueryClientProvider client={queryClient}>
        <UserProfileModal open onClose={() => {}} />
      </QueryClientProvider>,
    )
    expect(screen.queryByRole('button', { name: 'Cloud save' })).toBeNull()
    local.unmount()

    const { ui } = createDemoCloudSave(getSongCatalog(catalogSnapshot, VersionEnum.PRiSMPLUS))
    render(
      <QueryClientProvider client={queryClient}>
        <CloudSaveUiContext.Provider value={ui}>
          <UserProfileModal open onClose={() => {}} />
        </CloudSaveUiContext.Provider>
      </QueryClientProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cloud save' }))
    expect(await screen.findByRole('region', { name: 'Saves' })).toBeTruthy()
    expect((await screen.findAllByText('Main card')).length).toBeGreaterThan(0)
  })

  it('lists the cloud save section when the server enables cloud save or offers the beta, on the local save too', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const base: ActiveSave = {
      kind: 'local',
      decided: true,
      saveId: null,
      cloudRepository: null,
      setActiveSaveId: () => {},
      listSaves: async () => [],
      flushBeforeSignOut: async () => {},
      userId: 'user-1',
      features: null,
      refreshFeatures: () => {},
    }
    for (const [features, listed] of [
      [{ cloudSave: true, serverImports: true, optInAvailable: false }, true],
      [{ cloudSave: false, serverImports: false, optInAvailable: true }, true],
      [{ cloudSave: false, serverImports: false, optInAvailable: false }, false],
    ] as const) {
      const view = render(
        <QueryClientProvider client={queryClient}>
          <ActiveSaveContext.Provider value={{ ...base, features }}>
            <UserProfileModal open onClose={() => {}} />
          </ActiveSaveContext.Provider>
        </QueryClientProvider>,
      )
      expect(screen.queryByRole('button', { name: 'Cloud save' }) !== null).toBe(listed)
      view.unmount()
    }
  })

  it('on phones, lists the cloud save section with the other three', () => {
    const width = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 360 })
    try {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      const { ui } = createDemoCloudSave(getSongCatalog(catalogSnapshot, VersionEnum.PRiSMPLUS))
      render(
        <QueryClientProvider client={queryClient}>
          <CloudSaveUiContext.Provider value={ui}>
            <UserProfileModal open onClose={() => {}} />
          </CloudSaveUiContext.Provider>
        </QueryClientProvider>,
      )
      const tab = screen.getByRole('button', { name: 'Cloud save' })
      expect(tab.closest('ul')?.children).toHaveLength(4)
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
    }
  })
})