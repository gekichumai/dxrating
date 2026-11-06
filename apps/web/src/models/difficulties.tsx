import { DifficultyEnum } from '@gekichumai/dxdata'

/**
 * Difficulty colours by role:
 * - `color`: the game's brand colour, for swatches, borders and decoration only (it fails contrast as text and under
 *   white text)
 * - `solid`: a fill that carries white text (>=4.5:1)
 * - `ink`: text on light glass over any version background (>=4.5:1)
 * - `inkDark`: text on dark glass in the dark theme (>=5.2:1), the brand colour lightened in OKLCH; pair it with `ink`
 *   through a CSS variable or the `dark:` variant (html[data-theme="dark"]), never by reading the theme in render
 * `solid` and `ink` are the brand colour darkened in OKLCH with hue and chroma kept.
 */
export const DIFFICULTIES: Record<
  DifficultyEnum,
  { title: string; color: string; solid: string; ink: string; inkDark: string; dark?: boolean }
> = {
  [DifficultyEnum.Basic]: {
    title: 'BASIC',
    color: '#22bb5b',
    solid: '#008829',
    ink: '#007715',
    inkDark: '#22bb5b',
  },
  [DifficultyEnum.Advanced]: {
    title: 'ADVANCED',
    color: '#fb9c2d',
    solid: '#b55c00',
    ink: '#a54d00',
    inkDark: '#fb9c2d',
  },
  [DifficultyEnum.Expert]: {
    title: 'EXPERT',
    color: '#f64861',
    solid: '#dc2c4d',
    ink: '#ca0f3f',
    inkDark: '#ff6377',
  },
  [DifficultyEnum.Master]: {
    title: 'MASTER',
    color: '#9e45e2',
    solid: '#9e45e2',
    ink: '#9034d3',
    inkDark: '#c873ff',
    dark: true,
  },
  [DifficultyEnum.ReMaster]: {
    title: 'Re:MASTER',
    color: '#ba67f8',
    solid: '#9f4bdb',
    ink: '#903aca',
    inkDark: '#d49bff',
  },
}