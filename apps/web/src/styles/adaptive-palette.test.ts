import { describe, expect, it } from 'vitest'
import { adaptivePaletteCss, adaptiveThemeColors } from './adaptive-palette'

function vars(css: string, selector: string) {
  const block = css.slice(css.indexOf(`${selector}{`) + selector.length + 1)
  return Object.fromEntries(
    [...block.slice(0, block.indexOf('}')).matchAll(/(--c-[\w-]+):([\d ]+);/g)].map((m) => [m[1], m[2]]),
  )
}

describe('adaptive palette', () => {
  const css = adaptivePaletteCss()
  const light = vars(css, ':root')
  const dark = vars(css, 'html[data-theme="dark"]')

  it('keeps the stock values in light mode', () => {
    expect(light['--c-zinc-500']).toBe('113 113 122')
    expect(light['--c-red-500']).toBe('239 68 68')
  })

  it('mirrors neutral scales and keeps secondary text light enough in dark mode', () => {
    expect(dark['--c-zinc-100']).toBe(light['--c-zinc-900'])
    expect(dark['--c-zinc-500']).toBe(light['--c-zinc-400'])
  })

  it('keeps mid chromatic steps that carry white text', () => {
    expect(dark['--c-blue-500']).toBe(light['--c-blue-500'])
    expect(dark['--c-amber-100']).toBe(light['--c-amber-900'])
  })

  it('points every step and alias of a scale at its variable', () => {
    const { zinc } = adaptiveThemeColors()
    expect(zinc['500']).toBe('rgb(var(--c-zinc-500) / %alpha)')
    expect(zinc['5']).toBe('rgb(var(--c-zinc-500) / %alpha)')
    expect(zinc.DEFAULT).toBe('rgb(var(--c-zinc-400) / %alpha)')
  })
})