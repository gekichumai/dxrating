import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LevelRangePicker } from './LevelRangePicker'

describe('LevelRangePicker push preset', () => {
  it('opens the below-9 scale and keeps the real bounds of a push range below 9', () => {
    const onChange = vi.fn()
    const onShowBelow9Change = vi.fn()
    render(
      <LevelRangePicker
        range={{ min: 130, max: 140 }}
        onChange={onChange}
        showBelow9={false}
        onShowBelow9Change={onShowBelow9Change}
        pushRange={{ min: 77, max: 77 }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /random:range.push/ }))
    expect(onShowBelow9Change).toHaveBeenCalledWith(true)
    expect(onChange).toHaveBeenCalledWith({ min: 77, max: 77 })
  })

  it('leaves the scale alone for a push range from 9 up', () => {
    const onChange = vi.fn()
    const onShowBelow9Change = vi.fn()
    render(
      <LevelRangePicker
        range={{ min: 130, max: 140 }}
        onChange={onChange}
        showBelow9={false}
        onShowBelow9Change={onShowBelow9Change}
        pushRange={{ min: 131, max: 149 }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /random:range.push/ }))
    expect(onShowBelow9Change).not.toHaveBeenCalled()
    expect(onChange).toHaveBeenCalledWith({ min: 131, max: 149 })
  })
})