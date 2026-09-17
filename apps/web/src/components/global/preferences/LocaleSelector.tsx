import { IconButton, ListItemIcon, ListItemText, Menu, MenuItem } from '@mui/material'
import { flushSync } from 'react-dom'
import { type FC, type PropsWithChildren, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { persistClientLocalePreference, type SupportedLocale } from '@/setup/locale'
import { captureAnalyticsEvent } from '@/lib/analytics'
import MdiCheck from '~icons/mdi/check'
import MdiTranslate from '~icons/mdi/translate'
import { startViewTransition, wipeOriginFromClick } from '../../../utils/startViewTransition'

const LocaleSelectorItem: FC<
  PropsWithChildren<{ locale: SupportedLocale; selected?: boolean; onClose: () => void }>
> = ({ locale, selected, onClose, children }) => {
  const { i18n } = useTranslation()

  return (
    <MenuItem
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

const LOCALES = [
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'zh-Hans', label: '简体中文' },
  { value: 'zh-Hant', label: '繁體中文' },
] as const

export const LocaleSelector = () => {
  const { i18n, t } = useTranslation(['settings'])
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)

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
        {LOCALES.map(({ value, label }) => (
          <LocaleSelectorItem
            locale={value}
            selected={i18n.language === value}
            key={value}
            onClose={() => setAnchorEl(null)}
          >
            {label}
          </LocaleSelectorItem>
        ))}
      </Menu>
    </>
  )
}