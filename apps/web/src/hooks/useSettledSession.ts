import { useState } from 'react'
import { authClient } from '@/lib/auth-client'

/** Whether the session has loaded once in this page load; components mounted later don't show a loading state */
let settledOnce = false

/**
 * `authClient.useSession()` whose `isPending` is true only until the session has loaded once.
 *
 * Better Auth sets `isPending` again on every refetch while there is no session: on window focus, and on every
 * `$sessionSignal`, which the passkey client raises after each verify-authentication call, including a failed passkey
 * autofill (401). A page that swaps its content for a spinner while pending would then unmount and remount a signed-out
 * visitor's sign-in form (and its passkey autofill request) each time. With this, a refetch keeps the last answer on
 * screen until the new one arrives.
 *
 * The first render still matches the server's (pending, as the server never loads the session).
 */
export function useSettledSession() {
  const session = authClient.useSession()
  const [settled, setSettled] = useState(settledOnce)
  if (!settled && !session.isPending) {
    settledOnce = true
    setSettled(true)
  }
  return { ...session, isPending: session.isPending && !settled }
}