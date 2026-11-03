import { ListItemIcon, ListItemText, MenuItem } from '@mui/material'
import type { FC } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import MdiJson from '~icons/mdi/code-json'
import { useWebHaptics } from 'web-haptics/react'
import { formatErrorMessage } from '../../../../utils/formatErrorMessage'
import { createRatingImportTracker } from '@/lib/analytics'
import { parseRatingFile } from '@/models/scores/ratingEntriesFile'
import { useScoreRepository } from '@/models/scores/useScoreRepository'
import { importFileEntries } from './cloudImport'

export const ImportFromJSONButtonListItem: FC<{
  onClose: () => void
}> = ({ onClose }) => {
  const { t } = useTranslation(['rating-calculator'])
  const repository = useScoreRepository()
  const haptic = useWebHaptics()

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
          reader.onload = async (event) => {
            const data = event.target?.result
            if (!data) return
            if (typeof data !== 'string') return

            const analytics = createRatingImportTracker('json')
            const parsed = parseRatingFile(data)
            if (!parsed.success && parsed.reason === 'invalid-structure') {
              // Not a DXRating rating file: nothing of it is imported
              console.error('[ImportFromJSONButtonListItem] Invalid rating file', parsed.error)
              analytics.failed('invalid_file')
              toast.error(t('rating-calculator:io.import.json.invalid-file'))
              return
            }
            try {
              if (!parsed.success) throw parsed.error
              const { entries } = parsed
              // A cloud save asks to merge or clear first; `null`: the user cancelled
              if (!(await importFileEntries(repository, entries, { source: 'dxrating-json', mode: 'replace' }))) return
              analytics.succeeded(entries.length)
              haptic.trigger('success')
              toast.success(t('rating-calculator:io.import.json.success', { count: entries.length }))
            } catch (error) {
              analytics.failed('invalid_file')
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