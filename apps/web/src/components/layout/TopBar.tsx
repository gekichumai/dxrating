import { ButtonBase, Divider, ListItemIcon, ListItemText, Menu, MenuItem } from '@mui/material'
import clsx from 'clsx'
import { type ComponentType, type ReactNode, useState } from 'react'
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
import { type HeaderTint, headerTintStyle } from './headerTints'
import { LinkBehavior } from '@/components/global/InternalLink'

// Every header action keeps a hue of its own: a coloured glyph on a soft wash of it (styles/header-tints.css). The
// community links are their solid brand discs with a white logo, as before the glass pill
const COMMUNITY_LINKS: {
  key: 'discord' | 'qq' | 'github'
  // Brand names stay untranslated; only the QQ group needs a localized short label.
  shortLabel?: string
  href: string
  Icon: ComponentType<{ className?: string }>
  tint: HeaderTint
}[] = [
  {
    key: 'discord',
    shortLabel: 'Discord',
    href: 'https://discord.gg/8CFgUPxyrU',
    Icon: DiscordLogo,
    tint: 'discord',
  },
  {
    key: 'qq',
    href: 'https://qun.qq.com/universal-share/share?ac=1&authKey=Msn1eQwZatECqVPNu99z7yM9encUTFgkQlCrknZJ3mLKemZ1g2JLHskeZctaBa1z&busi_data=eyJncm91cENvZGUiOiI3MTU2MDczNjAiLCJ0b2tlbiI6Ii8wMDM4NkpOdDVOanRzTVdSQm5tKzZHbXNONFczTTVHa0M3a3dtcWU1TUxkYjFuQ3U5VEMzQ0srVWlDQjkvQVMiLCJ1aW4iOiIyNDAzOTAxNTExIn0%3D&data=e0__RlsOEZs1-dsLtR44_xvw9lEyXAdlviDKcK_XqyeS6gjDkceHeVGEiuGDKodjINLGUGNIWdmb9IdEmcYeWw&svctype=4&tempid=h5_group_info',
    Icon: QqLogo,
    tint: 'qq',
  },
  {
    key: 'github',
    shortLabel: 'GitHub',
    href: 'https://github.com/gekichumai/dxrating',
    Icon: MdiGithub,
    tint: 'github',
  },
]

// The MCP server lets AI assistants (Claude, ChatGPT, Cursor…) query DXRating. It links to the
// human-readable setup guide; the endpoint itself lives at /mcp.
// ?via= tells the MCP server's analytics which link brought a visitor; the guide page ignores it.
const MCP_GUIDE_URL = 'https://mcp.dxrating.net/?via=dxrating-home'
// Public API base, OpenAPI spec, docs and MCP links for developers.
const DEVELOPERS_URL = '/developers'

// Every header action is the same 36px round control inside one glass pill (3px padding + 1px border: 36 + 8 = 44px)
const HEADER_ACTION_CLASS_NAME = 'flex size-9 shrink-0 items-center justify-center rounded-full'

// MCP and the developer API read as text links inside the same pill on wider screens: tinted glyph, plain label
const DEVELOPER_PILL_SEGMENT_CLASS_NAME =
  'flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-fg-1 [transition-property:background-color] duration-[var(--duration-fast)] hover:bg-white/60'

