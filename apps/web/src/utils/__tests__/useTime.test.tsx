import i18n from 'i18next'
import { render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '@/i18n/LocaleProvider'
import { initI18n } from '@/setup/init-i18n'
import { RenderEnvironmentProvider } from '../renderEnvironment'
import { useTime } from '../useTime'

function TimeProbe() {
  return <span>{useTime('2026-07-18T03:20:00.000Z', 'short')}</span>
}

describe('useTime', () => {
  beforeAll(() => {
    initI18n()
  })

  afterEach(async () => {
    vi.useRealTimers()
    await i18n.changeLanguage('en')
  })

  it('formats relative time with the active i18n locale', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.parse('2026-07-18T03:40:00.000Z'))
    await i18n.changeLanguage('zh-Hans')

    render(
      <I18nextProvider i18n={i18n}>
        <LocaleProvider initialLocale="zh-Hans">
          <RenderEnvironmentProvider renderedAt={Date.parse('2026-07-18T03:40:00.000Z')}>
            <TimeProbe />
          </RenderEnvironmentProvider>
        </LocaleProvider>
      </I18nextProvider>,
    )

    expect(screen.getByText('20分钟前')).toBeTruthy()
  })

  it('abbreviates units in the short form', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.parse('2026-07-18T03:40:00.000Z'))
    await i18n.changeLanguage('en')

    render(
      <I18nextProvider i18n={i18n}>
        <LocaleProvider initialLocale="en">
          <RenderEnvironmentProvider renderedAt={Date.parse('2026-07-18T03:40:00.000Z')}>
            <TimeProbe />
          </RenderEnvironmentProvider>
        </LocaleProvider>
      </I18nextProvider>,
    )

    expect(screen.getByText('20 min. ago')).toBeTruthy()
  })
})