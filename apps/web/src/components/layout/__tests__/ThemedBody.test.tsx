import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { VERSION_THEME } from '@/theme'
import { VersionEnum } from '@gekichumai/dxdata'
import { useVersionTheme } from '@/utils/useVersionTheme'
import { ThemedBody } from '../ThemedBody'

vi.mock('@/utils/useVersionTheme', () => ({ useVersionTheme: vi.fn() }))

describe('document canvas before hydration', () => {
  it.each(Object.values(VERSION_THEME))('paints each theme in the server HTML', (theme) => {
    vi.mocked(useVersionTheme).mockReturnValue(theme)
    const markup = renderToStaticMarkup(
      <ThemedBody>
        <main>Content</main>
      </ThemedBody>,
    )
    const canvas = theme.canvasColor ?? theme.accentColor
    expect(markup).toContain(`background-color:${canvas}`)
    expect(markup).toContain(`--theme-canvas:${canvas}`)
    expect(markup).toContain('<main>Content</main>')
  })

  it('uses theme data rather than a MAGiCAL-specific color branch', () => {
    vi.mocked(useVersionTheme).mockReturnValue({
      ...VERSION_THEME[VersionEnum.MAGiCAL],
      canvasColor: 'rebeccapurple',
    })
    expect(renderToStaticMarkup(<ThemedBody />)).toContain('background-color:rebeccapurple')
  })
})