/** Wraps a preferences control (an MUI IconButton) so its button takes the given hue */
const Tinted = ({ tint, children }: { tint: HeaderTint; children: ReactNode }) => (
  <span className="header-tint contents" style={headerTintStyle(tint)}>
    {children}
  </span>
)

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
        className={clsx(
          HEADER_ACTION_CLASS_NAME,
          'header-tint header-tint-target 2xs:w-auto 2xs:gap-0.5 2xs:pl-1 2xs:pr-1.5 2xs:!bg-transparent 2xs:hover:!bg-white/60',
        )}
        style={headerTintStyle('discord')}
      >
        {/* Below 375px one tinted glyph; wider phones show the three brand discs, as before the glass header */}
        <MdiAccountGroupOutline aria-hidden className="size-5 2xs:hidden" />
        <span className="hidden 2xs:flex items-center" aria-hidden>
          {COMMUNITY_LINKS.map(({ key, Icon, tint }, index) => (
            <span
              key={key}
              className={clsx(
                'header-brand-disc flex size-7 items-center justify-center rounded-full',
                index > 0 && '-ml-2',
              )}
              style={headerTintStyle(tint)}
            >
              <Icon className="size-3.5" />
            </span>
          ))}
        </span>
        <MdiChevronDown aria-hidden className="hidden 2xs:block size-4 text-fg-2" />
      </ButtonBase>

      <Menu transitionDuration={0} anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
        {COMMUNITY_LINKS.map(({ key, shortLabel, href, Icon, tint }) => (
          <MenuItem
            key={key}
            component={LinkBehavior}
            href={href}
            target="_blank"
            rel="noopener"
            title={t(`root:external-links.${key}`)}
            onClick={() => setAnchorEl(null)}
          >
            <ListItemIcon className="header-tint" style={headerTintStyle(tint)}>
              <Icon aria-hidden className="size-5 text-[var(--tint-ink)]" />
            </ListItemIcon>
            <ListItemText>{shortLabel ?? t('root:external-links.qq-short')}</ListItemText>
          </MenuItem>
        ))}
        <Divider />
        <MenuItem
          component={LinkBehavior}
          href={MCP_GUIDE_URL}
          target="_blank"
          rel="noopener"
          title={t('root:external-links.mcp')}
          onClick={() => setAnchorEl(null)}
        >
          <ListItemIcon className="header-tint" style={headerTintStyle('mcp')}>
            <McpLogo aria-hidden className="size-5 text-[var(--tint-ink)]" />
          </ListItemIcon>
          <ListItemText>{t('root:external-links.mcp-short')}</ListItemText>
        </MenuItem>
        <MenuItem
          component={LinkBehavior}
          href={DEVELOPERS_URL}
          title={t('root:external-links.developers')}
          onClick={() => setAnchorEl(null)}
        >
          <ListItemIcon className="header-tint" style={headerTintStyle('api')}>
            <MdiCodeBraces aria-hidden className="size-5 text-[var(--tint-ink)]" />
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
        {/* fg-1, not fg-2: the header tint over the background art leaves fg-2 near 4.3:1 at this 12px size */}
        <div className="text-xs text-fg-1 leading-none whitespace-nowrap num max-w-full overflow-hidden text-ellipsis">
          {BUNDLE.version ?? 'unknown'} (<RelativeTime time={BUNDLE.buildTime} length="short" />)
        </div>
      </div>

      <div className="glass-thin !rounded-full flex items-center shrink-0 p-[3px] gap-0.5 [&_.MuiIconButton-root]:size-9 [&_.MuiIconButton-root]:p-0 [&_.MuiIconButton-root]:text-xl">
        <div className="hidden sm:flex items-center gap-0.5">
          <ButtonBase
            component={LinkBehavior}
            href={MCP_GUIDE_URL}
            target="_blank"
            rel="noopener"
            aria-label={t('root:external-links.mcp')}
            title={t('root:external-links.mcp')}
            className={clsx(DEVELOPER_PILL_SEGMENT_CLASS_NAME, 'header-tint')}
            style={headerTintStyle('mcp')}
          >
            <McpLogo aria-hidden className="size-4 text-[var(--tint-ink)]" />
            MCP
          </ButtonBase>
          <ButtonBase
            component={LinkBehavior}
            href={DEVELOPERS_URL}
            aria-label={t('root:external-links.developers')}
            title={t('root:external-links.developers')}
            className={clsx(DEVELOPER_PILL_SEGMENT_CLASS_NAME, 'header-tint')}
            style={headerTintStyle('api')}
          >
            <MdiCodeBraces aria-hidden className="size-4 text-[var(--tint-ink)]" />
            API
          </ButtonBase>
          {PILL_DIVIDER}
          {COMMUNITY_LINKS.map(({ key, href, Icon, tint }) => (
            <ButtonBase
              key={key}
              component={LinkBehavior}
              href={href}
              target="_blank"
              rel="noopener"
              aria-label={t(`root:external-links.${key}`)}
              title={t(`root:external-links.${key}`)}
              className={clsx(HEADER_ACTION_CLASS_NAME, 'header-brand-disc')}
              style={headerTintStyle(tint)}
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
          <Tinted tint="locale">
            <LocaleSelector />
          </Tinted>
          <Tinted tint="theme">
            <ThemeSelector />
          </Tinted>
        </div>
        <div className="contents sm:hidden">
          <Tinted tint="preferences">
            <DisplayPreferencesMenu />
          </Tinted>
        </div>
        <Tinted tint="about">
          <About />
        </Tinted>
        <Tinted tint="account">
          <UserChip />
        </Tinted>
      </div>
    </div>
  )
}