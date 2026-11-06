import { useRouter } from '@tanstack/react-router'
import { type AnchorHTMLAttributes, forwardRef, type MouseEvent, useCallback } from 'react'

/** Paths the server answers on its own (llms.txt, sitemap.xml, Apple's association file, images), with no page in the router */
const SERVER_FILE_PATH = /^\/\.well-known\/|\.(?:txt|xml|json|webmanifest|ico|png|jpe?g|webp|avif|gif|svg|pdf)$/i

/**
 * Whether the router can take a navigation to `href`: a same-origin path (`/…`, not `//host`) that is a page rather
 * than a file the server answers on its own. Hashes, other schemes and absolute URLs stay with the browser. Song ids
 * may contain dots ("Mr. Wonderland"), so only known file extensions count as files.
 */
export const isClientRoutableHref = (href: string | undefined): href is string => {
  if (!href || !href.startsWith('/') || href.startsWith('//')) return false
  const pathname = href.split(/[?#]/, 1)[0]
  return !SERVER_FILE_PATH.test(pathname)
}

/**
 * Whether a click on an anchor should become a client navigation: a plain primary click that nothing else handled,
 * on a link that opens in this tab. Cmd/Ctrl/Shift/Alt and middle clicks, `target="_blank"` and `download` keep
 * the browser's behaviour (new tab, new window, save).
 */
export const isPlainNavigationClick = (event: MouseEvent<HTMLAnchorElement>) => {
  const anchor = event.currentTarget
  const target = anchor.getAttribute('target')
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    (!target || target === '_self') &&
    !anchor.hasAttribute('download')
  )
}

/**
 * An anchor whose internal `href` navigates through the router. The markup stays a real `<a href>` (crawlable, opens
 * in a new tab), and a plain click moves to the page without reloading the document. External and non-page hrefs
 * behave like any `<a>`. Outside a router (some unit tests) it is a plain anchor.
 */
export const InternalLink = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement>>(
  ({ href, onClick, ...rest }, ref) => {
    const router = useRouter({ warn: false })

    const handleClick = useCallback(
      (event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event)
        if (!router || !isClientRoutableHref(href) || !isPlainNavigationClick(event)) return
        event.preventDefault()
        void router.navigate({ href })
      },
      [href, onClick, router],
    )

    return <a ref={ref} href={href} onClick={handleClick} {...rest} />
  },
)
InternalLink.displayName = 'InternalLink'

/**
 * MUI's link component (the theme sets it on Link and every ButtonBase: Button, IconButton, MenuItem,
 * ListItemButton, Tab, ...), so an MUI `href` gets the same client navigation as {@link InternalLink}
 */
export const LinkBehavior = InternalLink