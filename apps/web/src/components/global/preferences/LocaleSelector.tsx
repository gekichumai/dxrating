import { IconButton, ListItemIcon, ListItemText, Menu, MenuItem, type MenuItemProps } from '@mui/material'
import { useRouter } from '@tanstack/react-router'
import { flushSync } from 'react-dom'
import { type FC, type PropsWithChildren, type ReactElement, useState } from 'react'
import { useLocale, useSetLocale } from '@/i18n/LocaleProvider'
import { localizePath, persistClientLocalePreference, splitLocalePath, type SupportedLocale } from '@/setup/locale'
import { captureAnalyticsEvent } from '@/lib/analytics'
import MdiCheck from '~icons/mdi/check'
import MdiTranslate from '~icons/mdi/translate'
import { startViewTransition, wipeOriginFromClick } from '../../../utils/startViewTransition'
import { m } from '@/paraglide/messages'

/** The page on screen as the given language's URL: `/ja/rating?x=1` → `/th/rating?x=1` */
export const localizedCurrentUrl = (
  locale: SupportedLocale,
  location: Pick<Location, 'pathname' | 'search' | 'hash'> = window.location,
) => localizePath(splitLocalePath(location.pathname).pathname, locale) + location.search + location.hash

// MenuList passes autoFocus and tabIndex to its direct children (keyboard focus on open, roving tab stop): they are
// forwarded to the MenuItem through `rest`
export const LocaleSelectorItem: FC<
  PropsWithChildren<
    { locale: SupportedLocale; selected?: boolean; onClose: () => void } & Omit<MenuItemProps, 'onClick'>
  >
> = ({ locale, selected, onClose, children, ...rest }) => {
  const currentLocale = useLocale()
  const setLocale = useSetLocale()
  const router = useRouter({ warn: false })

  return (
    <MenuItem
      {...rest}
      lang={locale}
      selected={selected}
      onClick={(event) => {
        const origin = wipeOriginFromClick(event)
        flushSync(onClose)
        if (selected) return
        const previousLocale = currentLocale
        void startViewTransition(() => {
          persistClientLocalePreference(locale)
          // The new language renders in place, then the URL moves to that language's path for the same page. Pushed
          // to history directly: the router compares locations without the prefix, so to it this is the same page
          const changed = setLocale(locale).then(() => router?.history.push(localizedCurrentUrl(locale)))
          captureAnalyticsEvent('locale_selector_item_clicked', {
            locale,
            previous_locale: previousLocale,
          })
          return changed
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
  { value: 'ms', label: 'Bahasa Melayu' },
  { value: 'id', label: 'Bahasa Indonesia' },
  { value: 'fil', label: 'Filipino' },
  { value: 'vi', label: 'Tiếng Việt' },
  { value: 'th', label: 'ไทย' },
  { value: 'my', label: 'မြန်မာ' },
] as const satisfies readonly { value: SupportedLocale; label: string }[]

/**
 * The language choices as menu item elements, for LocaleSelector and the combined phone menu (DisplayPreferencesMenu).
 * A hook returning the elements rather than a wrapper component, so the items stay MenuList's direct children and get
 * its keyboard focus handling.
 */
export const useLocaleMenuItems = (onClose: () => void): ReactElement[] => {
  const locale = useLocale()
  return LOCALES.map(({ value, label }) => (
    <LocaleSelectorItem locale={value} selected={locale === value} key={value} onClose={onClose}>
      {label}
    </LocaleSelectorItem>
  ))
}

export const LocaleSelector = () => {
  const locale = useLocale()
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const localeItems = useLocaleMenuItems(() => setAnchorEl(null))

  return (
    <>
      <IconButton
        onClick={(e) => setAnchorEl(e.currentTarget)}
        aria-label={m.settings_language_select({}, { locale })}
        title={m.settings_language_select({}, { locale })}
      >
        <MdiTranslate />
      </IconButton>

      <Menu transitionDuration={0} anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
        {localeItems}
      </Menu>
    </>
  )
}