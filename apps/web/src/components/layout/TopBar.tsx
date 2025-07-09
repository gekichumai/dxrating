import { Button, IconButton } from '@mui/material'
import { useTranslation } from 'react-i18next'
import MdiGift from '~icons/mdi/gift'
import DiscordLogo from '~icons/simple-icons/discord'
import { BUNDLE } from '../../utils/bundle'
import { useTime } from '../../utils/useTime'
import { useVersionTheme } from '../../utils/useVersionTheme'
import { Logo } from '../global/Logo'
import { LocaleSelector } from '../global/preferences/LocaleSelector'
import { UserChip } from '../global/preferences/UserChip'
import { About } from '../global/site-meta/About'

export const TopBar = () => {
  const { t } = useTranslation()
  const updateTime = useTime(BUNDLE.buildTime, 'short')
  const versionTheme = useVersionTheme()

  return (
    <div style={{ background: versionTheme.accentColor }}>
      <div className="flex items-center pt-[calc(env(safe-area-inset-top)+1rem)] max-w-7xl mx-auto pl-[calc(env(safe-area-inset-left)+1rem)] pr-[calc(env(safe-area-inset-right)+1rem)] flex-col sm:flex-row items-stretch sm:items-center gap-y-4 gap-x-2">
        <div className="flex flex-col items-start justify-center gap-1 select-none relative">
          <Logo />
          <div className="text-xs text-black/50 leading-none">
            {BUNDLE.version ?? 'unknown'} ({updateTime})
          </div>
        </div>

        <div className='flex gap-2 flex-1 flex-col 2xs:flex-row items-stretch gap-2'>
          <div className='flex flex-row items-center gap-2 sm:items-center flex-1'>
            <IconButton
              size="small"
              // new discord branding color
              className="bg-[#5865F2] hover:bg-[#5865F299] border-1 border-solid border-black/20 text-white shadow size-10"
              LinkComponent="a"
              href="https://discord.gg/8CFgUPxyrU"
              target="_blank"
              rel="noopener"
            >
              <DiscordLogo className="size-4" />
            </IconButton>

            <Button
              size="small"
              className="bg-cyan-500 hover:bg-cyan-600 border-1 border-solid border-white/20 text-white rounded-full px-3.5 shadow whitespace-nowrap h-10 shrink-0 sm:grow-0 grow sm:max-w-64"
              LinkComponent="a"
              href="https://afdian.com/a/dxrating"
              target="_blank"
              rel="noopener"
              startIcon={<MdiGift className="size-4" />}
            >
              {t('about:donate.title')}
            </Button>
          </div>

          <div className='flex'>
            <LocaleSelector />
            <About />
            <UserChip />
          </div>
        </div>
      </div>
    </div>
  )
}
