/** Hydration enables CSS drift; JavaScript only runs while scroll momentum settles. */
export function attachMagicalMotion(scene: HTMLDivElement) {
  scene.toggleAttribute('data-skip-entrance', document.documentElement.hasAttribute('data-preference-wipe'))
  scene.setAttribute('data-ready', '')
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
  const compact = window.matchMedia('(max-width: 600px)')
  const tablet = window.matchMedia('(max-width: 1100px)')
  const landscape = window.matchMedia('(max-height: 540px)')
  const layers = [...scene.querySelectorAll<HTMLElement>('[data-drift]')]
  let active = layers
  let frame = 0
  let lastTime = 0
  let lastY = Math.max(0, window.scrollY)
  let sampledY = lastY
  let momentum = 0

  function reset() {
    cancelAnimationFrame(frame)
    frame = 0
    momentum = 0
    sampledY = lastY = Math.max(0, window.scrollY)
    for (const layer of layers) layer.style.removeProperty('translate')
  }

  function tick(time: number) {
    const elapsed = Math.max(1, Math.min(40, time - lastTime))
    lastTime = time
    const velocity = Math.max(-2.4, Math.min(2.4, (lastY - sampledY) / elapsed))
    sampledY = lastY
    momentum += (velocity - momentum) * (1 - Math.exp(-elapsed / 140))
    if (Math.abs(momentum) < 0.002 && velocity === 0) {
      reset()
      return
    }
    // Idle peaks at half its total travel; scroll peaks 20% above that (0.5 × 1.2).
    const force = (-momentum / 2.4) * 0.6
    for (const layer of active) {
      layer.style.setProperty('translate', `0 calc(var(--idle-distance) * ${force.toFixed(4)})`)
    }
    frame = requestAnimationFrame(tick)
  }

  function onScroll() {
    if (reduced.matches || document.hidden || document.documentElement.hasAttribute('data-preference-wipe')) return
    lastY = Math.max(0, window.scrollY)
    if (lastY === sampledY || frame) return
    lastTime = performance.now() - 16.667
    frame = requestAnimationFrame(tick)
  }

  function configure() {
    reset()
    scene.toggleAttribute('data-motion-paused', document.hidden)
    active = layers.filter((layer) => {
      const name = layer.dataset.drift
      if (name === 'wand') return !tablet.matches && !landscape.matches
      if (name === 'character' || name === 'edge-right') return !compact.matches
      return true
    })
  }

  configure()
  window.addEventListener('scroll', onScroll, { passive: true })
  document.addEventListener('visibilitychange', configure)
  for (const media of [reduced, compact, tablet, landscape]) media.addEventListener('change', configure)
  return () => {
    reset()
    window.removeEventListener('scroll', onScroll)
    document.removeEventListener('visibilitychange', configure)
    for (const media of [reduced, compact, tablet, landscape]) media.removeEventListener('change', configure)
    scene.removeAttribute('data-ready')
    scene.removeAttribute('data-skip-entrance')
    scene.removeAttribute('data-motion-paused')
  }
}