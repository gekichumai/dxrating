import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const darkCss = readFileSync(resolve(__dirname, '../dark.css'), 'utf8')
// The first html[data-theme='dark'] block holds the default dark values
const darkBlock = darkCss.slice(
  darkCss.indexOf("html[data-theme='dark'] {"),
  darkCss.indexOf('}', darkCss.indexOf("html[data-theme='dark'] {")),
)

const token = (name: string) => {
  const match = darkBlock.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!match) throw new Error(`--${name} has no hex value in dark.css`)
  return match[1]
}

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// A conservative (light) stand-in for dark glass with its accent tint over the dimmed background art
const DARK_GLASS = '#26262c'

describe('dark theme text tokens', () => {
  it.each(['fg-1', 'fg-2', 'danger', 'status-positive', 'status-warning'])(
    '--%s passes 4.5:1 on dark glass',
    (name) => {
      expect(contrast(token(name), DARK_GLASS)).toBeGreaterThanOrEqual(4.5)
    },
  )
})