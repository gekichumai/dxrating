import { type Sheet, DifficultyEnum, TypeEnum, VersionEnum } from '@gekichumai/dxdata'
import { render, screen } from '@testing-library/react'
import i18n from 'i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initI18n } from '@/setup/init-i18n'
import { SongSheetTabs } from '../SongSheetTabs'

function makeSheet(type: TypeEnum): Sheet {
  return {
    type,
    difficulty: DifficultyEnum.Master,
    level: '13',
    internalLevelValue: 13,
    noteDesigner: null,
    noteCounts: {
      tap: null,
      hold: null,
      slide: null,
      touch: null,
      break: null,
      total: null,
    },
    regions: {
      jp: true,
      intl: true,
      cn: true,
    },
    isSpecial: false,
    version: VersionEnum.CiRCLEPLUS,
  }
}

describe('SongSheetTabs', () => {
  beforeAll(() => {
    initI18n()
  })

  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('uses descriptive type image alt text for DX and Standard tabs with text fallback for other types', () => {
    render(
      <SongSheetTabs
        sheets={[makeSheet(TypeEnum.DX), makeSheet(TypeEnum.STD), makeSheet(TypeEnum.UTAGE)]}
        availableTypes={[TypeEnum.DX, TypeEnum.STD, TypeEnum.UTAGE]}
        activeType={TypeEnum.DX}
        activeDifficulty={DifficultyEnum.Master}
        onTypeChange={vi.fn()}
        onDifficultyChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('img', { name: 'DX chart' }).getAttribute('src')).toBe(
      'https://shama.dxrating.net/images/type_dx.png',
    )
    expect(screen.getByRole('img', { name: 'Standard chart' }).getAttribute('src')).toBe(
      'https://shama.dxrating.net/images/type_sd.png',
    )
    expect(screen.getByRole('tab', { name: 'Utage' })).toBeTruthy()
    expect(screen.queryByRole('img', { name: 'Utage' })).toBeNull()
  })

  it('localizes type image alt text', async () => {
    await i18n.changeLanguage('ja')

    render(
      <SongSheetTabs
        sheets={[makeSheet(TypeEnum.DX)]}
        availableTypes={[TypeEnum.DX]}
        activeType={TypeEnum.DX}
        activeDifficulty={DifficultyEnum.Master}
        onTypeChange={vi.fn()}
        onDifficultyChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('img', { name: 'でらっくす譜面' })).toBeTruthy()
  })
})