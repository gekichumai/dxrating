import { useRouter, useRouterState } from '@tanstack/react-router'
import { useEffect, useSyncExternalStore } from 'react'

/**
 * The page each history entry was reached from, within this visit: so a page can offer a way back to where the
 * visitor came from (e.g. "← Home" on New charts after Home's "See all"). Kept in memory per history entry key, so
 * Back and Forward land on entries that still know their origin; a reload starts empty, and nothing reaches the
 * server, so server and cached HTML never depend on it.
 */
/** The page an entry was reached from: its path, and its full href (search included) to return to */
export type NavigationOrigin = { pathname: string; href: string }

const originByEntry = new Map<string, NavigationOrigin>()
const listeners = new Set<() => void>()
let version = 0

type LocationLike = {
  pathname: string
  href: string
  state: { __TSR_key?: string; key?: string; __TSR_index?: number }
}

const entryKey = (location: LocationLike | undefined) => location?.state.__TSR_key ?? location?.state.key

/**
 * Records where an entry was reached from, but only when that is certain: `from` sits right before it in the history
 * stack (a push lands one index after the entry it left, and Forward does too). A replace within one page keeps the
 * origin of the entry it replaces. Any other move (Back, a jump, an old entry revisited after a reload emptied this
 * map) says nothing about the entry before the destination, so nothing is recorded and no way back is offered.
 */
export const recordNavigationOrigin = (from: LocationLike | undefined, to: LocationLike) => {
  const toKey = entryKey(to)
  const fromIndex = from?.state.__TSR_index
  const toIndex = to.state.__TSR_index
  if (!from || !toKey || originByEntry.has(toKey) || fromIndex === undefined || toIndex === undefined) return
  let origin: NavigationOrigin | undefined
  if (toIndex === fromIndex + 1) {
    origin = { pathname: from.pathname, href: from.href }
  } else if (toIndex === fromIndex && from.pathname === to.pathname) {
    const fromKey = entryKey(from)
    origin = fromKey ? originByEntry.get(fromKey) : undefined
  }
  if (origin === undefined) return
  originByEntry.set(toKey, origin)
  version += 1
  for (const listener of listeners) listener()
}

/** Follows the router; mounted once in the app shell */
export const NavigationOriginTracker = () => {
  const router = useRouter()
  useEffect(
    () =>
      router.subscribe('onResolved', ({ fromLocation, toLocation }) =>
        recordNavigationOrigin(fromLocation, toLocation),
      ),
    [router],
  )
  return null
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The page the current one was reached from in this visit, or undefined (direct visit, reload, server) */
export const useNavigationOrigin = (): NavigationOrigin | undefined => {
  const key = useRouterState({ select: (state) => entryKey(state.location) })
  useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  )
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )
  return hydrated && key ? originByEntry.get(key) : undefined
}

/** Test helper */
export const resetNavigationOrigins = () => {
  originByEntry.clear()
  version += 1
}