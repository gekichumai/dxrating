import { DifficultyEnum, TypeEnum } from '@gekichumai/dxdata'
import { describe, expect, it } from 'vitest'
import { getSheetPageTitle, getSheetTitleLabel, getSheetTypeDisplayName } from '../sheetDisplay'

describe('sheet display labels', () => {
  it('formats page-title sheet labels with player-facing names', () => {
    expect(getSheetTitleLabel({ type: TypeEnum.DX, difficulty: DifficultyEnum.ReMaster })).toBe('DX Re:MASTER')
    expect(getSheetTitleLabel({ type: TypeEnum.STD, difficulty: DifficultyEnum.Master })).toBe('Standard MASTER')
    expect(getSheetTitleLabel({ type: TypeEnum.UTAGE, difficulty: '【協】' })).toBe('Utage 【協】')
    expect(getSheetPageTitle({ title: 'Song Title' }, { type: TypeEnum.DX, difficulty: DifficultyEnum.ReMaster })).toBe(
      'Song Title [DX Re:MASTER] - DXRating',
    )
  })

  it('localizes sheet type labels to common player terms', () => {
    expect(getSheetTypeDisplayName(TypeEnum.STD, 'zh-Hans')).toBe('标准')
    expect(getSheetTypeDisplayName(TypeEnum.STD, 'zh-Hant')).toBe('標準')
    expect(getSheetTypeDisplayName(TypeEnum.UTAGE, 'zh-Hans')).toBe('宴')
    expect(getSheetTypeDisplayName(TypeEnum.DX, 'ja')).toBe('でらっくす')
    expect(getSheetTypeDisplayName(TypeEnum.STD, 'ja')).toBe('スタンダード')
  })
})