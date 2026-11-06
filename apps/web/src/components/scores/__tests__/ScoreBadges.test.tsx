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

  it('pairs the difficulty name with the level', () => {
    const { container } = render(<DifficultyLevelBadge difficulty="master" level="14.8" />)
    expect(container.textContent).toBe('MASTER14.8')
  })
})