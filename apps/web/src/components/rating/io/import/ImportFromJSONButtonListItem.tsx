import { ListItemIcon, ListItemText, MenuItem } from '@mui/material'
import type { FC } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import type { ListActions } from 'react-use/lib/useList'
import MdiJson from '~icons/mdi/code-json'
import { useWebHaptics } from 'web-haptics/react'
import { formatErrorMessage } from '../../../../utils/formatErrorMessage'
import { createRatingImportTracker } from '@/lib/analytics'
import type { PlayEntry } from '../../RatingCalculatorAddEntryForm'

export const ImportFromJSONButtonListItem: FC<{
  modifyEntries: ListActions<PlayEntry>
  onClose: () => void
}> = ({ modifyEntries, onClose }) => {
  const { t } = useTranslation(['rating-calculator'])
  const haptic = useWebHaptics()

  return (
    <MenuItem
      onClick={() => {
        onClose()

        const input = document.createElement('input')
        input.type = 'file'
        input.accept = 'application/json'
        input.addEventListener(
          'change',
          (event) => {
            const element = event.target
            if (!(element instanceof HTMLInputElement)) return

            const file = element?.files !== null ? element?.files[0] : undefined
            if (file === undefined) return

            const reader = new FileReader()
            reader.addEventListener(
              'load',
              (event) => {
                const data = event.target?.result
                if (data === null || data === undefined || data === '') return
                if (typeof data !== 'string') return

                const analytics = createRatingImportTracker('json')
                try {
                  const entries = JSON.parse(data)
                  if (!Array.isArray(entries)) throw new Error('Invalid rating entry list')
                  modifyEntries.set(entries)
                  analytics.succeeded(entries.length)
                  void haptic
                    .trigger('success')
                    ?.catch((error: unknown) => console.warn('Haptic feedback failed', error))
                  toast.success(t('rating-calculator:io.import.json.success', { count: entries.length }))
                } catch (error) {
                  analytics.failed('invalid_file')
                  toast.error(t('rating-calculator:io.import.json.error', { error: formatErrorMessage(error) }))
                }
              },
              { once: true },
            )
            reader.readAsText(file)
          },
          { once: true },
        )
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