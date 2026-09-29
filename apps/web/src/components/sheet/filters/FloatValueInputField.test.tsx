import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FloatValueInputField } from './FloatValueInputField'

afterEach(cleanup)

describe('FloatValueInputField', () => {
  it('keeps the supplied value and rounds edited values to one decimal place', () => {
    const onChange = vi.fn()
    const { rerender } = render(<FloatValueInputField value={8.7} onChange={onChange} />)
    const input = screen.getByRole<HTMLInputElement>('spinbutton')
    expect(input.value).toBe('8.7')

    rerender(<FloatValueInputField value={12.3} onChange={onChange} />)
    expect(input.value).toBe('12.3')
    fireEvent.change(input, { target: { value: '14.24' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith(14.2)
    expect(input.value).toBe('14.2')
  })

  it('resets an empty edit to the current value without submitting it', () => {
    const onChange = vi.fn()
    render(<FloatValueInputField value={9.8} onChange={onChange} />)
    const input = screen.getByRole<HTMLInputElement>('spinbutton')
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect(onChange).not.toHaveBeenCalled()
    expect(input.value).toBe('9.8')
  })
})