import { type ServerEnum, type Sheet, DifficultyEnum, TypeEnum, VersionEnum } from '@gekichumai/dxdata'
import { fireEvent, render, screen } from '@testing-library/react'
import i18n from 'i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initI18n } from '@/setup/init-i18n'
import { SongSheetTabs } from '../SongSheetTabs'

function makeSheet(type: TypeEnum): Sheet {
  return {
    id: `sheet-${type}`,
    type,
    difficulty: DifficultyEnum.Master,
    level: '13',
    internalLevelValue: 13,
    noteCounts: {},
    serverIds: ['jp', 'intl', 'usa', 'cn'] as ServerEnum[],
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

  it('shows chart types as a segmented control with short codes and full accessible names', () => {
    render(
      <SongSheetTabs
        sheets={[
          makeSheet(TypeEnum.DX),
          makeSheet(TypeEnum.STD),
          makeSheet(TypeEnum.UTAGE),
          makeSheet(TypeEnum.UTAGE2P),
        ]}
        availableTypes={[TypeEnum.DX, TypeEnum.STD, TypeEnum.UTAGE, TypeEnum.UTAGE2P]}
        activeType={TypeEnum.DX}
        activeDifficulty={DifficultyEnum.Master}
        onTypeChange={vi.fn()}
        onDifficultyChange={vi.fn()}
        hrefFor={() => '/songs/s/dx/master'}
      />,
    )

    const typeTabs = screen.getByRole('tablist', { name: 'Chart type' })
    expect(typeTabs).toBeTruthy()
    const dx = screen.getByRole('tab', { name: 'DX' })
    expect(dx.textContent).toContain('DX')
    expect(dx.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: 'Standard' }).textContent).toContain('STD')
    expect(screen.getByRole('tab', { name: 'Utage' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Buddy' })).toBeTruthy()
  })

  it('shows a lone chart type as a localized badge instead of a control', async () => {
    await i18n.changeLanguage('ja')

    render(
      <SongSheetTabs
        sheets={[makeSheet(TypeEnum.DX)]}
        availableTypes={[TypeEnum.DX]}
        activeType={TypeEnum.DX}
        activeDifficulty={DifficultyEnum.Master}
        onTypeChange={vi.fn()}
        onDifficultyChange={vi.fn()}
        hrefFor={() => '/songs/s/dx/master'}
      />,
    )

    expect(screen.queryByRole('tablist', { name: '譜面タイプ' })).toBeNull()
    expect(screen.getByText('でらっくす')).toBeTruthy()
  })

  it('activates a chart tab link with Space as well as Enter', () => {
    const onDifficultyChange = vi.fn()
    render(
      <SongSheetTabs
        sheets={[
          makeSheet(TypeEnum.DX),
          { ...makeSheet(TypeEnum.DX), id: 'expert', difficulty: DifficultyEnum.Expert },
        ]}
        availableTypes={[TypeEnum.DX]}
        activeType={TypeEnum.DX}
        activeDifficulty={DifficultyEnum.Master}
        onTypeChange={vi.fn()}
        onDifficultyChange={onDifficultyChange}
        hrefFor={(type, difficulty) => `/songs/s/${type}/${difficulty}?locale=ja`}
      />,
    )

    const expert = screen.getByRole('tab', { name: 'EXPERT' })
    expect(expert.getAttribute('href')).toBe('/songs/s/dx/expert?locale=ja')
    const notCancelled = fireEvent.keyDown(expert, { key: ' ' })
    expect(notCancelled).toBe(false)
    expect(onDifficultyChange).toHaveBeenCalledWith(DifficultyEnum.Expert)
  })
})