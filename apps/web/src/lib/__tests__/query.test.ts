import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { requestQuery, resetQueriesOnAccountChange } from '../query'

type State = { data?: { user?: { id: string } } | null; isPending: boolean }

const sessionStore = (initial: State) => {
  let state = initial
  const listeners = new Set<(state: State) => void>()
  return {
    subscribe: (listener: (state: State) => void) => {
      listeners.add(listener)
      listener(state)
      return () => void listeners.delete(listener)
    },
    set: (next: State) => {
      state = next
      for (const listener of listeners) listener(state)
    },
  }
}

const signedIn = (id: string): State => ({ data: { user: { id } }, isPending: false })
const signedOut: State = { data: null, isPending: false }

describe('resetQueriesOnAccountChange', () => {
  it("never shows one account's cached response to the next, though the key does not name the account", async () => {
    const queryClient = new QueryClient()
    const session = sessionStore({ isPending: true })
    resetQueriesOnAccountChange(queryClient, session)
    let account = 'a'
    const observer = new QueryObserver(
      queryClient,
      requestQuery('comments', { sheet: 1 }, async () => `comments as ${account} sees them`),
    )
    const seen: unknown[] = []
    observer.subscribe((result) => seen.push(result.data))
    session.set(signedIn('a'))
    await queryClient.refetchQueries()
    expect(observer.getCurrentResult().data).toBe('comments as a sees them')

    account = 'b'
    seen.length = 0
    session.set(signedIn('b'))
    expect(observer.getCurrentResult().data).toBeUndefined()
    await queryClient.refetchQueries()
    expect(observer.getCurrentResult().data).toBe('comments as b sees them')
    expect(seen).not.toContain('comments as a sees them')
  })

  it('drops cached responses on sign-out, and keeps them while the session first loads or stays the same', async () => {
    const queryClient = new QueryClient()
    const session = sessionStore({ isPending: true })
    resetQueriesOnAccountChange(queryClient, session)
    const { queryKey } = requestQuery('tags', null, async () => 'tags')
    queryClient.setQueryData(queryKey, 'before the session loaded')

    session.set(signedIn('a'))
    session.set(signedIn('a'))
    expect(queryClient.getQueryData(queryKey)).toBe('before the session loaded')

    session.set(signedOut)
    expect(queryClient.getQueryData(queryKey)).toBeUndefined()
  })
})