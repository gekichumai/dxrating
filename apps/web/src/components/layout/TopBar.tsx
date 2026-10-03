import { ButtonBase, IconButton, ListItemIcon, ListItemText, Menu, MenuItem } from '@mui/material'
import clsx from 'clsx'
import { type ComponentType, useState } from 'react'
import { useTranslation } from 'react-i18next'
import MdiChevronDown from '~icons/mdi/chevron-down'
import MdiGithub from '~icons/mdi/github'
import DiscordLogo from '~icons/simple-icons/discord'
import QqLogo from '~icons/simple-icons/qq'
import { BUNDLE } from '../../utils/bundle'
import { RelativeTime } from '../../utils/useTime'
import { useVersionTheme } from '../../utils/useVersionTheme'
import { Logo } from '../global/Logo'
import { LocaleSelector } from '../global/preferences/LocaleSelector'
import { UserChip } from '../global/preferences/UserChip'
import { About } from '../global/site-meta/About'

const COMMUNITY_LINKS: {
  key: 'discord' | 'qq' | 'github'
  // Brand names stay untranslated; only the QQ group needs a localized short label.
  shortLabel?: string
  href: string
  Icon: ComponentType<{ className?: string }>
  brandClassName: string
}[] = [
  {
    key: 'discord',
    shortLabel: 'Discord',
    href: 'https://discord.gg/8CFgUPxyrU',
    Icon: DiscordLogo,
    brandClassName: 'bg-[#5865F2] hover:bg-[#4752C4]',
  },
  {
    key: 'qq',
    href: 'https://qun.qq.com/universal-share/share?ac=1&authKey=Msn1eQwZatECqVPNu99z7yM9encUTFgkQlCrknZJ3mLKemZ1g2JLHskeZctaBa1z&busi_data=eyJncm91cENvZGUiOiI3MTU2MDczNjAiLCJ0b2tlbiI6Ii8wMDM4NkpOdDVOanRzTVdSQm5tKzZHbXNONFczTTVHa0M3a3dtcWU1TUxkYjFuQ3U5VEMzQ0srVWlDQjkvQVMiLCJ1aW4iOiIyNDAzOTAxNTExIn0%3D&data=e0__RlsOEZs1-dsLtR44_xvw9lEyXAdlviDKcK_XqyeS6gjDkceHeVGEiuGDKodjINLGUGNIWdmb9IdEmcYeWw&svctype=4&tempid=h5_group_info',
    Icon: QqLogo,
    brandClassName: 'bg-[#12B7F5] hover:bg-[#0E9AD0]',
  },
  {
    key: 'github',
    shortLabel: 'GitHub',
    href: 'https://github.com/gekichumai/dxrating',
    Icon: MdiGithub,
    brandClassName: 'bg-zinc-800 hover:bg-zinc-700',
  },
]

const BRAND_BADGE_CLASS_NAME = 'text-white border-1 border-solid border-black/20 shadow'

// Small screens fold the community links into one menu so the header stays a single row; the
// overlapping brand badges keep the entry point as recognizable as the full row on desktop.
const CommunityMenu = () => {
  const { t } = useTranslation(['root'])
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)

  return (
    <>
      <ButtonBase
        onClick={(e) => setAnchorEl(e.currentTarget)}
        aria-label={t('root:external-links.community')}
        title={t('root:external-links.community')}
        aria-haspopup="menu"
        aria-expanded={anchorEl ? 'true' : undefined}
        className="2xs:mr-1 flex items-center gap-0.5 rounded-full bg-white/35 hover:bg-white/50 p-0.5 2xs:p-1 transition-colors"
      >
        {COMMUNITY_LINKS.map(({ key, Icon, brandClassName }, index) => (
          <span
            key={key}
            className={clsx(
              'flex size-6 2xs:size-7 items-center justify-center rounded-full',
              BRAND_BADGE_CLASS_NAME,
              brandClassName,
              index > 0 && '-ml-3 2xs:-ml-2.5',
            )}
          >
            <Icon className="size-3.5" />
          </span>
        ))}
        <MdiChevronDown className="hidden 2xs:block size-4 text-black/60" />
      </ButtonBase>

      <Menu transitionDuration={0} anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
        {COMMUNITY_LINKS.map(({ key, shortLabel, href, Icon, brandClassName }) => (
          <MenuItem
            key={key}
            component="a"
            href={href}
            target="_blank"
            rel="noopener"
            title={t(`root:external-links.${key}`)}
            onClick={() => setAnchorEl(null)}
          >
            <ListItemIcon>
              <span
                className={clsx(
                  'flex size-7 items-center justify-center rounded-full',
                  BRAND_BADGE_CLASS_NAME,
                  brandClassName,
                )}
              >
                <Icon className="size-3.5" />
              </span>
            </ListItemIcon>
            <ListItemText>{shortLabel ?? t('root:external-links.qq-short')}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}

export const TopBar = ({
  standalone = false,
  transparent = false,
}: {
  standalone?: boolean
  transparent?: boolean
}) => {
  const versionTheme = useVersionTheme()
  const { t } = useTranslation(['root'])

  return (
    <div
      className={`sticky top-0${standalone ? ' pb-4' : ''}`}
      style={{ background: transparent ? undefined : versionTheme.accentColor }}
    >
      <div className="flex items-center justify-between gap-2 pt-[calc(env(safe-area-inset-top)+1rem)] max-w-7xl mx-auto pl-[calc(env(safe-area-inset-left)+0.75rem)] 2xs:pl-[calc(env(safe-area-inset-left)+1rem)] pr-[calc(env(safe-area-inset-right)+0.5rem)]">
        <div className="flex flex-col items-start justify-center gap-1 select-none relative min-w-0">
          <Logo />
          <div className="text-xs text-black/75 leading-none whitespace-nowrap">
            {BUNDLE.version ?? 'unknown'} (<RelativeTime time={BUNDLE.buildTime} length="short" />)
          </div>
        </div>

        {/* Tighter icon buttons below 375px keep the row from colliding with the logo. */}
        <div className="flex items-center shrink-0 [&_.MuiIconButton-root]:p-1.5 2xs:[&_.MuiIconButton-root]:p-2">
          <div className="hidden sm:flex items-center gap-2">
            {COMMUNITY_LINKS.map(({ key, href, Icon, brandClassName }) => (
              <IconButton
                key={key}
                size="small"
                className={clsx('size-9', BRAND_BADGE_CLASS_NAME, brandClassName)}
                LinkComponent="a"
                href={href}
                target="_blank"
                rel="noopener"
                aria-label={t(`root:external-links.${key}`)}
                title={t(`root:external-links.${key}`)}
              >
                <Icon className="size-4" />
              </IconButton>
            ))}
            <div className="mx-2 h-6 w-px bg-black/15" aria-hidden />
          </div>

          <div className="sm:hidden">
            <CommunityMenu />
          </div>

          <LocaleSelector />
          <About />
          <UserChip />
        </div>
      </div>
    </div>
  )
}