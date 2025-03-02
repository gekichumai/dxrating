import { DifficultyEnum } from '@gekichumai/dxdata'

export const DIFFICULTIES: Record<DifficultyEnum, { title: string; color: string; dark?: boolean }> = {
  [DifficultyEnum.Basic]: {
    title: 'BASIC',
    color: '#22bb5b',
  },
  [DifficultyEnum.Advanced]: {
    title: 'ADVANCED',
    color: '#fb9c2d',
  },
  [DifficultyEnum.Expert]: {
    title: 'EXPERT',
    color: '#f64861',
  },
  [DifficultyEnum.Master]: {
    title: 'MASTER',
    color: '#9e45e2',
    dark: true,
  },
  [DifficultyEnum.ReMaster]: {
    title: 'Re:MASTER',
    color: '#ba67f8',
  },
}
