import { describe, expect, it } from 'vitest'
import { HEADER_TINTS, headerTintStyle } from '../headerTints'

const rgb = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
const luminance = (c: number[]) => {
  const [r, g, b] = c.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v * t + b[i]! * (1 - t))
const contrast = (a: number[], b: number[]) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

// Representative glass under the header: the MAGiCAL accent tint in light, the dimmed art in dark
const LIGHT_GLASS = rgb('#cfe9df')
const DARK_GLASS = rgb('#26332f')

describe('header tints', () => {
  for (const [name, [light, dark]] of Object.entries(HEADER_TINTS)) {
    if (!light.startsWith('#')) continue // token-driven (the accent), measured by the token tests
    it(`${name}: glyph ≥ 3:1 on its own wash in both themes`, () => {
      expect(contrast(rgb(light), mix(rgb(light), LIGHT_GLASS, 0.18))).toBeGreaterThanOrEqual(3)
      expect(contrast(rgb(dark), mix(rgb(dark), DARK_GLASS, 0.22))).toBeGreaterThanOrEqual(3)
    })
  }

  it('sets the brand fill for community links only', () => {
    expect(headerTintStyle('discord')).toMatchObject({ '--brand': '#5865F2' })
    expect(headerTintStyle('about')).not.toHaveProperty('--brand')
  })
})