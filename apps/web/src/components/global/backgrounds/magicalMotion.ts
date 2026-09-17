/** A DOM ref lifecycle keeps scroll frames outside React and stops work completely at rest. */
export function attachMagicalMotion(scene: HTMLDivElement) {
  // The preference wipe needs a complete new snapshot, not the entrance's hidden first frame.
  scene.toggleAttribute('data-skip-entrance', document.documentElement.hasAttribute('data-preference-wipe'))
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
  const compact = window.matchMedia('(max-width: 600px)')
  const tablet = window.matchMedia('(max-width: 1100px)')
  const landscape = window.matchMedia('(max-height: 540px)')
  // x/y are maximum pixel travel per unit of momentum; turn is in degrees.
  const choreography = [
    { name: 'ribbons', x: 5, y: -10, turn: 0.5, slow: true },
    { name: 'clock', x: 0, y: -7, turn: 9, slow: false },
    { name: 'edge-left', x: -9, y: -15, turn: -1.5, slow: false },
    { name: 'edge-right', x: 9, y: -20, turn: 1.5, slow: false },
    { name: 'emblems', x: 0, y: -8, turn: -0.4, slow: true },
    { name: 'lower-clock', x: 0, y: 8, turn: -12, slow: false },
    { name: 'palace', x: 0, y: -9, turn: 0, slow: true },
    { name: 'wand', x: 8, y: -25, turn: 8, slow: false },
    { name: 'character', x: 3, y: -19, turn: -1.2, slow: true },
  ].map((step) => ({
    ...step,
    element: scene.querySelector<SVGSVGElement>(`.magical-background__${step.name} > svg`)!,
  }))
  let active = choreography
  let frame = 0
  let lastTime = 0
  let lastY = Math.max(0, window.scrollY)
  let sampledY = lastY
  let momentum = 0
  let drift = 0

  function reset() {
    cancelAnimationFrame(frame)
    frame = 0
    momentum = drift = 0
    sampledY = lastY = Math.max(0, window.scrollY)
    for (const { element } of choreography) {
      element.style.removeProperty('translate')
      element.style.removeProperty('rotate')
    }
  }

  function tick(time: number) {
    const elapsed = Math.max(1, Math.min(40, time - lastTime))
    lastTime = time
    const velocity = Math.max(-2.4, Math.min(2.4, (lastY - sampledY) / elapsed))
    sampledY = lastY
    momentum += (velocity - momentum) * (1 - Math.exp(-elapsed / 95))
    drift += (momentum - drift) * (1 - Math.exp(-elapsed / 180))
    if (Math.abs(momentum) < 0.002 && Math.abs(drift) < 0.002 && velocity === 0) {
      reset()
      return
    }
    const strength = compact.matches ? 0.06 : 0.12
    for (const { element, x, y, turn, slow } of active) {
      const force = (slow ? drift : momentum) * strength
      element.style.setProperty('translate', `${(x * force).toFixed(3)}px ${(y * force).toFixed(3)}px`)
      element.style.setProperty('rotate', `${(turn * force * 0.2).toFixed(3)}deg`)
    }
    frame = requestAnimationFrame(tick)
  }

  function onScroll() {
    if (reduced.matches || document.hidden) return
    lastY = Math.max(0, window.scrollY)
    if (lastY === sampledY || frame) return
    lastTime = performance.now() - 16.667
    frame = requestAnimationFrame(tick)
  }

  function configure() {
    reset()
    active = choreography.filter(({ name }) => {
      if (name === 'wand') return !tablet.matches && !landscape.matches
      if (name === 'character' || name === 'edge-right') return !compact.matches
      return true
    })
  }

  configure()
  window.addEventListener('scroll', onScroll, { passive: true })
  document.addEventListener('visibilitychange', reset)
  for (const media of [reduced, compact, tablet, landscape]) media.addEventListener('change', configure)
  return () => {
    reset()
    window.removeEventListener('scroll', onScroll)
    document.removeEventListener('visibilitychange', reset)
    for (const media of [reduced, compact, tablet, landscape]) media.removeEventListener('change', configure)
  }
}