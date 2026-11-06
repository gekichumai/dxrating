import { useRouter, useRouterState } from '@tanstack/react-router'
import { useEffect, useSyncExternalStore } from 'react'

/**
 * The page each history entry was reached from, within this visit: so a page can offer a way back to where the
 * visitor came from (e.g. "← Home" on New charts after Home's "See all"). Kept in memory per history entry key, so
 * Back and Forward land on entries that still know their origin; a reload starts empty, and nothing reaches the
 * server, so server and cached HTML never depend on it.
 */
const originByEntry = new Map<string, string>()
const listeners = new Set<() => void>()
let version = 0

type LocationLike = { pathname: string; state: { __TSR_key?: string; key?: string } }

const entryKey = (location: LocationLike | undefined) => location?.state.__TSR_key ?? location?.state.key

/**
 * Records the origin of a newly visited entry. Back and Forward revisit entries that already have one, which stays.
 * A navigation within one page (a replaced search) keeps the origin of the entry it replaces.
 */
export const recordNavigationOrigin = (from: LocationLike | undefined, to: LocationLike) => {
  const toKey = entryKey(to)
  if (!from || !toKey || originByEntry.has(toKey)) return
  const fromKey = entryKey(from)
  const inherited = from.pathname === to.pathname && fromKey ? originByEntry.get(fromKey) : undefined
  originByEntry.set(toKey, inherited ?? from.pathname)
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

/** The pathname the current page was reached from in this visit, or undefined (direct visit, reload, server) */
export const useNavigationOrigin = (): string | undefined => {
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