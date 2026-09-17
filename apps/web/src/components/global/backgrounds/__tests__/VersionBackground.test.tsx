import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { VERSION_THEME } from '@/theme'
import { VersionEnum } from '@gekichumai/dxdata'
import { useVersionTheme } from '@/utils/useVersionTheme'
import { VersionBackground } from '../VersionBackground'

vi.mock('@/utils/useVersionTheme', () => ({ useVersionTheme: vi.fn() }))

describe('version backgrounds', () => {
  it('server-renders the same decorative MAGiCAL SVG scene without viewport reads', () => {
    vi.mocked(useVersionTheme).mockReturnValue(VERSION_THEME[VersionEnum.MAGiCAL])
    const first = renderToStaticMarkup(<VersionBackground />)
    const second = renderToStaticMarkup(<VersionBackground />)
    expect(first).toBe(second)
    expect(first).toContain('class="magical-background" aria-hidden="true"')
    expect(first).toContain('viewBox="400 870 1200 660"')
    expect(first).toContain('#emblems')
    expect(first).toContain('#palace')
    expect(first).toContain('magical-background__character')
    expect(first).not.toContain('background.webp')
    expect(first).not.toContain('base64')
    expect(first).not.toContain('<title>')
  })

  it('retains the existing image and resolution selection for earlier versions', () => {
    vi.mocked(useVersionTheme).mockReturnValue(VERSION_THEME[VersionEnum.PRiSM])
    const markup = renderToStaticMarkup(<VersionBackground />)
    expect(markup).toContain('<picture>')
    expect(markup).toContain('https://shama.dxrating.net/images/background/prism.webp')
    expect(markup).toContain('prism@2x.webp 2x')
    expect(markup).toContain('aria-hidden="true"')
    expect(markup).not.toContain('magical-background__layer')
  })
})