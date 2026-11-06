import { DifficultyEnum } from '@gekichumai/dxdata'

/**
 * Difficulty colours by role:
 * - `color`: the game's brand colour, for swatches, borders and decoration only (it fails contrast as text and under
 *   white text)
 * - `solid`: a fill that carries white text (>=4.5:1)
 * - `ink`: text on light glass over any version background (>=4.5:1)
 * `solid` and `ink` are the brand colour darkened in OKLCH with hue and chroma kept.
 */
export const DIFFICULTIES: Record<
  DifficultyEnum,
  { title: string; color: string; solid: string; ink: string; dark?: boolean }
> = {
  [DifficultyEnum.Basic]: {
    title: 'BASIC',
    color: '#22bb5b',
    solid: '#008829',
    ink: '#007715',
  },
  [DifficultyEnum.Advanced]: {
    title: 'ADVANCED',
    color: '#fb9c2d',
    solid: '#b55c00',
    ink: '#a54d00',
  },
  [DifficultyEnum.Expert]: {
    title: 'EXPERT',
    color: '#f64861',
    solid: '#dc2c4d',
    ink: '#ca0f3f',
  },
  [DifficultyEnum.Master]: {
    title: 'MASTER',
    color: '#9e45e2',
    solid: '#9e45e2',
    ink: '#9034d3',
    dark: true,
  },
  [DifficultyEnum.ReMaster]: {
    title: 'Re:MASTER',
    color: '#ba67f8',
    solid: '#9f4bdb',
    ink: '#903aca',
  },
}