import { TypeEnum } from '@gekichumai/dxdata'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DifficultyLevelBadge, LampBadges, RankBadge, SheetTypeBadge } from '../ScoreBadges'

describe('ScoreBadges', () => {
  it('labels combo and sync lamps with their in-game names', () => {
    const { container } = render(<LampBadges comboFlag="app" syncFlag="fsdp" />)
    expect(container.textContent).toBe('AP+FDX+')
  })

  it('renders nothing without a lamp', () => {
    const { container } = render(<LampBadges comboFlag={null} syncFlag={null} />)
    expect(container.textContent).toBe('')
  })

  it('shows the achievement rank', () => {
    expect(render(<RankBadge achievementRate={100.5} />).container.textContent).toBe('SSS+')
    expect(render(<RankBadge achievementRate={99.2} />).container.textContent).toBe('SS')
  })

  it('names the chart type in text, not only the plate artwork', () => {
    expect(render(<SheetTypeBadge type={TypeEnum.DX} />).container.textContent).toContain('DX')
    expect(render(<SheetTypeBadge type={TypeEnum.STD} />).container.textContent).toContain('STD')
  })

  it('pairs the difficulty name with the level, full name for screen readers', () => {
    const { container } = render(<DifficultyLevelBadge difficulty="master" level="14.8" />)
    const pill = container.firstElementChild as HTMLElement
    expect(pill.title).toBe('MASTER 14.8')
    expect(pill.querySelector('.sr-only')?.textContent).toBe('MASTER 14.8')
  })

  it('shows the short name in the pill and keeps the full name accessible', () => {
    const { container } = render(<DifficultyLevelBadge difficulty="remaster" level="12.8" />)
    const pill = container.firstElementChild as HTMLElement
    const visible = [...pill.querySelectorAll('.inline-grid > :not(.invisible)')].map((node) => node.textContent)
    expect(visible).toEqual(['Re:MAS', '12.8'])
    expect(pill.querySelector('.sr-only')?.textContent).toBe('Re:MASTER 12.8')
    expect(pill.title).toBe('Re:MASTER 12.8')
  })

  it('sizes every pill by the same hidden samples, so the level starts at the same x on every row', () => {
    const sizers = (difficulty: string) =>
      [
        ...render(<DifficultyLevelBadge difficulty={difficulty} level="9.0" />).container.querySelectorAll(
          '.invisible',
        ),
      ].map((node) => node.textContent)
    expect(sizers('basic')).toEqual(sizers('remaster'))
    expect(sizers('basic')).toEqual(['BASIC', 'ADV', 'EXPERT', 'MASTER', 'Re:MAS', '宴', '00.0'])
  })
})