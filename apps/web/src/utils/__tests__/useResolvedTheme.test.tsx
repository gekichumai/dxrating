import { act, renderHook, waitFor } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { THEME_ATTRIBUTE } from '@/setup/theme-script'
import { useResolvedTheme } from '../useResolvedTheme'

describe('useResolvedTheme', () => {
  afterEach(() => document.documentElement.removeAttribute(THEME_ATTRIBUTE))

  it('is undefined in a server render, so it cannot decide server markup', () => {
    document.documentElement.setAttribute(THEME_ATTRIBUTE, 'dark')
    const Probe = () => <span>{useResolvedTheme() ?? 'none'}</span>
    expect(renderToString(<Probe />)).toContain('none')
  })

  it('reads <html data-theme> and follows changes to it', async () => {
    document.documentElement.setAttribute(THEME_ATTRIBUTE, 'light')
    const { result } = renderHook(() => useResolvedTheme())
    expect(result.current).toBe('light')

    act(() => {
      document.documentElement.setAttribute(THEME_ATTRIBUTE, 'dark')
    })
    // MutationObserver callbacks are delivered asynchronously
    await waitFor(() => expect(result.current).toBe('dark'))
  })
})