import { useEffect } from 'react'

/**
 * Keyboard focus inside a `scroll-fade-x` scroller: bring the focused element fully into view. Browsers leave an
 * element that is already partly visible where it is, cut off at the edge. The fade itself is dropped while keyboard
 * focus is inside (index.css), so the revealed item and its focus ring keep full contrast. Only for keyboard focus
 * (`:focus-visible`), so a click never shifts the row.
 */
export function useRevealFocusInScrollFade() {
  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target
      if (!(target instanceof HTMLElement) || !target.closest('.scroll-fade-x')) return
      if (!target.matches(':focus-visible')) return
      target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
    document.addEventListener('focusin', onFocusIn)
    return () => document.removeEventListener('focusin', onFocusIn)
  }, [])
}