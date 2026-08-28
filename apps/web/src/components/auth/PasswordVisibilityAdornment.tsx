import { IconButton, InputAdornment } from '@mui/material'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation(['auth'])
  const label = t(visible ? 'auth:password.hide-field' : 'auth:password.show-field', { field: fieldLabel })

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