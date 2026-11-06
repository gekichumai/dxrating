import { DifficultyEnum, ServerEnum } from '@gekichumai/dxdata'
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SheetDifficulty } from '../SheetListItem'

vi.mock('posthog-js/react', () => ({ usePostHog: () => null }))
vi.mock('web-haptics/react', () => ({ useWebHaptics: () => ({ trigger: vi.fn() }) }))

const sizers = (pill: Element) => [...pill.querySelectorAll('.invisible')].map((node) => node.textContent)

describe('SheetDifficulty', () => {
  it('shows the short name and keeps the full name in the title and for screen readers', () => {
    const { container } = render(<SheetDifficulty difficulty={DifficultyEnum.ReMaster} serverIds={[ServerEnum.JP]} />)
    const pill = container.firstElementChild as HTMLElement
    expect(pill.title).toBe('Re:MASTER')
    expect(pill.querySelector('.text-center')?.textContent).toBe('Re:MAS')
    expect(pill.querySelector('.sr-only')?.textContent).toBe('Re:MASTER')
  })

  it('is sized by the same samples for every difficulty, with or without the lock icon', () => {
    const plain = render(<SheetDifficulty difficulty={DifficultyEnum.Basic} serverIds={[ServerEnum.JP]} />)
    const locked = render(<SheetDifficulty difficulty={DifficultyEnum.Advanced} serverIds={[ServerEnum.JP]} isLocked />)
    const samples = ['BAS', 'ADV', 'EXP', 'MAS', 'Re:MAS']
    // Without an icon the name column's own text is hidden too (the name is centred across the pill instead)
    expect(sizers(plain.container.firstElementChild!)).toEqual([...samples, 'BAS'])
    expect(sizers(locked.container.firstElementChild!)).toEqual(samples)
    // Both use the same two-column grid: a 1rem icon slot and the name column
    expect(plain.container.firstElementChild!.className).toBe(locked.container.firstElementChild!.className)
  })
})