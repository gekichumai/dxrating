import type { CSSProperties, PropsWithChildren } from 'react'
import { useVersionTheme } from '@/utils/useVersionTheme'

/** Paint the document canvas in SSR, before any hydration effects can run. */
export function ThemedBody({ children }: PropsWithChildren) {
  const theme = useVersionTheme()
  const canvasColor = theme.canvasColor ?? theme.accentColor

  return (
    <body style={{ '--theme-canvas': canvasColor, backgroundColor: canvasColor } as CSSProperties}>{children}</body>
  )
}