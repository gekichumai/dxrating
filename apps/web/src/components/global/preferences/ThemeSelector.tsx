import { Divider, IconButton, ListItemIcon, ListItemText, ListSubheader, Menu, MenuItem } from '@mui/material'
import { useColorScheme } from '@mui/material/styles'
import { type ComponentType, type ReactElement, useState } from 'react'
import { captureAnalyticsEvent } from '@/lib/analytics'
import type { ThemeMode } from '@/setup/theme-script'
import MdiCheck from '~icons/mdi/check'
import MdiMonitor from '~icons/mdi/monitor'
import MdiThemeLightDark from '~icons/mdi/theme-light-dark'
import MdiTune from '~icons/mdi/tune-variant'
import MdiWeatherNight from '~icons/mdi/weather-night'
import MdiWhiteBalanceSunny from '~icons/mdi/white-balance-sunny'
import { useLocaleMenuItems } from './LocaleSelector'
import { useLocale } from '@/i18n/LocaleProvider'
import type { PlainMessage } from '@/i18n/message'
import { m } from '@/paraglide/messages'

const MODES: { value: ThemeMode; Icon: ComponentType<{ className?: string }>; label: PlainMessage }[] = [
  { value: 'light', Icon: MdiWhiteBalanceSunny, label: m.settings_theme_light },
  { value: 'dark', Icon: MdiWeatherNight, label: m.settings_theme_dark },
  { value: 'system', Icon: MdiMonitor, label: m.settings_theme_system },
]

/**
 * Light / dark / system as menu item elements. A hook returning the elements rather than a wrapper component, so the
 * items stay MenuList's direct children: MenuList gives the selected one autoFocus and the roving tabIndex. MUI's CssVarsProvider remembers the choice (localStorage, the key the pre-paint
 * script in setup/theme-script.ts reads), follows the OS while on "system", and sets <html data-theme>. Menus render
 * only when opened, so reading the stored mode here never reaches the server render.
 */
export const useThemeMenuItems = (onClose: () => void): ReactElement[] => {
  const locale = useLocale()
  const { mode, setMode } = useColorScheme()
  const current: ThemeMode = mode ?? 'system'

  return MODES.map(({ value, Icon, label }) => {
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
        <ListItemText>{label({}, { locale })}</ListItemText>
        {selected && <MdiCheck className="ml-3 size-4 text-accent-strong" aria-hidden />}
      </MenuItem>
    )
  })
}

/** The header's appearance button (sm and up). Its icon is the same in every theme so SSR and hydration match. */
export const ThemeSelector = () => {
  const locale = useLocale()
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const themeItems = useThemeMenuItems(() => setAnchorEl(null))

  return (
    <>
      <IconButton
        onClick={(e) => setAnchorEl(e.currentTarget)}
        aria-label={m.settings_theme_select({}, { locale })}
        title={m.settings_theme_select({}, { locale })}
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
  const locale = useLocale()
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const close = () => setAnchorEl(null)
  const localeItems = useLocaleMenuItems(close)
  const themeItems = useThemeMenuItems(close)

  return (
    <>
      <IconButton
        onClick={(e) => setAnchorEl(e.currentTarget)}
        aria-label={m.settings_displayPreferences_select({}, { locale })}
        title={m.settings_displayPreferences_select({}, { locale })}
        aria-haspopup="menu"
      >
        <MdiTune />
      </IconButton>

      <Menu transitionDuration={0} anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={close}>
        <ListSubheader>{m.settings_language_select({}, { locale })}</ListSubheader>
        {localeItems}
        <Divider />
        <ListSubheader>{m.settings_theme_select({}, { locale })}</ListSubheader>
        {themeItems}
      </Menu>
    </>
  )
}