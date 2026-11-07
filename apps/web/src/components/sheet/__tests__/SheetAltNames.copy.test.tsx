import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '@/i18n/LocaleProvider'
import type { SupportedLocale } from '@/setup/locale'
import { SheetAltNames } from '../SheetAltNames'

const { success } = vi.hoisted(() => ({ success: vi.fn() }))
vi.mock('react-hot-toast', () => ({ default: { success } }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

const LONG_ALIAS = 'a long alias with spaces, punctuation and more than fifty characters in it!'

function clickAlias(alias: string, locale: SupportedLocale) {
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  render(
    <LocaleProvider initialLocale={locale}>
      <SheetAltNames altNames={[` ${alias} `]} />
    </LocaleProvider>,
  )
  const chip = screen.getByRole('button', { name: alias })
  fireEvent.click(chip)
  return { chip, writeText, toast: String(success.mock.calls[0]?.[0]) }
}

describe('song aliases', () => {
  it.each(['キミシラ', LONG_ALIAS])('copy the alias itself (%s) outside Chinese locales', (alias) => {
    const { chip, writeText, toast } = clickAlias(alias, 'en')
    expect(chip.getAttribute('title')).toBe('Copy alias')
    expect(writeText).toHaveBeenCalledWith(alias)
    expect(toast).toContain(alias)
    expect(toast).not.toContain('是什么歌')
  })

  it.each(['zh-Hans', 'zh-Hant'] as const)('copy a short alias as its 是什么歌 link in %s', (locale) => {
    const { writeText, toast } = clickAlias('我的 歌（DX）', locale)
    expect(writeText).toHaveBeenCalledWith('https://我的-歌-DX-.是什么歌.com')
    expect(toast).toContain('我的-歌-DX-.是什么歌.com')
  })

  it.each(['zh-Hans', 'zh-Hant'] as const)('copy a long alias as a 是什么歌 question in %s', (locale) => {
    const { writeText, toast } = clickAlias(LONG_ALIAS, locale)
    expect(writeText).toHaveBeenCalledWith(`${LONG_ALIAS}是什么歌`)
    expect(toast).toContain(`${LONG_ALIAS}是什么歌`)
  })
})