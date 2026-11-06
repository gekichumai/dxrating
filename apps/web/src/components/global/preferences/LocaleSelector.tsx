import { IconButton, ListItemIcon, ListItemText, Menu, MenuItem, type MenuItemProps } from '@mui/material'
import { flushSync } from 'react-dom'
import { type FC, type PropsWithChildren, type ReactElement, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { persistClientLocalePreference, type SupportedLocale } from '@/setup/locale'
import { captureAnalyticsEvent } from '@/lib/analytics'
import MdiCheck from '~icons/mdi/check'
import MdiTranslate from '~icons/mdi/translate'
import { startViewTransition, wipeOriginFromClick } from '../../../utils/startViewTransition'

// MenuList passes autoFocus and tabIndex to its direct children (keyboard focus on open, roving tab stop): they are
// forwarded to the MenuItem through `rest`
export const LocaleSelectorItem: FC<
  PropsWithChildren<
    { locale: SupportedLocale; selected?: boolean; onClose: () => void } & Omit<MenuItemProps, 'onClick'>
  >
> = ({ locale, selected, onClose, children, ...rest }) => {
  const { i18n } = useTranslation()

  return (
    <MenuItem
      {...rest}
      lang={locale}
      selected={selected}
      onClick={(event) => {
        const origin = wipeOriginFromClick(event)
        flushSync(onClose)
        if (selected) return
        const previousLocale = i18n.language
        void startViewTransition(() => {
          persistClientLocalePreference(locale)
          const changed = i18n.changeLanguage(locale)
          captureAnalyticsEvent('locale_selector_item_clicked', {
            locale,
            previous_locale: previousLocale,
          })
          return changed.then(() => {})
        }, origin)
      }}
    >
      {selected && (
        <ListItemIcon>
          <MdiCheck />
        </ListItemIcon>
      )}
      {selected ? children : <ListItemText inset>{children}</ListItemText>}
    </MenuItem>
  )
}

export const LOCALES = [
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'zh-Hans', label: '简体中文' },
  { value: 'zh-Hant', label: '繁體中文' },
] as const

/**
 * The language choices as menu item elements, for LocaleSelector and the combined phone menu (DisplayPreferencesMenu).
 * A hook returning the elements rather than a wrapper component, so the items stay MenuList's direct children and get
 * its keyboard focus handling.
 */
export const useLocaleMenuItems = (onClose: () => void): ReactElement[] => {
  const { i18n } = useTranslation()
  return LOCALES.map(({ value, label }) => (
    <LocaleSelectorItem locale={value} selected={i18n.language === value} key={value} onClose={onClose}>
      {label}
    </LocaleSelectorItem>
  ))
}

export const LocaleSelector = () => {
  const { t } = useTranslation(['settings'])
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const localeItems = useLocaleMenuItems(() => setAnchorEl(null))

  return (
    <>
      <IconButton
        onClick={(e) => setAnchorEl(e.currentTarget)}
        aria-label={t('settings:language.select')}
        title={t('settings:language.select')}
      >
        <MdiTranslate />
      </IconButton>

      <Menu transitionDuration={0} anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
        {localeItems}
      </Menu>
    </>
  )
}