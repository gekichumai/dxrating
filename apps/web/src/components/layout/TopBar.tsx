import { ButtonBase, Divider, ListItemIcon, ListItemText, Menu, MenuItem } from '@mui/material'
import clsx from 'clsx'
import { type ComponentType, useState } from 'react'
import { useTranslation } from 'react-i18next'
import MdiChevronDown from '~icons/mdi/chevron-down'
import MdiCodeBraces from '~icons/mdi/code-braces'
import MdiAccountGroupOutline from '~icons/mdi/account-group-outline'
import MdiGithub from '~icons/mdi/github'
import DiscordLogo from '~icons/simple-icons/discord'
import McpLogo from '~icons/simple-icons/modelcontextprotocol'
import QqLogo from '~icons/simple-icons/qq'
import { BUNDLE } from '../../utils/bundle'
import { RelativeTime } from '../../utils/useTime'
import { Logo } from '../global/Logo'
import { LocaleSelector } from '../global/preferences/LocaleSelector'
import { DisplayPreferencesMenu, ThemeSelector } from '../global/preferences/ThemeSelector'
import { UserChip } from '../global/preferences/UserChip'
import { About } from '../global/site-meta/About'

// Community glyphs are monochrome (text-fg-1) like every other header action: the saturated brand discs were the
// loudest colour in the bar for the least important links
const COMMUNITY_LINKS: {
  key: 'discord' | 'qq' | 'github'
  // Brand names stay untranslated; only the QQ group needs a localized short label.
  shortLabel?: string
  href: string
  Icon: ComponentType<{ className?: string }>
}[] = [
  {
    key: 'discord',
    shortLabel: 'Discord',
    href: 'https://discord.gg/8CFgUPxyrU',
    Icon: DiscordLogo,
  },
  {
    key: 'qq',
    href: 'https://qun.qq.com/universal-share/share?ac=1&authKey=Msn1eQwZatECqVPNu99z7yM9encUTFgkQlCrknZJ3mLKemZ1g2JLHskeZctaBa1z&busi_data=eyJncm91cENvZGUiOiI3MTU2MDczNjAiLCJ0b2tlbiI6Ii8wMDM4NkpOdDVOanRzTVdSQm5tKzZHbXNONFczTTVHa0M3a3dtcWU1TUxkYjFuQ3U5VEMzQ0srVWlDQjkvQVMiLCJ1aW4iOiIyNDAzOTAxNTExIn0%3D&data=e0__RlsOEZs1-dsLtR44_xvw9lEyXAdlviDKcK_XqyeS6gjDkceHeVGEiuGDKodjINLGUGNIWdmb9IdEmcYeWw&svctype=4&tempid=h5_group_info',
    Icon: QqLogo,
  },
  {
    key: 'github',
    shortLabel: 'GitHub',
    href: 'https://github.com/gekichumai/dxrating',
    Icon: MdiGithub,
  },
]

// The MCP server lets AI assistants (Claude, ChatGPT, Cursor…) query DXRating. It links to the
// human-readable setup guide; the endpoint itself lives at /mcp.
// ?via= tells the MCP server's analytics which link brought a visitor; the guide page ignores it.
const MCP_GUIDE_URL = 'https://mcp.dxrating.net/?via=dxrating-home'
// Public API base, OpenAPI spec, docs and MCP links for developers.
const DEVELOPERS_URL = '/developers'

// Every header action is the same 36px round control inside one glass pill (3px padding + 1px border: 36 + 8 = 44px)
const HEADER_ACTION_CLASS_NAME =
  'flex size-9 shrink-0 items-center justify-center rounded-full text-fg-1 [transition-property:background-color] duration-[var(--duration-fast)] hover:bg-white/60'

// MCP and the developer API read as text links inside the same pill on wider screens
const DEVELOPER_PILL_SEGMENT_CLASS_NAME =
  'flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-fg-1 [transition-property:background-color] duration-[var(--duration-fast)] hover:bg-white/60'

const PILL_DIVIDER = <span className="mx-1 h-5 w-px shrink-0 bg-black/12" aria-hidden />

