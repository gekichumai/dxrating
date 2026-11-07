import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '@/i18n/LocaleProvider'
import { RenderEnvironmentProvider } from '../renderEnvironment'
import { useTime } from '../useTime'

function TimeProbe() {
  return <span>{useTime('2026-07-18T03:20:00.000Z', 'short')}</span>
}

describe('useTime', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('formats relative time with the active locale', () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.parse('2026-07-18T03:40:00.000Z'))

    render(
      <LocaleProvider initialLocale="zh-Hans">
        <RenderEnvironmentProvider renderedAt={Date.parse('2026-07-18T03:40:00.000Z')}>
          <TimeProbe />
        </RenderEnvironmentProvider>
      </LocaleProvider>,
    )

    expect(screen.getByText('20分钟前')).toBeTruthy()
  })

  it('abbreviates units in the short form', () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.parse('2026-07-18T03:40:00.000Z'))

    render(
      <LocaleProvider initialLocale="en">
        <RenderEnvironmentProvider renderedAt={Date.parse('2026-07-18T03:40:00.000Z')}>
          <TimeProbe />
        </RenderEnvironmentProvider>
      </LocaleProvider>,
    )

    expect(screen.getByText('20 min. ago')).toBeTruthy()
  })
})