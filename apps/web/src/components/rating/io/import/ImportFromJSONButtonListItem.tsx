import { ListItemIcon, ListItemText, MenuItem } from '@mui/material'
import type { FC } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import type { ListActions } from 'react-use/lib/useList'
import MdiJson from '~icons/mdi/code-json'
import { formatErrorMessage } from '../../../../utils/formatErrorMessage'
import type { PlayEntry } from '../../RatingCalculatorAddEntryForm'

export const ImportFromJSONButtonListItem: FC<{
  modifyEntries: ListActions<PlayEntry>
  onClose: () => void
}> = ({ modifyEntries, onClose }) => {
  const { t } = useTranslation(['rating-calculator'])

  return (
    <MenuItem
      onClick={() => {
        onClose()

        const input = document.createElement('input')
        input.type = 'file'
        input.accept = 'application/json'
        input.onchange = (event) => {
          const element = event.target as HTMLInputElement
          if (!element) return

          const file = element?.files ? element?.files[0] : undefined
          if (!file) return

          const reader = new FileReader()
          reader.onload = (event) => {
            const data = event.target?.result
            if (!data) return
            if (typeof data !== 'string') return

            try {
              const entries = JSON.parse(data)
              modifyEntries.set(entries)
              toast.success(t('rating-calculator:io.import.json.success', { count: entries.length }))
            } catch (error) {
              toast.error(t('rating-calculator:io.import.json.error', { error: formatErrorMessage(error) }))
            }
          }
          reader.readAsText(file)
        }
        input.click()
      }}
    >
      <ListItemIcon>
        <MdiJson />
      </ListItemIcon>
      <ListItemText>{t('rating-calculator:io.import.json.title')}</ListItemText>
    </MenuItem>
  )
}
