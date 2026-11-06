import { useCanGoBack, useRouter } from '@tanstack/react-router'
import type { FC, MouseEvent } from 'react'
import MdiArrowLeft from '~icons/mdi/arrow-left'
import { InternalLink, isPlainNavigationClick } from '@/components/global/InternalLink'
import { useNavigationOrigin } from '@/components/layout/navigationOrigins'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'

/**
 * "← Home" on a page the visitor opened from the home page (New charts after "See all" or the Explore card). Going
 * back rather than to a fresh home page puts them where they left it, scroll position and search included; a modified
 * click opens the home page in a new tab. Where they came from is known on the client only, so the link appears after
 * hydration and the server and cached HTML stay the same for everyone.
 */
export const BackToHomeLink: FC<{ className?: string }> = ({ className }) => {
  const locale = useLocale()
  const router = useRouter()
  const canGoBack = useCanGoBack()
  const origin = useNavigationOrigin()

  if (origin?.pathname !== '/') return null

  return (
    <InternalLink
      // The Home it came from, search included, for a new tab or when Back is not available
      href={origin.href}
      aria-label={m.root_notFound_backToHome({}, { locale })}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        // The entry before this one is the home page (that is how this page was reached), so Back returns to it
        if (!canGoBack || !isPlainNavigationClick(event)) return
        event.preventDefault()
        router.history.back()
      }}
      className={`-ml-2 inline-flex min-h-8 items-center gap-1 self-start rounded-[var(--radius-md)] pl-1 pr-2.5 text-sm font-semibold text-accent-strong no-underline transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)] hover:bg-black/4 ${className ?? ''}`}
    >
      <MdiArrowLeft aria-hidden="true" className="size-5" />
      {m.home_tabLabel({}, { locale })}
    </InternalLink>
  )
}