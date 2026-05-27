import { IconButton } from '@mui/material'
import { lazy, Suspense, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import MdiGithub from '~icons/mdi/github'
import MdiLogin from '~icons/mdi/login'
import DiscordLogo from '~icons/simple-icons/discord'
import { BUNDLE } from '../../utils/bundle'
import { RelativeTime } from '../../utils/useTime'
import { useVersionTheme } from '../../utils/useVersionTheme'
import { Logo } from '../global/Logo'
import { LocaleSelector } from '../global/preferences/LocaleSelector'
import { About } from '../global/site-meta/About'

const UserChip = lazy(() => import('../global/preferences/UserChip').then((module) => ({ default: module.UserChip })))

const renderUserChipFallback = (onClick?: () => void) => (
  <IconButton aria-label="Sign in" title="Sign in" onClick={onClick}>
    <MdiLogin />
  </IconButton>
)

const userChipFallback = renderUserChipFallback()

function DeferredUserChip() {
  const [loadUserChip, setLoadUserChip] = useState(false)

  useEffect(() => {
    const schedule = window.requestIdleCallback ?? ((callback: IdleRequestCallback) => window.setTimeout(callback, 1200))
    const cancel = window.cancelIdleCallback ?? window.clearTimeout
    const id = schedule(() => setLoadUserChip(true), { timeout: 3000 })

    return () => cancel(id)
  }, [])

  if (!loadUserChip) {
    return renderUserChipFallback(() => setLoadUserChip(true))
  }

  return (
    <Suspense fallback={userChipFallback}>
      <UserChip />
    </Suspense>
  )
}

export const TopBar = () => {
  const versionTheme = useVersionTheme()
  const { t } = useTranslation(['root'])

  return (
    <div style={{ background: versionTheme.accentColor }}>
      <div className="flex items-center pt-[calc(env(safe-area-inset-top)+1rem)] max-w-7xl mx-auto pl-[calc(env(safe-area-inset-left)+1rem)] pr-[calc(env(safe-area-inset-right)+1rem)] flex-col sm:flex-row items-stretch sm:items-center gap-y-4 gap-x-2">
        <div className="flex flex-col items-start justify-center gap-1 select-none relative">
          <Logo />
          <div className="text-xs text-black/75 leading-none">
            {BUNDLE.version ?? 'unknown'} (<RelativeTime time={BUNDLE.buildTime} length="short" />)
          </div>
        </div>

        <div className="flex gap-2 flex-1 flex-col 2xs:flex-row items-stretch gap-2">
          <div className="flex flex-row items-center gap-2 sm:items-center flex-1">
            <IconButton
              size="small"
              // new discord branding color
              className="bg-[#5865F2] hover:bg-[#5865F299] border-1 border-solid border-black/20 text-white shadow size-10"
              LinkComponent="a"
              href="https://discord.gg/8CFgUPxyrU"
              target="_blank"
              rel="noopener"
              aria-label={t('root:external-links.discord')}
              title={t('root:external-links.discord')}
            >
              <DiscordLogo className="size-4" />
            </IconButton>

            <IconButton
              size="small"
              className="bg-zinc-800 hover:bg-zinc-700 border-1 border-solid border-black/20 text-white shadow size-10"
              LinkComponent="a"
              href="https://github.com/gekichumai/dxrating"
              target="_blank"
              rel="noopener"
              aria-label={t('root:external-links.github')}
              title={t('root:external-links.github')}
            >
              <MdiGithub className="size-4" />
            </IconButton>
          </div>

          <div className="flex">
            <LocaleSelector />
            <About />
            <DeferredUserChip />
          </div>
        </div>
      </div>
    </div>
  )
}
