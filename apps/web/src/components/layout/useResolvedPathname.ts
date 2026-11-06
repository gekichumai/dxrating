import { useRouterState } from '@tanstack/react-router'

/**
 * The pathname of the page on screen. `useLocation()` switches to the destination as soon as a navigation starts,
 * while the old page is still rendered until the next route's loader and code resolve; layout chrome keyed on it (the
 * compact header, the legal-page frame) would change shape over the old page. Falls back to the current location
 * before the first navigation resolves, so the server render and hydration agree.
 */
export const useResolvedPathname = (): string =>
  useRouterState({ select: (state) => state.resolvedLocation?.pathname ?? state.location.pathname })