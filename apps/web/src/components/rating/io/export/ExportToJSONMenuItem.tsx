import { ListItemIcon, ListItemText, MenuItem } from '@mui/material'
import type { FC } from 'react'
import toast from 'react-hot-toast'
import IconMdiFile from '~icons/mdi/file'
import { useLocale } from '@/i18n/LocaleProvider'
import { captureAnalyticsEvent } from '@/lib/analytics'
import { type RatingCalculatorEntry, useRatingEntries } from '../../useRatingEntries'
import { useScoreEntries } from '@/models/scores/useScoreRepository'
import { m } from '@/paraglide/messages'
import type { SupportedLocale } from '@/setup/locale'

const saveAsJsonFile = (data: string, locale: SupportedLocale) => {
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const name = `dxrating.export-${new Date().toISOString()}.json`
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)

  toast.success(m.ratingCalculator_io_export_toastSuccess({ name }, { locale }))
}

export const ExportToJSONMenuItem: FC = () => {
  const entries = useScoreEntries()
  const { isLoading, b15Entries, b35Entries } = useRatingEntries()
  const locale = useLocale()

  return (
    <>
      <MenuItem
        onClick={() => {
          saveAsJsonFile(JSON.stringify(entries), locale)
          captureAnalyticsEvent('rating_exported', {
            format: 'json',
            scope: 'all',
            entry_count: entries.length,
          })
        }}
      >
        <ListItemIcon>
          <IconMdiFile />
        </ListItemIcon>
        <ListItemText>{m.ratingCalculator_io_export_toJson_allRecords({}, { locale })}</ListItemText>
      </MenuItem>

      <MenuItem
        disabled={isLoading}
        onClick={() => {
          const preprocess = (entry: RatingCalculatorEntry) => ({
            sheetId: entry.sheetId,
            achievementRate: entry.achievementRate,
          })

          const data = JSON.stringify([...b35Entries.map(preprocess), ...b15Entries.map(preprocess)])
          saveAsJsonFile(data, locale)
          captureAnalyticsEvent('rating_exported', {
            format: 'json',
            scope: 'best_50',
            entry_count: b35Entries.length + b15Entries.length,
          })
        }}
      >
        <ListItemIcon>
          <IconMdiFile />
        </ListItemIcon>
        <ListItemText>{m.ratingCalculator_io_export_toJson_b50Records({}, { locale })}</ListItemText>
      </MenuItem>
    </>
  )
}