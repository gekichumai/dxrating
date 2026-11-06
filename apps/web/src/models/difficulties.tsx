import { DifficultyEnum } from '@gekichumai/dxdata'

/**
 * Difficulty colours by role:
 * - `color`: the game's brand colour, for swatches, borders and decoration only (it fails contrast as text and under
 *   white text)
 * - `solid`: a fill that carries white text (>=4.5:1)
 * - `ink`: text on light glass over any version background (>=4.5:1)
 * - `inkDark`: text on dark glass in the dark theme (>=5.2:1), and on the rating table's amber and cyan bucket tints
 *   over it (>=4.9:1), the brand colour lightened in OKLCH; pair it with `ink` through a CSS variable or the `dark:`
 *   variant (html[data-theme="dark"]), never by reading the theme in render
 * `solid` and `ink` are the brand colour darkened in OKLCH with hue and chroma kept.
 */
export const DIFFICULTIES: Record<
  DifficultyEnum,
  {
    title: string
    /** The name in compact pills and labels (BAS, ADV, EXP, MAS, Re:MAS), where every row gets the width of the longest */
    shortTitle: string
    color: string
    solid: string
    ink: string
    inkDark: string
    dark?: boolean
  }
> = {
  [DifficultyEnum.Basic]: {
    title: 'BASIC',
    shortTitle: 'BAS',
    color: '#22bb5b',
    solid: '#008829',
    ink: '#007715',
    inkDark: '#22bb5b',
  },
  [DifficultyEnum.Advanced]: {
    title: 'ADVANCED',
    shortTitle: 'ADV',
    color: '#fb9c2d',
    solid: '#b55c00',
    ink: '#a54d00',
    inkDark: '#fb9c2d',
  },
  [DifficultyEnum.Expert]: {
    title: 'EXPERT',
    shortTitle: 'EXP',
    color: '#f64861',
    solid: '#dc2c4d',
    ink: '#ca0f3f',
    inkDark: '#ff7a8a',
  },
  [DifficultyEnum.Master]: {
    title: 'MASTER',
    shortTitle: 'MAS',
    color: '#9e45e2',
    solid: '#9e45e2',
    ink: '#9034d3',
    inkDark: '#cf85ff',
    dark: true,
  },
  [DifficultyEnum.ReMaster]: {
    title: 'Re:MASTER',
    shortTitle: 'Re:MAS',
    color: '#ba67f8',
    solid: '#9f4bdb',
    ink: '#903aca',
    inkDark: '#d49bff',
  },
}

/** Every short name, the samples a fixed-width difficulty pill is sized by (`FixedWidthText`) */
export const DIFFICULTY_SHORT_TITLES: readonly string[] = Object.values(DIFFICULTIES).map((entry) => entry.shortTitle)