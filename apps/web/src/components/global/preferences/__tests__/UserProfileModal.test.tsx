import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { ActiveSaveContext, type ActiveSave } from '@/models/scores/ActiveSaveContext'
import { initI18n } from '@/setup/init-i18n'
import { UserProfileModal } from '../UserProfileModal'

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
      saveId: 'dsav_main',
      cloudRepository: null,
      setActiveSaveId: () => {},
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
})