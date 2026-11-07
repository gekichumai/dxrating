import { IconButton } from '@mui/material'
import { useCanGoBack, useRouter } from '@tanstack/react-router'
import type { FC, MouseEvent } from 'react'
import MdiArrowLeft from '~icons/mdi/arrow-left'
import { withLocaleQuery } from '@/setup/locale'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'

const isSameOrigin = (url: string, origin: string) => {
  try {
    return new URL(url).origin === origin
  } catch {
    return false
  }
}

/**
 * Whether the previous history entry is a page of this site, so Back can return to it rather than open the home page.
 * The router counts in-app navigations (`canGoBack`). List pages that link here with plain anchors load a new
 * document instead, whose entry has a same-site referrer. A link opened in a new tab has a same-site referrer too, but
 * nothing before it in that tab's history.
 */
export const canReturnWithinSite = ({
  canGoBack,
  referrer,
  origin,
  historyLength,
}: {
  canGoBack: boolean
  referrer: string
  origin: string
  historyLength: number
}) => canGoBack || (historyLength > 1 && isSameOrigin(referrer, origin))

const isModifiedClick = (event: MouseEvent) =>
  event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0

/**
 * The back arrow of the song and chart pages: returns to the page the visitor came from on this site, or opens the
 * home page (chart search) when they arrived from elsewhere. The href is the home page, so the server markup depends on
 * the URL alone and a modified click (new tab) still opens something useful.
 */
export const SongBackLink: FC<{ search: unknown; className?: string }> = ({ search, className }) => {
  const locale = useLocale()
  const router = useRouter()
  const canGoBack = useCanGoBack()
  const homeHref = withLocaleQuery('/', search)

  return (
    <IconButton
      component="a"
      href={homeHref}
      size="small"
      aria-label={m.song_back({}, { locale })}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        if (isModifiedClick(event)) return
        event.preventDefault()
        const returnWithinSite = canReturnWithinSite({
          canGoBack,
          referrer: document.referrer,
          origin: window.location.origin,
          historyLength: window.history.length,
        })
        if (returnWithinSite) router.history.back()
        else void router.navigate({ href: homeHref })
      }}
      className={className}
    >
      <MdiArrowLeft aria-hidden />
    </IconButton>
  )
}