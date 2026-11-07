import { useRouterState } from '@tanstack/react-router'
import { type FC, useEffect, useState } from 'react'
import { useAppBusy } from './appBusy'

/** A navigation shorter than this shows no bar, so fast pages don't flash one */
export const NAVIGATION_FEEDBACK_DELAY_MS = 150

type BarPhase = 'idle' | 'loading' | 'done'

/**
 * A thin bar along the top of the window while the router loads the next page (its loaders run before the page
 * shows), or while other work the visitor waits on runs (appBusy). It appears only after {@link NAVIGATION_FEEDBACK_DELAY_MS}, creeps towards the end while loading, then
 * fills and fades. Fixed and click-through, so it never moves the layout. Under reduced motion it only fades.
 * The server and the first client render agree: nothing is pending then, so the bar renders hidden.
 */
export const NavigationProgress: FC = () => {
  const routerPending = useRouterState({ select: (state) => state.status === 'pending' })
  // Work outside the router the visitor waits on, such as switching the game version
  const appBusy = useAppBusy()
  const pending = routerPending || appBusy
  const [phase, setPhase] = useState<BarPhase>('idle')

  useEffect(() => {
    if (pending) {
      const timer = window.setTimeout(() => setPhase('loading'), NAVIGATION_FEEDBACK_DELAY_MS)
      return () => window.clearTimeout(timer)
    }
    // Finished: fill and fade only if the bar was showing
    setPhase((current) => (current === 'loading' ? 'done' : current))
    return undefined
  }, [pending])

  useEffect(() => {
    if (phase !== 'done') return
    const timer = window.setTimeout(() => setPhase('idle'), 400)
    return () => window.clearTimeout(timer)
  }, [phase])

  return (
    <div aria-hidden="true" className="navigation-progress" data-phase={phase}>
      <div className="navigation-progress__bar" />
    </div>
  )
}