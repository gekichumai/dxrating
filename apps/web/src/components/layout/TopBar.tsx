import { IconButton, ListItemIcon, ListItemText, Menu, MenuItem } from '@mui/material'
import { type ComponentType, useState } from 'react'
import { useTranslation } from 'react-i18next'
import MdiForumOutline from '~icons/mdi/forum-outline'
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
}[] = [
  { key: 'discord', shortLabel: 'Discord', href: 'https://discord.gg/8CFgUPxyrU', Icon: DiscordLogo },
  {
    key: 'qq',
    href: 'https://qun.qq.com/universal-share/share?ac=1&authKey=Msn1eQwZatECqVPNu99z7yM9encUTFgkQlCrknZJ3mLKemZ1g2JLHskeZctaBa1z&busi_data=eyJncm91cENvZGUiOiI3MTU2MDczNjAiLCJ0b2tlbiI6Ii8wMDM4NkpOdDVOanRzTVdSQm5tKzZHbXNONFczTTVHa0M3a3dtcWU1TUxkYjFuQ3U5VEMzQ0srVWlDQjkvQVMiLCJ1aW4iOiIyNDAzOTAxNTExIn0%3D&data=e0__RlsOEZs1-dsLtR44_xvw9lEyXAdlviDKcK_XqyeS6gjDkceHeVGEiuGDKodjINLGUGNIWdmb9IdEmcYeWw&svctype=4&tempid=h5_group_info',
    Icon: QqLogo,
  },
  { key: 'github', shortLabel: 'GitHub', href: 'https://github.com/gekichumai/dxrating', Icon: MdiGithub },
]

// Small screens fold the community links into one menu so the header stays a single row.
const CommunityMenu = () => {
  const { t } = useTranslation(['root'])
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)

  return (
    <>
      <IconButton
        onClick={(e) => setAnchorEl(e.currentTarget)}
        aria-label={t('root:external-links.community')}
        title={t('root:external-links.community')}
        aria-haspopup="menu"
        aria-expanded={anchorEl ? 'true' : undefined}
      >
        <MdiForumOutline />
      </IconButton>

      <Menu transitionDuration={0} anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
        {COMMUNITY_LINKS.map(({ key, shortLabel, href, Icon }) => (
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
              <Icon className="size-4" />
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
      <div className="flex items-center justify-between gap-2 pt-[calc(env(safe-area-inset-top)+1rem)] max-w-7xl mx-auto pl-[calc(env(safe-area-inset-left)+1rem)] pr-[calc(env(safe-area-inset-right)+0.5rem)]">
        <div className="flex flex-col items-start justify-center gap-1 select-none relative min-w-0">
          <Logo />
          <div className="text-xs text-black/75 leading-none whitespace-nowrap">
            {BUNDLE.version ?? 'unknown'} (<RelativeTime time={BUNDLE.buildTime} length="short" />)
          </div>
        </div>

        <div className="flex items-center shrink-0">
          <div className="hidden sm:flex items-center">
            {COMMUNITY_LINKS.map(({ key, href, Icon }) => (
              <IconButton
                key={key}
                LinkComponent="a"
                href={href}
                target="_blank"
                rel="noopener"
                aria-label={t(`root:external-links.${key}`)}
                title={t(`root:external-links.${key}`)}
              >
                <Icon className="size-5" />
              </IconButton>
            ))}
            <div className="mx-1 h-5 w-px bg-black/15" aria-hidden />
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