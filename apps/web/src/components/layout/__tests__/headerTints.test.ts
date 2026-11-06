import { describe, expect, it } from 'vitest'
import { VERSION_THEME } from '@/theme'
import { HEADER_TINTS, headerTintStyle } from '../headerTints'

// Mirrors styles/header-tints.css: glyph = hue mixed toward black (light) or white (dark), wash = hue at a percentage
// over the glass. Colours mix in gamma-encoded sRGB, as color-mix(in srgb) and alpha compositing do.
const STATES = {
  light: { rest: { ink: 0.86, wash: 0.14 }, hover: { ink: 0.7, wash: 0.22 }, toward: [0, 0, 0] },
  dark: { rest: { ink: 0.8, wash: 0.16 }, hover: { ink: 0.62, wash: 0.26 }, toward: [1, 1, 1] },
} as const

// Conservative samples of the glass under the header pill: darker than the MAGiCAL light tint, lighter than its dark
const GLASS = { light: rgb('#bcd9cf'), dark: rgb('#2e3b37') }

function rgb(hex: string) {
  return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
}
const luminance = (c: readonly number[]) => {
  const [r, g, b] = c.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}
const mix = (a: readonly number[], b: readonly number[], t: number) => a.map((v, i) => v * t + b[i]! * (1 - t))
const contrast = (a: readonly number[], b: readonly number[]) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

// Every hue as rendered, the account button once per version accent
const hues: [string, string, string][] = [
  ...Object.entries(HEADER_TINTS)
    .filter(([, [light]]) => light.startsWith('#'))
    .map(([name, [light, dark]]) => [name, light, dark] as [string, string, string]),
  ...Object.entries(VERSION_THEME).map(
    ([version, theme]) =>
      [`account (${version})`, theme.accentStrongColor, theme.accentStrongDarkColor] as [string, string, string],
  ),
]

describe('header tints', () => {
  it('covers the account accent of every version', () => {
    expect(HEADER_TINTS.account[0]).toBe('var(--accent-strong)')
  })

  for (const [name, light, dark] of hues) {
    it(`${name}: glyph ≥ 3:1 on its wash at rest and on hover, both themes`, () => {
      for (const [theme, hex] of [
        ['light', light],
        ['dark', dark],
      ] as const) {
        const { toward } = STATES[theme]
        for (const state of [STATES[theme].rest, STATES[theme].hover]) {
          const hue = rgb(hex)
          const glyph = mix(hue, toward, state.ink)
          const wash = mix(hue, GLASS[theme], state.wash)
          expect(contrast(glyph, wash), `${theme} ink ${state.ink}`).toBeGreaterThanOrEqual(3)
        }
      }
    })
  }

  it('sets the brand fill for community links only', () => {
    expect(headerTintStyle('discord')).toMatchObject({ '--brand': '#5865F2' })
    expect(headerTintStyle('about')).not.toHaveProperty('--brand')
  })
})