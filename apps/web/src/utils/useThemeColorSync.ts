import { useEffect } from 'react'
import { THEME_ATTRIBUTE } from '@/setup/theme-script'

/**
 * Keeps <meta name="theme-color"> (browser chrome, the mobile status bar) on the header's colour: the version accent
 * as server-rendered in light, and the deepened accent band (--accent-band, dark.css) in dark. Runs after mount only,
 * so the server render and the first client render stay identical; it follows theme and version changes.
 */
export function useThemeColorSync(accentColor: string) {
  useEffect(() => {
    const root = document.documentElement
    const apply = () => {
      const meta = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      if (!meta) return
      if (root.getAttribute(THEME_ATTRIBUTE) !== 'dark') {
        meta.content = accentColor
        return
      }
      const probe = document.createElement('div')
      probe.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden;background:var(--accent-band)'
      document.body.appendChild(probe)
      meta.content = getComputedStyle(probe).backgroundColor || accentColor
      probe.remove()
    }
    apply()
    const observer = new MutationObserver(apply)
    observer.observe(root, { attributes: true, attributeFilter: [THEME_ATTRIBUTE] })
    return () => observer.disconnect()
  }, [accentColor])
}