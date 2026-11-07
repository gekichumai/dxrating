import { ListItemIcon, ListItemText, MenuItem } from '@mui/material'
import type { FC } from 'react'
import toast from 'react-hot-toast'
import MdiJson from '~icons/mdi/code-json'
import { useWebHaptics } from 'web-haptics/react'
import { formatErrorMessage } from '../../../../utils/formatErrorMessage'
import { createRatingImportTracker } from '@/lib/analytics'
import { parseRatingFile } from '@/models/scores/ratingEntriesFile'
import { useScoreRepository } from '@/models/scores/useScoreRepository'
import { reviewAndApplyImport } from '@/models/scores/importReview'
import { useLocale } from '@/i18n/LocaleProvider'
import { m } from '@/paraglide/messages'

export const ImportFromJSONButtonListItem: FC<{
  onClose: () => void
}> = ({ onClose }) => {
  const locale = useLocale()
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
              toast.error(m.ratingCalculator_io_import_json_invalidFile({}, { locale }))
              return
            }
            try {
              if (!parsed.success) throw parsed.error
              const { entries } = parsed
              const { applied } = await reviewAndApplyImport(
                repository,
                entries,
                { source: 'dxrating-json', mode: 'replace' },
                { trigger: 'manual' },
              )
              if (!applied) {
                analytics.failed('cancelled_by_user')
                toast(m.ratingCalculator_io_import_review_cancelled({}, { locale }), { id: 'import-review-cancelled' })
                return
              }
              analytics.succeeded(entries.length)
              haptic.trigger('success')
              toast.success(m.ratingCalculator_io_import_json_success({ count: entries.length }, { locale }))
            } catch (error) {
              analytics.failed('invalid_file')
              toast.error(m.ratingCalculator_io_import_json_error({ error: formatErrorMessage(error) }, { locale }))
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
      <ListItemText>{m.ratingCalculator_io_import_json_title({}, { locale })}</ListItemText>
    </MenuItem>
  )
}