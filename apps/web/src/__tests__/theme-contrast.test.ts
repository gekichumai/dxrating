import { describe, expect, it } from 'vitest'
import { VERSION_THEME } from '@/theme'

// --on-accent in dark mode: the text that dark-mode accent fills carry
const ON_ACCENT_DARK = '#111114'

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

describe('dark-mode accent fills', () => {
  it.each(Object.entries(VERSION_THEME))('%s: dark text stays AA on the fill and on its hover shade', (_, theme) => {
    expect(contrast(theme.accentStrongDarkColor, ON_ACCENT_DARK)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(theme.accentStrongDarkHoverColor, ON_ACCENT_DARK)).toBeGreaterThanOrEqual(4.5)
    // A visible change on hover, toward more contrast
    expect(theme.accentStrongDarkHoverColor).not.toBe(theme.accentStrongDarkColor)
    expect(luminance(theme.accentStrongDarkHoverColor)).toBeGreaterThan(luminance(theme.accentStrongDarkColor))
  })
})