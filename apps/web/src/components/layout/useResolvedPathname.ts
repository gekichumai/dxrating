import { rootRouteId, useRouterState } from '@tanstack/react-router'

interface DisplayedRouteState {
  location: { pathname: string }
  matches: readonly { routeId: string; pathname: string }[]
}

/**
 * The pathname of the deepest committed match: the page the outlet renders. During a navigation `location` already
 * names the destination while `matches` still holds the outgoing page, and the router swaps `matches` in the same
 * commit that renders the destination (`resolvedLocation` only catches up after that, a frame or more later). A
 * not-found page has only the root match, so it falls back to the location.
 */
export const selectDisplayedPathname = (state: DisplayedRouteState): string => {
  const leaf = state.matches[state.matches.length - 1]
  return leaf && leaf.routeId !== rootRouteId ? leaf.pathname : state.location.pathname
}

/**
 * The pathname of the page on screen. `useLocation()` switches to the destination as soon as a navigation starts,
 * while the old page is still rendered until the next route's loader and code resolve; layout chrome keyed on it (the
 * compact header, the legal-page frame) would change shape over the old page. This follows the outlet instead, so the
 * chrome and the page change in the same commit, on the server render and hydration too.
 */
export const useResolvedPathname = (): string => useRouterState({ select: selectDisplayedPathname })