// Small screens fold the community and developer links into one menu so the header stays a single row
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
        className={clsx(HEADER_ACTION_CLASS_NAME, '2xs:w-auto 2xs:gap-0.5 2xs:pl-2.5 2xs:pr-1.5')}
      >
        <MdiAccountGroupOutline aria-hidden className="size-5" />
        <MdiChevronDown aria-hidden className="hidden 2xs:block size-4 text-fg-2" />
      </ButtonBase>

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
              <Icon aria-hidden className="size-5 text-fg-1" />
            </ListItemIcon>
            <ListItemText>{shortLabel ?? t('root:external-links.qq-short')}</ListItemText>
          </MenuItem>
        ))}
        <Divider />
        <MenuItem
          component="a"
          href={MCP_GUIDE_URL}
          target="_blank"
          rel="noopener"
          title={t('root:external-links.mcp')}
          onClick={() => setAnchorEl(null)}
        >
          <ListItemIcon>
            <McpLogo aria-hidden className="size-5 text-fg-1" />
          </ListItemIcon>
          <ListItemText>{t('root:external-links.mcp-short')}</ListItemText>
        </MenuItem>
        <MenuItem
          component="a"
          href={DEVELOPERS_URL}
          title={t('root:external-links.developers')}
          onClick={() => setAnchorEl(null)}
        >
          <ListItemIcon>
            <MdiCodeBraces aria-hidden className="size-5 text-fg-1" />
          </ListItemIcon>
          <ListItemText>{t('root:external-links.developers-short')}</ListItemText>
        </MenuItem>
      </Menu>
    </>
  )
}

/** The header's top row: the site name and build on the left, one glass pill of actions on the right. */
export const TopBar = () => {
  const { t } = useTranslation(['root'])

  return (
    <div className="page-gutter flex items-center justify-between gap-2 pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:pt-[calc(env(safe-area-inset-top)+1rem)]">
      <div className="flex flex-col items-start justify-center gap-1 select-none relative min-w-0">
        <Logo />
        <div className="text-xs text-fg-2 leading-none whitespace-nowrap num">
          {BUNDLE.version ?? 'unknown'} (<RelativeTime time={BUNDLE.buildTime} length="short" />)
        </div>
      </div>

      <div className="glass-thin !rounded-full flex items-center shrink-0 p-[3px] gap-0.5 [&_.MuiIconButton-root]:size-9 [&_.MuiIconButton-root]:p-0 [&_.MuiIconButton-root]:text-fg-1 [&_.MuiIconButton-root]:text-xl">
        <div className="hidden sm:flex items-center gap-0.5">
          <ButtonBase
            component="a"
            href={MCP_GUIDE_URL}
            target="_blank"
            rel="noopener"
            aria-label={t('root:external-links.mcp')}
            title={t('root:external-links.mcp')}
            className={DEVELOPER_PILL_SEGMENT_CLASS_NAME}
          >
            <McpLogo aria-hidden className="size-4" />
            MCP
          </ButtonBase>
          <ButtonBase
            component="a"
            href={DEVELOPERS_URL}
            aria-label={t('root:external-links.developers')}
            title={t('root:external-links.developers')}
            className={DEVELOPER_PILL_SEGMENT_CLASS_NAME}
          >
            <MdiCodeBraces aria-hidden className="size-4" />
            API
          </ButtonBase>
          {PILL_DIVIDER}
          {COMMUNITY_LINKS.map(({ key, href, Icon }) => (
            <ButtonBase
              key={key}
              component="a"
              href={href}
              target="_blank"
              rel="noopener"
              aria-label={t(`root:external-links.${key}`)}
              title={t(`root:external-links.${key}`)}
              className={HEADER_ACTION_CLASS_NAME}
            >
              <Icon aria-hidden className="size-[1.125rem]" />
            </ButtonBase>
          ))}
          {PILL_DIVIDER}
        </div>

        <div className="flex sm:hidden">
          <CommunityMenu />
        </div>

        {/* Phones get one combined language + appearance button so the row keeps its width (DisplayPreferencesMenu) */}
        <div className="hidden sm:contents">
          <LocaleSelector />
          <ThemeSelector />
        </div>
        <div className="contents sm:hidden">
          <DisplayPreferencesMenu />
        </div>
        <About />
        <UserChip />
      </div>
    </div>
  )
}