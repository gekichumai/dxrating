import { IconButton, ListItemIcon, ListItemText, Menu, MenuItem } from '@mui/material'
import { useColorScheme } from '@mui/material/styles'
import { type ComponentType, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { captureAnalyticsEvent } from '@/lib/analytics'
import type { ThemeMode } from '@/setup/theme-script'
import MdiCheck from '~icons/mdi/check'
import MdiMonitor from '~icons/mdi/monitor'
import MdiThemeLightDark from '~icons/mdi/theme-light-dark'
import MdiWeatherNight from '~icons/mdi/weather-night'
import MdiWhiteBalanceSunny from '~icons/mdi/white-balance-sunny'

const MODES: { value: ThemeMode; Icon: ComponentType<{ className?: string }> }[] = [
  { value: 'light', Icon: MdiWhiteBalanceSunny },
  { value: 'dark', Icon: MdiWeatherNight },
  { value: 'system', Icon: MdiMonitor },
]

/**
 * Light / dark / system. MUI's CssVarsProvider remembers the choice (localStorage, the key the pre-paint script in
 * setup/theme-script.ts reads), follows the OS while on "system", and sets <html data-theme>. The button's icon is the
 * same in every theme so the server render and the first client render match.
 */
export const ThemeSelector = () => {
  const { t } = useTranslation(['settings'])
  const { mode, setMode } = useColorScheme()
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const current: ThemeMode = mode ?? 'system'

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
        {MODES.map(({ value, Icon }) => {
          const selected = current === value
          return (
            <MenuItem
              key={value}
              selected={selected}
              aria-checked={selected}
              role="menuitemradio"
              onClick={() => {
                setAnchorEl(null)
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
        })}
      </Menu>
    </>
  )
}