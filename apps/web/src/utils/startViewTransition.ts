import { flushSync } from 'react-dom'

export interface WipeOrigin {
  x: number
  y: number
}

export function wipeOriginFromElement(element: Element | null): WipeOrigin {
  const rect = element?.getBoundingClientRect()
  return rect
    ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    : { x: window.innerWidth / 2, y: window.innerHeight / 2 }
}

export function wipeOriginFromClick(event: {
  detail: number
  clientX: number
  clientY: number
  currentTarget: Element
}): WipeOrigin {
  return event.detail > 0 ? { x: event.clientX, y: event.clientY } : wipeOriginFromElement(event.currentTarget)
}

let latestRequest = 0
let activeTransition: ViewTransition | undefined

export function startViewTransition(
  update: () => void | Promise<void>,
  origin = wipeOriginFromElement(document.activeElement),
): Promise<void> {
  const request = ++latestRequest
  activeTransition?.skipTransition()
  const root = document.documentElement
  const cleanup = () => {
    if (request !== latestRequest) return
    activeTransition = undefined
    delete root.dataset.preferenceWipe
    for (const property of ['x', 'y', 'reach']) root.style.removeProperty(`--preference-wipe-${property}`)
  }
  const apply = () => {
    if (request !== latestRequest) return
    // Capture the new React tree, rather than a pending batched update.
    return flushSync(update)
  }
  if (
    typeof document.startViewTransition !== 'function' ||
    typeof window.matchMedia !== 'function' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    cleanup()
    return Promise.resolve(apply())
  }

  root.dataset.preferenceWipe = ''
  root.style.setProperty('--preference-wipe-x', `${origin.x}px`)
  root.style.setProperty('--preference-wipe-y', `${origin.y}px`)
  root.style.setProperty(
    '--preference-wipe-reach',
    `${Math.hypot(Math.max(origin.x, window.innerWidth - origin.x), Math.max(origin.y, window.innerHeight - origin.y))}px`,
  )
  const transition = document.startViewTransition(apply)
  activeTransition = transition
  // A skipped animation rejects ready, but must still apply the preference.
  void transition.ready.catch(() => {})
  void transition.finished.then(cleanup, cleanup)
  return transition.updateCallbackDone
}