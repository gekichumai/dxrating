import { Divider, IconButton, ListItemIcon, ListItemText, ListSubheader, Menu, MenuItem } from '@mui/material'
import { useColorScheme } from '@mui/material/styles'
import { type ComponentType, type ReactElement, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { captureAnalyticsEvent } from '@/lib/analytics'
import type { ThemeMode } from '@/setup/theme-script'
import MdiCheck from '~icons/mdi/check'
import MdiMonitor from '~icons/mdi/monitor'
import MdiThemeLightDark from '~icons/mdi/theme-light-dark'
import MdiTune from '~icons/mdi/tune-variant'
import MdiWeatherNight from '~icons/mdi/weather-night'
import MdiWhiteBalanceSunny from '~icons/mdi/white-balance-sunny'
import { useLocaleMenuItems } from './LocaleSelector'

const MODES: { value: ThemeMode; Icon: ComponentType<{ className?: string }> }[] = [
  { value: 'light', Icon: MdiWhiteBalanceSunny },
  { value: 'dark', Icon: MdiWeatherNight },
  { value: 'system', Icon: MdiMonitor },
]

/**
 * Light / dark / system as menu item elements. A hook returning the elements rather than a wrapper component, so the
 * items stay MenuList's direct children: MenuList gives the selected one autoFocus and the roving tabIndex. MUI's CssVarsProvider remembers the choice (localStorage, the key the pre-paint
 * script in setup/theme-script.ts reads), follows the OS while on "system", and sets <html data-theme>. Menus render
 * only when opened, so reading the stored mode here never reaches the server render.
 */
export const useThemeMenuItems = (onClose: () => void): ReactElement[] => {
  const { t } = useTranslation(['settings'])
  const { mode, setMode } = useColorScheme()
  const current: ThemeMode = mode ?? 'system'

  return MODES.map(({ value, Icon }) => {
    const selected = current === value
    return (
      <MenuItem
        key={value}
        selected={selected}
        aria-checked={selected}
        role="menuitemradio"
        onClick={() => {
          onClose()
          if (selected) return
          setMode(value)
          captureAnalyticsEvent('theme_selector_item_clicked', { mode: value, previous_mode: current })
        }}
      >
        <ListItemIcon>
          <Icon className="size-5" />
        </ListItemIcon>
        <ListItemText>{t(`settings:theme.${value}`)}</ListItemText>
        {selected && <MdiCheck className="ml-3 size-4 text-accent-strong" aria-hidden />}
      </MenuItem>
    )
  })
}

/** The header's appearance button (sm and up). Its icon is the same in every theme so SSR and hydration match. */
export const ThemeSelector = () => {
  const { t } = useTranslation(['settings'])
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const themeItems = useThemeMenuItems(() => setAnchorEl(null))

  return (
    <>
      <IconButton
        onClick={(e) => setAnchorEl(e.currentTarget)}
        aria-label={t('settings:theme.select')}
        title={t('settings:theme.select')}
        aria-haspopup="menu"
      >
        <MdiThemeLightDark />
      </IconButton>

      <Menu transitionDuration={0} anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
        {themeItems}
      </Menu>
    </>
  )
}

/**
 * Phones (below sm): language and appearance share one header button, so adding the theme control does not push the
 * community pill over the logo.
 */
export const DisplayPreferencesMenu = () => {
  const { t } = useTranslation(['settings'])
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const close = () => setAnchorEl(null)
  const localeItems = useLocaleMenuItems(close)
  const themeItems = useThemeMenuItems(close)

  return (
    <>
      <IconButton
        onClick={(e) => setAnchorEl(e.currentTarget)}
        aria-label={t('settings:display-preferences.select')}
        title={t('settings:display-preferences.select')}
        aria-haspopup="menu"
      >
        <MdiTune />
      </IconButton>

      <Menu transitionDuration={0} anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={close}>
        <ListSubheader>{t('settings:language.select')}</ListSubheader>
        {localeItems}
        <Divider />
        <ListSubheader>{t('settings:theme.select')}</ListSubheader>
        {themeItems}
      </Menu>
    </>
  )
}