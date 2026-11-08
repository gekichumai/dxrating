import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CHART_TYPE_COLORS, chartTypeLetteringGradient } from '@gekichumai/maimai-domain'
import { describe, expect, it } from 'vitest'

const tokensCss = readFileSync(resolve(__dirname, '../tokens.css'), 'utf8')
const darkCss = readFileSync(resolve(__dirname, '../dark.css'), 'utf8')

const token = (css: string, name: string) => {
  const match = css.match(new RegExp(`--${name}:\\s*([^;]+);`))
  return match?.[1]?.trim().toLowerCase()
}
const lower = (value: string) => value.toLowerCase()

const luminance = (hex: string) => {
  const channels = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

describe('chart-type tokens', () => {
  it('match the shared chart-type colours the OG renderer and iOS use', () => {
    const { std, dx } = CHART_TYPE_COLORS
    expect(token(tokensCss, 'chart-type-std')).toBe(lower(std.fill))
    expect(token(tokensCss, 'chart-type-std-ink')).toBe(lower(std.ink))
    expect(token(tokensCss, 'chart-type-std-text')).toBe(lower(std.text))
    expect(token(darkCss, 'chart-type-std-text')).toBe(lower(std.textDark))
    expect(token(tokensCss, 'chart-type-dx-plate')).toBe(lower(dx.plate))
    expect(token(tokensCss, 'chart-type-dx-outline')).toBe(lower(dx.outline))
    expect(token(tokensCss, 'chart-type-dx-lettering-on-plate')).toBe(lower(chartTypeLetteringGradient(dx.lettering)))
    expect(token(tokensCss, 'dx-lettering')).toBe(lower(chartTypeLetteringGradient(dx.letteringOnSurface)))
    expect(token(darkCss, 'dx-lettering')).toBe(lower(chartTypeLetteringGradient(dx.letteringDark)))
  })

  it('keep every label colour at WCAG AA (4.5:1) against what it sits on', () => {
    const { std, dx } = CHART_TYPE_COLORS
    expect(contrast(std.ink, std.fill)).toBeGreaterThanOrEqual(4.5)
    // Light glass, tinted by the version colour, is at most this dark (about #DCF3E8 on MAGiCAL, darker on a hovered
    // row); dark glass at most this light
    const lightGlass = '#D4ECE0'
    const darkGlass = '#2A2A30'
    expect(contrast(std.text, lightGlass)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(std.textDark, darkGlass)).toBeGreaterThanOrEqual(4.5)
    for (const stop of dx.lettering) expect(contrast(stop, dx.plate), stop).toBeGreaterThanOrEqual(4.5)
    for (const stop of dx.letteringOnSurface) expect(contrast(stop, lightGlass), stop).toBeGreaterThanOrEqual(4.5)
    for (const stop of dx.letteringDark) expect(contrast(stop, darkGlass), stop).toBeGreaterThanOrEqual(4.5)
  })
})