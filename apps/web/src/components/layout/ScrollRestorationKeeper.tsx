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
 * Keeps the window at `top` for a moment: every frame, re-applies it if the page has drifted (it was clamped while
 * the page was short, or scroll anchoring moved it as content grew). A frame check rather than a ResizeObserver,
 * because the document's own boxes keep the viewport's height (`height: 100%`) while the routed content overflows.
 * Scroll anchoring is off meanwhile. The visitor's first wheel, touch, pointer or key input ends it, as does
 * {@link HOLD_MS}. Returns the function that ends it early.
 */
export const holdScrollPosition = (top: number): (() => void) => {
  const root = document.documentElement
  const previousAnchor = root.style.overflowAnchor
  root.style.overflowAnchor = 'none'
  const started = performance.now()
  let frame = 0
  let ended = false
  const inputs = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const

  const end = () => {
    if (ended) return
    ended = true
    cancelAnimationFrame(frame)
    for (const type of inputs) window.removeEventListener(type, end, { capture: true })
    root.style.overflowAnchor = previousAnchor
  }
  const tick = () => {
    if (ended) return
    if (performance.now() - started >= HOLD_MS) {
      end()
      return
    }
    if (Math.abs(window.scrollY - top) > 1) window.scrollTo({ top, left: window.scrollX })
    frame = requestAnimationFrame(tick)
  }

  for (const type of inputs) window.addEventListener(type, end, { passive: true, capture: true })
  tick()
  return end
}

/**
 * Holds the position the router restores on Back/Forward while the page is still growing. The router restores in
 * `onRendered`, when a long page (Home's chart list, its search results) has only rendered its first screen: the
 * browser clamps the position to that short page, and scroll anchoring then shifts it as the list grows above the
 * anchor. So, for a moment after a revisit, {@link holdScrollPosition} keeps the position the entry was left at.
 */
export const ScrollRestorationKeeper = () => {
  const router = useRouter()

  useEffect(() => {
    const positions = createScrollPositions()
    let release: (() => void) | undefined

    const unsubscribeLeave = router.subscribe('onBeforeLoad', ({ fromLocation }) => {
      release?.()
      positions.leave(fromLocation, window.scrollY)
    })
    const unsubscribeRendered = router.subscribe('onRendered', ({ toLocation }) => {
      const top = positions.revisit(toLocation)
      if (top === undefined) return
      release?.()
      release = holdScrollPosition(top)
    })

    return () => {
      unsubscribeLeave()
      unsubscribeRendered()
      release?.()
    }
  }, [router])

  return null
}