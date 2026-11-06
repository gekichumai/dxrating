import { Link, useCanGoBack, useLocation, useRouter } from '@tanstack/react-router'
import type { FC } from 'react'
import { useTranslation } from 'react-i18next'
import MdiArrowLeft from '~icons/mdi/arrow-left'
import { useHydrated } from '@/models/scores/useScoreRepository'

/**
 * A way back to the home page, on a page the home page links to as "See all" (it marks those links with the
 * `fromHome` history state). Going back rather than to a fresh home page puts the visitor where they left it, scroll
 * position included. History state never reaches the server, so the link renders after hydration only and the cached
 * HTML stays the same for everyone.
 */
export const BackToHomeLink: FC<{ className?: string }> = ({ className }) => {
  const { t } = useTranslation(['home'])
  const hydrated = useHydrated()
  const fromHome = useLocation({ select: (location) => location.state.fromHome === true })
  // True only when the previous entry is a page of this app, so Back never leaves the site
  const canGoBack = useCanGoBack()
  const router = useRouter()

  if (!hydrated || !fromHome) return null

  return (
    <Link
      to="/"
      aria-label={t('home:back-to-home')}
      onClick={(event) => {
        if (!canGoBack || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
        event.preventDefault()
        router.history.back()
      }}
      className={`-ml-2 inline-flex min-h-8 items-center gap-1 self-start rounded-[var(--radius-md)] pl-1 pr-2.5 text-sm font-semibold text-accent-strong no-underline transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)] hover:bg-black/4 ${className ?? ''}`}
    >
      <MdiArrowLeft aria-hidden="true" className="size-5" />
      {t('home:tab-label')}
    </Link>
  )
}