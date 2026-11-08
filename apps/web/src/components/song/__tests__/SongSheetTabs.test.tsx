import { type ServerEnum, type Sheet, DifficultyEnum, TypeEnum, VersionEnum } from '@gekichumai/dxdata'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '@/i18n/LocaleProvider'
import { SongSheetTabs } from '../SongSheetTabs'
import { m } from '@/paraglide/messages'

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

const EnglishLocale = ({ children }: { children: ReactNode }) => (
  <LocaleProvider initialLocale="en">{children}</LocaleProvider>
)

describe('SongSheetTabs', () => {
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
      { wrapper: EnglishLocale },
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

  it('shows a lone chart type as a localized badge instead of a control', () => {
    render(
      <LocaleProvider initialLocale="ja">
        <SongSheetTabs
          sheets={[makeSheet(TypeEnum.DX)]}
          availableTypes={[TypeEnum.DX]}
          activeType={TypeEnum.DX}
          activeDifficulty={DifficultyEnum.Master}
          onTypeChange={vi.fn()}
          onDifficultyChange={vi.fn()}
          hrefFor={() => '/songs/s/dx/master'}
        />
      </LocaleProvider>,
    )

    expect(screen.queryByRole('tablist', { name: '譜面タイプ' })).toBeNull()
    expect(screen.getByText('でらっくす')).toBeTruthy()
  })

  it('activates a chart tab link with Space as well as Enter', async () => {
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
      { wrapper: EnglishLocale },
    )

    const expert = screen.getByRole('tab', { name: 'EXPERT' })
    expect(expert.getAttribute('href')).toBe('/songs/s/dx/expert?locale=ja')
    const notCancelled = fireEvent.keyDown(expert, { key: ' ' })
    expect(notCancelled).toBe(false)
    await waitFor(() => expect(onDifficultyChange).toHaveBeenCalledWith(DifficultyEnum.Expert, TypeEnum.DX))
  })

  it('selects a tapped tab at once and switches the chart after that paint', async () => {
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
        hrefFor={(type, difficulty) => `/songs/s/${type}/${difficulty}`}
      />,
      { wrapper: EnglishLocale },
    )

    const expert = screen.getByRole('tab', { name: 'EXPERT' })
    fireEvent.click(expert)
    expect(expert.getAttribute('aria-selected')).toBe('true')
    expect(onDifficultyChange).not.toHaveBeenCalled()
    await waitFor(() => expect(onDifficultyChange).toHaveBeenCalledTimes(1))
  })

  it('switches to a difficulty of the type picked just before', async () => {
    const onTypeChange = vi.fn()
    const onDifficultyChange = vi.fn()
    render(
      <SongSheetTabs
        sheets={[
          makeSheet(TypeEnum.DX),
          makeSheet(TypeEnum.STD),
          { ...makeSheet(TypeEnum.STD), id: 'std-expert', difficulty: DifficultyEnum.Expert },
        ]}
        availableTypes={[TypeEnum.STD, TypeEnum.DX]}
        activeType={TypeEnum.DX}
        activeDifficulty={DifficultyEnum.Master}
        onTypeChange={onTypeChange}
        onDifficultyChange={onDifficultyChange}
        hrefFor={(type, difficulty) => `/songs/s/${type}/${difficulty ?? ''}`}
      />,
      { wrapper: EnglishLocale },
    )

    fireEvent.click(screen.getByRole('tab', { name: m.song_type_std({}, { locale: 'en' }) }))
    fireEvent.click(screen.getByRole('tab', { name: 'EXPERT' }))
    await waitFor(() => expect(onDifficultyChange).toHaveBeenCalledWith(DifficultyEnum.Expert, TypeEnum.STD))
    // The later tap replaces the type switch still waiting for its paint
    expect(onTypeChange).not.toHaveBeenCalled()
  })

  it('forgets a finished switch, so navigating back to where it started selects that tab', async () => {
    const sheets = [
      makeSheet(TypeEnum.DX),
      { ...makeSheet(TypeEnum.DX), id: 'expert', difficulty: DifficultyEnum.Expert },
    ]
    const onDifficultyChange = vi.fn()
    const tabs = (activeDifficulty: DifficultyEnum, songSheets = sheets) => (
      <SongSheetTabs
        sheets={songSheets}
        availableTypes={[TypeEnum.DX]}
        activeType={TypeEnum.DX}
        activeDifficulty={activeDifficulty}
        onTypeChange={vi.fn()}
        onDifficultyChange={onDifficultyChange}
        hrefFor={(type, difficulty) => `/songs/s/${type}/${difficulty}`}
      />
    )
    const view = render(tabs(DifficultyEnum.Master), { wrapper: EnglishLocale })

    fireEvent.click(screen.getByRole('tab', { name: 'EXPERT' }))
    await waitFor(() => expect(onDifficultyChange).toHaveBeenCalledTimes(1))
    view.rerender(tabs(DifficultyEnum.Expert))
    // Back, or a link to the chart the switch started from
    view.rerender(tabs(DifficultyEnum.Master))
    expect(screen.getByRole('tab', { name: 'MASTER' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.click(screen.getByRole('tab', { name: 'EXPERT' }))
    await waitFor(() => expect(onDifficultyChange).toHaveBeenCalledTimes(2))

    // A switch that another song's page interrupts is forgotten too
    const otherSong = sheets.map((sheet) => ({ ...sheet }))
    view.rerender(tabs(DifficultyEnum.Master, otherSong))
    view.rerender(tabs(DifficultyEnum.Master, otherSong))
    expect(screen.getByRole('tab', { name: 'MASTER' }).getAttribute('aria-selected')).toBe('true')
  })
})