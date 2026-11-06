import type { CSSProperties } from 'react'
import { DIFFICULTIES } from '@/models/difficulties'

/**
 * Difficulty-coloured text that keeps the brand colour in the light theme and switches to the lightened `inkDark`
 * in the dark theme, through CSS variables so the render never depends on the theme. Spread the style and add the
 * class to the element.
 */
export const difficultyInkClassName = 'text-[var(--difficulty-ink)] dark:text-[var(--difficulty-ink-dark)]'

export const difficultyInkStyle = (difficulty: string | undefined): CSSProperties => {
  const entry = difficulty ? DIFFICULTIES[difficulty as keyof typeof DIFFICULTIES] : undefined
  return { '--difficulty-ink': entry?.color, '--difficulty-ink-dark': entry?.inkDark } as CSSProperties
}