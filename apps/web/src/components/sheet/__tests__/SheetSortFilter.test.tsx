import { renderToString } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n } from '@/setup/init-i18n'
import { SheetSortFilter } from '../SheetSortFilter'

vi.mock('@hookform/devtools', () => ({
  DevTool: () => null,
}))

describe('SheetSortFilter', () => {
  beforeAll(() => {
    initI18n()
  })

  it('does not read localStorage during render', () => {
    const originalLocalStorage = window.localStorage
    const getItem = vi.fn(() => null)
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem,
        removeItem: vi.fn(),
        setItem: vi.fn(),
      },
    })

    try {
      renderToString(<SheetSortFilter />)

      expect(getItem).not.toHaveBeenCalled()
    } finally {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: originalLocalStorage,
      })
    }
  })
})