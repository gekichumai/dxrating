import { useEffect, useRef } from 'react'
import { useVersionTheme } from '../../utils/useVersionTheme'

const HEIGHT = 16 * 4
const DETECT_HEIGHT = 16 * 16

export const OverscrollBackgroundFiller = () => {
  const ref = useRef<HTMLDivElement>(null)
  const versionTheme = useVersionTheme()

  useEffect(() => {
    const onScroll = () => {
      if (ref.current) {
        ref.current.style.height = `${window.scrollY < DETECT_HEIGHT ? -window.scrollY + HEIGHT : 0}px`
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [ref])

  return (
    <div
      ref={ref}
      className="fixed top-0 left-0 right-0 w-full h-full pointer-events-none"
      style={{
        height: 0,
        background: versionTheme.accentColor,
      }}
    />
  )
}
