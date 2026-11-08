import type { FC, ReactNode } from 'react'

/**
 * The skip link. It moves focus to the main content without changing the URL: following `#main-content` natively would
 * push a history entry the router knows nothing about, and the page's own way back (BackToHomeLink's step back to the
 * entry it came from) would then land on that fragment instead. The href stays, so it still works without JS.
 */
export const SkipToContentLink: FC<{ children: ReactNode }> = ({ children }) => (
  <a
    href="#main-content"
    className="skip-to-content"
    onClick={(event) => {
      const main = document.getElementById('main-content')
      if (!main) return
      event.preventDefault()
      main.focus({ preventScroll: true })
      main.scrollIntoView({ block: 'start' })
    }}
  >
    {children}
  </a>
)