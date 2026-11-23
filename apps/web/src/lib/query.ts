import { queryOptions, type QueryClient } from '@tanstack/react-query'

/**
 * Query options keyed by the request they send: `load` gets the request back from the key. Put in the request every
 * value the response depends on that `load` does not get from the signed-in account, such as the catalog it resolves
 * against: a value `load` reads from elsewhere and the request leaves out keeps the stale response.
 */
export const requestQuery = <const Request, Data>(
  name: string,
  request: Request,
  load: (request: Request) => Promise<Data>,
) => queryOptions({ queryKey: [name, request] as const, queryFn: ({ queryKey }) => load(queryKey[1] as Request) })

/** Matches every {@link requestQuery} of `name`, whatever its request */
export const requestQueriesNamed = (name: string) => ({ queryKey: [name] })

/** The session as Better Auth's session store reports it */
type SessionState = { data?: { user?: { id: string } } | null; isPending: boolean }

/**
 * Drops every cached response, and refetches those on screen, when the signed-in account changes (sign in, sign out,
 * another account). Requests carry the account's cookie rather than naming the account, so no query key holds it: a
 * response cached for one account is never shown to the next, whatever its key. Returns the unsubscribe.
 */
export const resetQueriesOnAccountChange = (
  queryClient: QueryClient,
  session: { subscribe: (listener: (state: SessionState) => void) => () => void },
) => {
  // undefined until the session first settles: queries made before that were sent with the same cookie
  let account: string | null | undefined
  return session.subscribe(({ data, isPending }) => {
    if (isPending) return
    const next = data?.user?.id ?? null
    if (account !== undefined && next !== account) void queryClient.resetQueries()
    account = next
  })
}