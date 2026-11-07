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
import { announceImportLeftOut, cloudImportErrorMessage, importFileEntries } from './cloudImport'
import type { PlayEntry } from '../../RatingCalculatorAddEntryForm'
import { exportSavePicker } from '@/components/cloud-save/exportSavePicker'

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
              let entries: PlayEntry[]
              let fromCloudExport = false
              if ('cloudExport' in parsed) {
                // "Download my data": one save's records, as a rating file; their provenance is only claimed now
                const save = await exportSavePicker.request(parsed.cloudExport)
                if (!save) return
                entries = save.entries
                fromCloudExport = true
              } else {
                entries = parsed.entries
              }
              const result = await importFileEntries(repository, entries, { source: 'dxrating-json', mode: 'replace' })
              // `null`: the user cancelled the preview (local save) or the merge / clear-first choice (cloud save)
              if (!result) {
                analytics.failed('cancelled_by_user')
                toast(t('rating-calculator:io.import.review.cancelled'), { id: 'import-review-cancelled' })
                return
              }
              // A cloud save counts what the server took: entries that match no chart or that it rejects are left out
              analytics.succeeded(result.count)
              haptic.trigger('success')
              toast.success(t('rating-calculator:io.import.json.success', { count: result.count }))
              announceImportLeftOut(result, t, (message) => toast(message))
              // Only a cloud save verifies records; a local save keeps the provider each entry names
              if (fromCloudExport && repository.kind === 'cloud') {
                toast(t('rating-calculator:cloud-save.export-import.claimed-only'), {
                  id: 'cloud-export-claimed-only',
                  duration: 8_000,
                })
              }
            } catch (error) {
              analytics.failed('invalid_file')
              toast.error(
                cloudImportErrorMessage(error, t) ??
                  t('rating-calculator:io.import.json.error', { error: formatErrorMessage(error) }),
              )
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