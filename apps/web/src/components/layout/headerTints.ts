import type { CSSProperties } from 'react'

/** The hue of each header action: [light, dark]. Use with the `header-tint` class (styles/header-tints.css). */
export const HEADER_TINTS = {
  discord: ['#4F5BD5', '#A5ADFF'],
  qq: ['#066A9E', '#6CCFFF'],
  github: ['#3F3F46', '#E4E4E7'],
  mcp: ['#6D28D9', '#C4B5FD'],
  api: ['#0F766E', '#5EEAD4'],
  locale: ['#1D4ED8', '#93C5FD'],
  theme: ['#9A4507', '#FCD34D'],
  preferences: ['#7C3AED', '#C4B5FD'],
  about: ['#0369A1', '#7DD3FC'],
  account: ['var(--accent-strong)', 'var(--accent-strong)'],
} as const satisfies Record<string, readonly [string, string]>

export type HeaderTint = keyof typeof HEADER_TINTS

/** Brand fills of the community discs (white logo on top), as the header used before the glass pill */
export const HEADER_BRAND_FILLS = { discord: '#5865F2', qq: '#12B7F5', github: '#27272A' } as const

export const headerTintStyle = (tint: HeaderTint): CSSProperties =>
  ({
    '--tint': HEADER_TINTS[tint][0],
    '--tint-dark': HEADER_TINTS[tint][1],
    ...(tint in HEADER_BRAND_FILLS && { '--brand': HEADER_BRAND_FILLS[tint as keyof typeof HEADER_BRAND_FILLS] }),
  }) as CSSProperties