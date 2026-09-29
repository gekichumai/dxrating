import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SheetFilterInternalLevelInputLongPressSlider } from './SheetFilterLevelInputLongPressSlider'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

afterEach(cleanup)

describe('SheetFilterInternalLevelInputLongPressSlider', () => {
  it('increments the upper bound from 14.2 to exactly 14.3 so boundary charts remain included', () => {
    let upperBound = 14.2
    render(
      <SheetFilterInternalLevelInputLongPressSlider
        value={upperBound}
        onChange={(value) => {
          upperBound = value
        }}
        min={9}
        max={15}
      />,
    )

    fireEvent.keyDown(screen.getByRole('button'), { key: 'ArrowUp' })

    expect(upperBound).toBe(14.3)
    expect([14.2, 14.3, 14.4].filter((level) => level <= upperBound)).toEqual([14.2, 14.3])
  })
})