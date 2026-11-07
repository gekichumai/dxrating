import type { CSSProperties } from 'react'
import { DIFFICULTIES } from '@/models/difficulties'

/**
 * Difficulty-coloured text: the darkened `ink` in the light theme and the lightened `inkDark` in the dark theme (the
 * brand `color` fails contrast as text), through CSS variables so the render never depends on the theme. Spread the
 * style and add the class to the element.
 */
export const difficultyInkClassName = 'text-[var(--difficulty-ink)] dark:text-[var(--difficulty-ink-dark)]'

export const difficultyInkStyle = (difficulty: string | undefined): CSSProperties => {
  const entry = difficulty ? DIFFICULTIES[difficulty as keyof typeof DIFFICULTIES] : undefined
  return { '--difficulty-ink': entry?.ink, '--difficulty-ink-dark': entry?.inkDark } as CSSProperties
}