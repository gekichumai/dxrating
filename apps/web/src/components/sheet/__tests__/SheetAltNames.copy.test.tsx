import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SheetAltNames } from '../SheetAltNames'

const { success } = vi.hoisted(() => ({ success: vi.fn() }))
vi.mock('react-hot-toast', () => ({ default: { success } }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('song aliases', () => {
  it.each(['キミシラ', 'a long alias with spaces, punctuation and more than fifty characters in it!'])(
    'copies the alias itself (%s), not a made-up URL',
    async (alias) => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      vi.stubGlobal('navigator', { clipboard: { writeText } })
      render(<SheetAltNames altNames={[` ${alias} `]} />)
      const chip = screen.getByRole('button', { name: alias })
      expect(chip.getAttribute('title')).toBe('Copy alias')
      fireEvent.click(chip)
      expect(writeText).toHaveBeenCalledWith(alias)
      expect(success.mock.calls[0]?.[0]).toContain(alias)
      expect(success.mock.calls[0]?.[0]).not.toContain('是什么歌')
      vi.unstubAllGlobals()
    },
  )
})