import { useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'

/** How long a revisited page may keep growing (lists, search results) before the position is left alone */
const HOLD_MS = 2000

type LocationLike = { hash?: string; state: { __TSR_key?: string; key?: string } }

const entryKey = (location: LocationLike | undefined) => location?.state.__TSR_key ?? location?.state.key

/**
 * Where a revisited page (Back or Forward) should be scrolled: the position it was left at, kept per history entry.
 * A new entry has none, so a pushed page still starts at the top.
 */
export const createScrollPositions = () => {
  const positions = new Map<string, number>()
  return {
    leave: (from: LocationLike | undefined, scrollY: number) => {
      const key = entryKey(from)
      if (key) positions.set(key, scrollY)
    },
    revisit: (to: LocationLike): number | undefined => {
      const key = entryKey(to)
      if (!key || to.hash) return undefined
      const top = positions.get(key)
      return top && top > 0 ? top : undefined
    },
  }
}

/**
 * Holds the position the router restores on Back/Forward while the page is still growing. The router restores in
 * `onRendered`, when a long page (Home's chart list, its search results) has only rendered its first screen: the
 * browser clamps the position to that short page, and scroll anchoring then shifts it as the list grows above the
 * anchor. So, for a moment after a revisit, the position is re-applied whenever the page resizes, with scroll
 * anchoring off. The first scroll, wheel, touch or key from the visitor ends it, as does {@link HOLD_MS}.
 */
export const ScrollRestorationKeeper = () => {
  const router = useRouter()

  useEffect(() => {
    const positions = createScrollPositions()
    let release: (() => void) | undefined

    const hold = (top: number) => {
      release?.()
      const root = document.documentElement
      const previousAnchor = root.style.overflowAnchor
      root.style.overflowAnchor = 'none'
      const apply = () => {
        if (Math.abs(window.scrollY - top) > 1) window.scrollTo({ top, left: window.scrollX })
      }
      const observer = new ResizeObserver(apply)
      observer.observe(document.body)
      const inputs = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const
      const stop = () => release?.()
      for (const type of inputs) window.addEventListener(type, stop, { passive: true, capture: true })
      const timer = window.setTimeout(stop, HOLD_MS)
      apply()
      release = () => {
        observer.disconnect()
        window.clearTimeout(timer)
        for (const type of inputs) window.removeEventListener(type, stop, { capture: true })
        root.style.overflowAnchor = previousAnchor
        release = undefined
      }
    }

    const unsubscribeLeave = router.subscribe('onBeforeLoad', ({ fromLocation }) => {
      release?.()
      positions.leave(fromLocation, window.scrollY)
    })
    const unsubscribeRendered = router.subscribe('onRendered', ({ toLocation }) => {
      const top = positions.revisit(toLocation)
      if (top !== undefined) hold(top)
    })

    return () => {
      unsubscribeLeave()
      unsubscribeRendered()
      release?.()
    }
  }, [router])

  return null
}