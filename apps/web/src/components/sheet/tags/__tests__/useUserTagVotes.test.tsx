import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { SWRConfig } from 'swr'
import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  session: null as null | { session: { id: string }; user: { id: string } },
  votesByUser: {} as Record<string, Record<string, number>>,
}))

vi.mock('../../../../lib/auth-client', () => ({
  authClient: { useSession: () => ({ data: state.session }) },
}))

vi.mock('../../../../lib/orpc', () => ({
  apiClient: {
    tags: {
      // Answers as the account that is signed in when the request is made, like the real endpoint.
      userVotes: vi.fn(async () => state.votesByUser[state.session?.user.id ?? ''] ?? {}),
    },
  },
}))

const { useUserTagVotes } = await import('../useSheetTagsDetailed')

const wrapper = ({ children }: { children: ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
)

const signIn = (userId: string) => {
  state.session = { session: { id: `session-${userId}` }, user: { id: userId } }
}

afterEach(cleanup)

describe('useUserTagVotes', () => {
  it("never shows the previous account's votes after switching accounts", async () => {
    state.votesByUser = { a: { '42': 1 }, b: {} }
    signIn('a')
    const { result, rerender } = renderHook(() => useUserTagVotes([42]), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual({ '42': 1 }))

    act(() => signIn('b'))
    rerender()
    expect(result.current.data).toEqual({})
    await waitFor(() => expect(result.current.data).toEqual({}))
  })

  it('does not fetch while signed out', async () => {
    state.session = null
    const { result } = renderHook(() => useUserTagVotes([42]), { wrapper })
    expect(result.current.data).toEqual({})
  })
})