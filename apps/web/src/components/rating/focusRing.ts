/**
 * The shared focus ring (src/styles/tokens.css) on MUI Switch, Checkbox and Radio. Their native input is invisible, so
 * the global :focus-visible outline never shows, and MUI's focus ripple is too faint over glass.
 */
const ring = { outline: '2px solid var(--focus-ring)', outlineOffset: 2 } as const

export const switchFocusRing = {
  '& .MuiSwitch-switchBase.Mui-focusVisible .MuiSwitch-thumb': ring,
} as const

export const toggleFocusRing = {
  '&.Mui-focusVisible': { ...ring, outlineOffset: -2 },
} as const