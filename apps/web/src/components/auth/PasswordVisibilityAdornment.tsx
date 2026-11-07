import { IconButton, InputAdornment } from '@mui/material'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'
import IconVisibility from '~icons/material-symbols/visibility-outline'
import IconVisibilityOff from '~icons/material-symbols/visibility-off-outline'

export function PasswordVisibilityAdornment({
  visible,
  fieldLabel,
  inputId,
  onToggle,
}: {
  visible: boolean
  fieldLabel: string
  inputId: string
  onToggle: () => void
}) {
  const locale = useLocale()
  const label = visible
    ? m.auth_password_hideField({ field: fieldLabel }, { locale })
    : m.auth_password_showField({ field: fieldLabel }, { locale })

  return (
    <InputAdornment position="end">
      <IconButton
        type="button"
        edge="end"
        aria-label={label}
        aria-controls={inputId}
        aria-pressed={visible}
        title={label}
        onClick={onToggle}
        onMouseDown={(event) => event.preventDefault()}
      >
        {visible ? <IconVisibilityOff /> : <IconVisibility />}
      </IconButton>
    </InputAdornment>
  )
}