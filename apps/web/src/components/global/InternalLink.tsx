import { useRouter } from '@tanstack/react-router'
import {
  type AnchorHTMLAttributes,
  type FC,
  forwardRef,
  type MouseEvent,
  type RefObject,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { createPortal } from 'react-dom'
import { NAVIGATION_FEEDBACK_DELAY_MS } from '@/components/layout/NavigationProgress'
import { useLocale } from '@/i18n/LocaleProvider'
import { DEFAULT_LOCALE, type SupportedLocale, localizePath, splitLocalePath } from '@/setup/locale'

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

/** A path without its search and hash, decoded, so the router's location and an href compare equal */
const pathnameOf = (path: string) => {
  const pathname = path.split(/[?#]/, 1)[0]
  try {
    return decodeURI(pathname)
  } catch {
    return pathname
  }
}

/**
 * An internal page href as the given language's URL (`/rating` → `/ja/rating`), for the markup: crawlers and new tabs
 * get the page in the language it was linked from. An href that already names a language is kept.
 */
export const localizeHref = (href: string, locale: SupportedLocale) => {
  if (locale === DEFAULT_LOCALE || !isClientRoutableHref(href)) return href
  if (splitLocalePath(pathnameOf(href)).locale !== DEFAULT_LOCALE) return href
  return localizePath(href, locale)
}

/** The latest navigation any InternalLink started, page-wide */
let latestLinkNavigation = 0
const linkNavigationListeners = new Set<() => void>()
const startLinkNavigation = () => {
  latestLinkNavigation += 1
  for (const listener of linkNavigationListeners) listener()
  return latestLinkNavigation
}
const getLatestLinkNavigation = () => latestLinkNavigation
const subscribeLinkNavigations = (listener: () => void) => {
  linkNavigationListeners.add(listener)
  return () => linkNavigationListeners.delete(listener)
}

/**
 * An anchor whose internal `href` navigates through the router. The markup stays a real `<a href>` (crawlable, opens
 * in a new tab), and a plain click moves to the page without reloading the document. While that navigation loads
 * (its loaders run first), a small spinner shows beside the link that was clicked, after the same short delay as the
 * top progress bar. External and non-page hrefs behave like any `<a>`. Outside a router (some unit tests) it is a
 * plain anchor.
 */
export const InternalLink = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement>>(
  ({ href, onClick, ...rest }, ref) => {
    const router = useRouter({ warn: false })
    const locale = useLocale()
    const anchorRef = useRef<HTMLAnchorElement>(null)
    useImperativeHandle(ref, () => anchorRef.current as HTMLAnchorElement)
    // The id of this link's own navigation, if it started one. Only the latest link navigation on the page shows its
    // feedback: clicking another link before this one's page loads moves the spinner there at once (the router chains
    // the replaced navigation's promise to the new one, so this one's would otherwise settle only when that loads)
    const [navigationId, setNavigationId] = useState<number>()
    const latestNavigationId = useSyncExternalStore(subscribeLinkNavigations, getLatestLinkNavigation, () => 0)
    const navigating = navigationId !== undefined && navigationId === latestNavigationId

    // Any other navigation that starts towards somewhere else (a tab-bar Link, Back, a programmatic navigate) also
    // abandons this one, so its feedback clears then rather than when that navigation finishes
    const pending = navigationId !== undefined
    useEffect(() => {
      if (!router || !pending || !href) return undefined
      const target = pathnameOf(href)
      const unsubscribe = router.subscribe('onBeforeLoad', ({ toLocation }) => {
        if (pathnameOf(toLocation.pathname) !== target) setNavigationId(undefined)
      })
      // A navigation started in the same task as the click (before this effect ran) emitted its event already: the
      // router's latest destination tells whether this link's navigation was replaced in the meantime
      const destination = router.latestLocation?.pathname
      if (destination !== undefined && pathnameOf(destination) !== target) setNavigationId(undefined)
      return unsubscribe
    }, [router, pending, href])

    const handleClick = useCallback(
      (event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event)
        if (!router || !isClientRoutableHref(href) || !isPlainNavigationClick(event)) return
        event.preventDefault()
        const id = startLinkNavigation()
        setNavigationId(id)
        // Settles once the next page has loaded (or once a navigation that replaced this one has). The router adds the
        // current language's prefix itself (router.tsx)
        void Promise.resolve(router.navigate({ href })).finally(() => {
          setNavigationId((current) => (current === id ? undefined : current))
        })
      },
      [href, onClick, router],
    )

    return (
      <>
        <a
          ref={anchorRef}
          href={href && localizeHref(href, locale)}
          onClick={handleClick}
          aria-busy={navigating || undefined}
          {...rest}
        />
        {navigating && <PendingSpinner anchorRef={anchorRef} />}
      </>
    )
  },
)
InternalLink.displayName = 'InternalLink'

const SPINNER_SIZE = 14
const SPINNER_GAP = 6

type SpinnerPlacement = { left: number; top: number; inset: boolean }

/**
 * Where the spinner goes: after the last line of an inline text link, where it reads as part of the sentence; inside
 * the top-right corner of anything boxed (a card, a row, a button, a tab), on a backing, so it plainly belongs to that
 * box rather than sitting in the gap before the next one. An inline link at the window's edge also moves inside.
 */
export const placeLinkSpinner = (anchor: HTMLElement, viewportWidth: number): SpinnerPlacement => {
  const lines = anchor.getClientRects()
  if (getComputedStyle(anchor).display === 'inline' && lines.length > 0) {
    const line = lines[lines.length - 1]
    const left = line.right + SPINNER_GAP
    if (left + SPINNER_SIZE <= viewportWidth - 2) return { left, top: line.top + line.height / 2, inset: false }
    return { left: line.right - SPINNER_SIZE, top: line.top + line.height / 2, inset: true }
  }
  const box = anchor.getBoundingClientRect()
  const inset = Math.min(8, box.height / 4)
  return { left: box.right - SPINNER_SIZE - inset, top: box.top + inset + SPINNER_SIZE / 2, inset: true }
}

/**
 * A small spinner beside an element whose action is loading (a clicked link, the version switcher). Mount it while
 * the work runs; it shows after the feedback delay and follows the element if the page scrolls.
 */
export const PendingSpinner: FC<{ anchorRef: RefObject<HTMLElement | null> }> = ({ anchorRef }) => {
  const [placement, setPlacement] = useState<SpinnerPlacement>()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), NAVIGATION_FEEDBACK_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [])

  useLayoutEffect(() => {
    if (!visible) return undefined
    const update = () => {
      if (anchorRef.current?.isConnected) setPlacement(placeLinkSpinner(anchorRef.current, window.innerWidth))
    }
    update()
    window.addEventListener('scroll', update, { passive: true, capture: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, { capture: true })
      window.removeEventListener('resize', update)
    }
  }, [anchorRef, visible])

  if (!visible || !placement) return null
  return createPortal(
    <span
      aria-hidden="true"
      data-testid="link-pending-spinner"
      className={`navigation-link-spinner${placement.inset ? ' navigation-link-spinner--inset' : ''}`}
      style={{ left: placement.left, top: placement.top }}
    />,
    document.body,
  )
}

/**
 * MUI's link component (the theme sets it on Link and every ButtonBase: Button, IconButton, MenuItem,
 * ListItemButton, Tab, ...), so an MUI `href` gets the same client navigation as {@link InternalLink}
 */
export const LinkBehavior = InternalLink