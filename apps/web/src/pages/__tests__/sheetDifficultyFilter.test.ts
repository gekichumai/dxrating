import { DifficultyEnum, TypeEnum } from '@gekichumai/dxdata'
import { describe, expect, it } from 'vitest'
import { sheetMatchesDifficultyFilter } from '../sheetDifficultyFilter'

describe('sheetMatchesDifficultyFilter', () => {
  const selectedDifficulties = [DifficultyEnum.Master]

  it('filters normal charts by selected difficulty', () => {
    expect(
      sheetMatchesDifficultyFilter({ type: TypeEnum.DX, difficulty: DifficultyEnum.Basic }, selectedDifficulties),
    ).toBe(false)

    expect(
      sheetMatchesDifficultyFilter({ type: TypeEnum.STD, difficulty: DifficultyEnum.Master }, selectedDifficulties),
    ).toBe(true)
  })

  it.each([TypeEnum.UTAGE, TypeEnum.UTAGE2P])('does not filter %s charts by difficulty', (type) => {
    expect(sheetMatchesDifficultyFilter({ type, difficulty: '【宴】' as DifficultyEnum }, selectedDifficulties)).toBe(
      true,
    )
  })
})